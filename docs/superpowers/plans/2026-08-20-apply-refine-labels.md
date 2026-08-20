# Batch-Dispatch Refine Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/claude-tweaks:backlog refine`'s one-`gh`-command-per-record paste blocks with a single dispatched CLI call that applies a whole lane's label/comment changes at once, while keeping per-record auditability.

**Architecture:** A new standalone CLI, `plugin/bin/apply-refine-labels.js`, follows the existing `materialize.js`/`claim-targets.js` pattern (`run(argv, deps)`, injectable `gh` runner, `--run-dir`-style anchoring guard). It reads a JSON array of `{ issue, addLabels?, removeLabels?, commentFile? }` actions and applies each with `gh issue edit`/`gh issue comment`, logging one `decisions.md` AUTO line per successfully-applied action when `--run <dir>` is given. `skills/backlog/refine-lanes.md`'s five "Accepted defaults, paste-ready" blocks are updated to write that JSON to `/tmp` (alongside the module's existing `/tmp/backlog-refine-*.json` artifacts) and render one CLI invocation instead of N `gh` lines.

**Tech Stack:** Node.js (`child_process.execFileSync`), `gh` CLI, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T142933-record-844/work/844-spec.md` (GitHub issue #844)

## Global Constraints

- `npm test` must pass — the full suite, not just the new test file.
- New CLI follows this repo's injectable-runner convention: all I/O (`gh`, `git`, filesystem) through a `deps` object; tests never touch real `gh`/`git`.
- `--run <dir>`, when given, must be anchored under the main checkout (never a worktree-relative shadow) per `_shared/pipeline-run-dir.md`'s Anchoring section — reject loudly (exit 2), mirroring `bin/materialize.js`'s `--run-dir` guard, before any `gh` call.
- Exit codes: 0 = ran to completion (per-action `failed` entries do not abort the batch), 1 = actions file missing/malformed, 2 = bad invocation, unanchored `--run`, or missing `gh`.
- Never restate the anchoring rationale prose — cite `_shared/pipeline-run-dir.md`.

---

### Task 1: `apply-refine-labels.js` — batch CLI with `gh` dispatch and `--run` anchoring

**Files:**
- Create: `plugin/bin/apply-refine-labels.js`
- Test: `tests/apply-refine-labels.test.js`

**Interfaces:**
- Consumes: `plugin/bin/lib/hooks/worktree-detect.js`'s `mainCheckoutRoot(cwd)`, `isAnchoredUnderRoot(resolvedPath, mainRoot)`, `unanchoredRunDirNoRepoMessage(cwd)`, `unanchoredRunDirShadowMessage(runDirArg, mainRoot)` (already exported — see `plugin/bin/materialize.js`'s identical use). `plugin/bin/lib/log-decision/append.js`'s `appendEntry({runDir, section, entry})` and `formatEntry({status, now, step, text, reversibility})` (already exported).
- Produces: `module.exports = { run, parseArgs, validateAction }` — `run(argv, deps)` returns an exit code (number). `deps` shape: `{ gh(args)->string, ghAvailable()->bool, remoteUrl()->string, readFile(path)->string, cwd()->string, mainRoot(cwd)->string|null, isAnchored(resolvedPath, mainRoot)->bool, now()->number, appendEntry(...), stdout(s), stderr(s) }`. Task 2 (refine-lanes.md) invokes this CLI's compiled behavior via `node "${CLAUDE_PLUGIN_ROOT}/bin/apply-refine-labels.js" <actions.json> --run <dir>` — no direct `require()` coupling from the skill prose, only the CLI usage string.

**Actions JSON contract** (the "structured intermediate" from #844's Deliverable 1): a JSON array where each element is
```json
{ "issue": 118, "addLabels": ["auto:build"], "removeLabels": ["bot:blocked"], "commentFile": "/tmp/backlog-refine-flagback-118.md" }
```
`issue` is required; at least one of `addLabels` (non-empty array), `removeLabels` (non-empty array), `commentFile` (non-empty string path) is required. `commentFile` is applied via `gh issue comment --body-file`, matching the existing `--body-file /tmp/backlog-refine-*.md` convention already used by the Flag-back/Dependency-repair lanes.

- [ ] **Step 1: Write the failing tests for arg parsing and validation**

```javascript
// tests/apply-refine-labels.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { run, parseArgs, validateAction } = require('../plugin/bin/apply-refine-labels');

test('parseArgs: missing actions-file argument is an error', () => {
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(['--run', '/tmp/x']).error);
});

test('parseArgs: --help short-circuits before the positional is required', () => {
  assert.strictEqual(parseArgs(['--help']).help, true);
});

test('parseArgs: unknown flag is an error', () => {
  assert.match(parseArgs(['actions.json', '--bogus']).error, /unknown argument/);
});

test('validateAction: rejects a non-integer issue', () => {
  assert.match(validateAction({ issue: 'x', addLabels: ['a'] }, 0), /must be a positive integer/);
});

test('validateAction: rejects an action with no add/remove/comment', () => {
  assert.match(validateAction({ issue: 1 }, 0), /must set addLabels, removeLabels, or commentFile/);
});

test('validateAction: accepts addLabels only, removeLabels only, or commentFile only', () => {
  assert.strictEqual(validateAction({ issue: 1, addLabels: ['a'] }, 0), null);
  assert.strictEqual(validateAction({ issue: 1, removeLabels: ['a'] }, 0), null);
  assert.strictEqual(validateAction({ issue: 1, commentFile: '/tmp/x.md' }, 0), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/apply-refine-labels.test.js`
Expected: FAIL — `Cannot find module '../plugin/bin/apply-refine-labels'`.

- [ ] **Step 3: Implement `parseArgs` and `validateAction`**

```javascript
#!/usr/bin/env node
// bin/apply-refine-labels.js — apply a batch of `gh issue edit`/`gh issue
// comment` actions from one structured JSON intermediate in a single
// dispatched call, replacing backlog refine's one-paste-line-per-record
// blocks (#844). Follows bin/materialize.js's run(argv, deps) + injectable-
// runner + --run anchoring pattern (gh-api-module-pattern skill).
//   node bin/apply-refine-labels.js <actions.json> [--run <run-dir>] [--repo owner/name] [--help]
// actions.json: a JSON array of
//   { issue: number, addLabels?: string[], removeLabels?: string[], commentFile?: string }
// — each action needs at least one of addLabels/removeLabels/commentFile.
// `--run <run-dir>` is optional: when given, one AUTO decisions.md line is
// appended per successfully-applied action, under the /backlog heading — the
// run dir must resolve under the main checkout (#790/[IL-127]), refused
// loudly otherwise, before any `gh` call.
// Exit 0 with a {ok, failed} JSON summary on stdout — one failed action never
// aborts the batch; 1 when the actions file can't be read or is malformed;
// 2 on a bad invocation, an unanchored --run, or a missing `gh`.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const wtDetect = require('./lib/hooks/worktree-detect');
const { appendEntry, formatEntry } = require('./lib/log-decision/append');

const USAGE = 'usage: apply-refine-labels.js <actions.json> [--run <run-dir>] [--repo owner/name] [--help]\n';

function parseArgs(argv) {
  const opts = { file: null, run: null, repo: null, help: false };
  if (argv[0] === '--help' || argv[0] === '-h') { opts.help = true; return opts; }
  if (argv[0] === undefined || argv[0].startsWith('--')) return { error: 'missing <actions.json> argument' };
  opts.file = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--run') opts.run = next();
    else if (a === '--repo') opts.repo = next();
    else return { error: `unknown argument: ${a}` };
  }
  return opts;
}

function parseRepo(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

function isPosInt(n) { return Number.isInteger(n) && n > 0; }

function validateAction(a, i) {
  if (!a || typeof a !== 'object') return `action[${i}]: not an object`;
  if (!isPosInt(a.issue)) return `action[${i}]: issue must be a positive integer`;
  const hasAdd = Array.isArray(a.addLabels) && a.addLabels.length > 0;
  const hasRemove = Array.isArray(a.removeLabels) && a.removeLabels.length > 0;
  const hasComment = typeof a.commentFile === 'string' && a.commentFile.trim() !== '';
  if (!hasAdd && !hasRemove && !hasComment) return `action[${i}] (#${a.issue}): must set addLabels, removeLabels, or commentFile`;
  return null;
}

module.exports = { parseArgs, validateAction, USAGE };
```

(Leave `run`/`realDeps`/the `require.main` guard for Step 6 below — this step only needs `parseArgs`/`validateAction` to exist for Step 4's tests to run.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/apply-refine-labels.test.js`
Expected: PASS (5 tests). `run` is not yet exported/tested — fine, later steps add it.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/apply-refine-labels.js tests/apply-refine-labels.test.js
git commit -m "Add apply-refine-labels.js arg parsing and action validation (#844)"
```

- [ ] **Step 6: Write the failing tests for `run()`'s file/JSON handling, gh dispatch, and partial-failure isolation**

```javascript
// append to tests/apply-refine-labels.test.js

function fakeDeps(overrides = {}) {
  const calls = { gh: [], ghAvailable: 0, stderr: [], stdout: [], appendEntry: [] };
  return {
    calls,
    gh: (args) => { calls.gh.push(args); return ''; },
    ghAvailable: () => { calls.ghAvailable += 1; return true; },
    remoteUrl: () => 'https://github.com/acme/widgets.git',
    readFile: () => { throw new Error('readFile not stubbed for this test'); },
    cwd: () => '/repo',
    mainRoot: () => '/repo',
    isAnchored: () => true,
    now: () => 1700000000000,
    appendEntry: (a) => { calls.appendEntry.push(a); },
    stdout: (s) => { calls.stdout.push(s); },
    stderr: (s) => { calls.stderr.push(s); },
    ...overrides,
  };
}

test('run: actions file that fails to read exits 1', () => {
  const deps = fakeDeps({ readFile: () => { throw new Error('ENOENT'); } });
  const code = run(['missing.json'], deps);
  assert.strictEqual(code, 1);
  assert.match(deps.calls.stderr.join(''), /could not read/);
});

test('run: actions file with invalid JSON exits 1', () => {
  const deps = fakeDeps({ readFile: () => '{not json' });
  const code = run(['bad.json'], deps);
  assert.strictEqual(code, 1);
  assert.match(deps.calls.stderr.join(''), /not valid JSON/);
});

test('run: empty array exits 1', () => {
  const deps = fakeDeps({ readFile: () => '[]' });
  const code = run(['empty.json'], deps);
  assert.strictEqual(code, 1);
  assert.match(deps.calls.stderr.join(''), /non-empty JSON array/);
});

test('run: an invalid action anywhere in the array exits 1 before any gh call', () => {
  const deps = fakeDeps({ readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }, { issue: 2 }]) });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 1);
  assert.strictEqual(deps.calls.gh.length, 0);
});

test('run: applies addLabels and removeLabels via one gh issue edit call, resolving repo from git remote', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 118, addLabels: ['auto:build'], removeLabels: ['bot:blocked'] }]),
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(deps.calls.gh, [
    ['issue', 'edit', '118', '--repo', 'acme/widgets', '--add-label', 'auto:build', '--remove-label', 'bot:blocked'],
  ]);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary, { ok: [118], failed: [] });
});

test('run: commentFile action calls gh issue comment --body-file', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 201, removeLabels: ['ready'], commentFile: '/tmp/backlog-refine-flagback-201.md' }]),
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(deps.calls.gh, [
    ['issue', 'edit', '201', '--repo', 'acme/widgets', '--remove-label', 'ready'],
    ['issue', 'comment', '201', '--repo', 'acme/widgets', '--body-file', '/tmp/backlog-refine-flagback-201.md'],
  ]);
});

test('run: --repo flag overrides remote-derived owner/repo, and remoteUrl is never called', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 5, addLabels: ['x'] }]),
    remoteUrl: () => { throw new Error('remoteUrl should not be called when --repo is passed'); },
  });
  const code = run(['actions.json', '--repo', 'other/repo'], deps);
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(deps.calls.gh[0], ['issue', 'edit', '5', '--repo', 'other/repo', '--add-label', 'x']);
});

test('run: one failed gh call is isolated — other actions still apply, failure reported in the summary', () => {
  let call = 0;
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }, { issue: 2, addLabels: ['b'] }]),
    gh: (args) => {
      call += 1;
      if (call === 1) { const e = new Error('HTTP 404'); throw e; }
      return '';
    },
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary.ok, [2]);
  assert.strictEqual(summary.failed.length, 1);
  assert.strictEqual(summary.failed[0].issue, 1);
  assert.match(summary.failed[0].error, /HTTP 404/);
});

test('run: no owner/repo resolvable from --repo or git remote exits 2', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }]),
    remoteUrl: () => 'not-a-github-url',
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /could not resolve owner\/repo/);
});

test('run: gh not available exits 2 before reading the actions file', () => {
  const deps = fakeDeps({ ghAvailable: () => false, readFile: () => { throw new Error('must not be called'); } });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /`gh` is required/);
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `node --test tests/apply-refine-labels.test.js`
Expected: FAIL — `run` is not exported yet.

- [ ] **Step 8: Implement `run(argv, deps)` and `realDeps`**

```javascript
// append to plugin/bin/apply-refine-labels.js, replacing the Step 3 module.exports line

const realDeps = {
  gh: (args) => execFileSync('gh', args, { encoding: 'utf8' }),
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
  remoteUrl: () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }),
  readFile: (f) => fs.readFileSync(f, 'utf8'),
  cwd: () => process.cwd(),
  mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
  isAnchored: (resolvedPath, mainRoot) => wtDetect.isAnchoredUnderRoot(resolvedPath, mainRoot),
  now: () => Date.now(),
  appendEntry,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps so tests never touch gh, git, or the filesystem.
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 2; }
  if (opts.help) { deps.stdout(USAGE); return 0; }

  let runDir = null;
  if (opts.run) {
    const cwd = deps.cwd();
    const mainRoot = deps.mainRoot(cwd);
    if (!mainRoot) {
      deps.stderr(`apply-refine-labels.js: ${wtDetect.unanchoredRunDirNoRepoMessage(cwd)}\n`);
      return 2;
    }
    const resolved = path.resolve(cwd, opts.run);
    if (!deps.isAnchored(resolved, mainRoot)) {
      deps.stderr(`apply-refine-labels.js: ${wtDetect.unanchoredRunDirShadowMessage(opts.run, mainRoot)}\n`);
      return 2;
    }
    runDir = resolved;
  }

  if (!deps.ghAvailable()) { deps.stderr('apply-refine-labels.js: `gh` is required\n'); return 2; }

  let raw;
  try { raw = deps.readFile(opts.file); } catch (err) {
    deps.stderr(`apply-refine-labels.js: could not read ${opts.file} (${err && err.message ? err.message : err})\n`);
    return 1;
  }
  let actions;
  try { actions = JSON.parse(raw); } catch (err) {
    deps.stderr(`apply-refine-labels.js: ${opts.file} is not valid JSON (${err && err.message ? err.message : err})\n`);
    return 1;
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    deps.stderr(`apply-refine-labels.js: ${opts.file} must be a non-empty JSON array of actions\n`);
    return 1;
  }
  for (let i = 0; i < actions.length; i++) {
    const err = validateAction(actions[i], i);
    if (err) { deps.stderr(`apply-refine-labels.js: ${err}\n`); return 1; }
  }

  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('apply-refine-labels.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const repoFlag = `${repoSpec.owner}/${repoSpec.repo}`;

  const ok = [];
  const failed = [];
  for (const action of actions) {
    try {
      const hasAdd = Array.isArray(action.addLabels) && action.addLabels.length > 0;
      const hasRemove = Array.isArray(action.removeLabels) && action.removeLabels.length > 0;
      if (hasAdd || hasRemove) {
        const editArgs = ['issue', 'edit', String(action.issue), '--repo', repoFlag];
        for (const l of action.addLabels || []) editArgs.push('--add-label', l);
        for (const l of action.removeLabels || []) editArgs.push('--remove-label', l);
        deps.gh(editArgs);
      }
      if (action.commentFile) {
        deps.gh(['issue', 'comment', String(action.issue), '--repo', repoFlag, '--body-file', action.commentFile]);
      }
      ok.push(action.issue);
      if (runDir) {
        const summaryParts = [];
        if (hasAdd) summaryParts.push(`+${action.addLabels.join(' +')}`);
        if (hasRemove) summaryParts.push(`-${action.removeLabels.join(' -')}`);
        if (action.commentFile) summaryParts.push('comment posted');
        try {
          deps.appendEntry({
            runDir,
            section: '/backlog',
            entry: formatEntry({
              status: 'AUTO',
              now: deps.now(),
              step: 'apply-refine-labels',
              text: `#${action.issue}: applied ${summaryParts.join(', ')}`,
              reversibility: 'high',
            }),
          });
        } catch { /* logging is best-effort — never fails the batch */ }
      }
    } catch (err) {
      const message = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).join(' ') || String(err);
      failed.push({ issue: action.issue, error: message });
    }
  }

  deps.stdout(JSON.stringify({ ok, failed }, null, 2) + '\n');
  return 0;
}

module.exports = { run, parseArgs, validateAction };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node --test tests/apply-refine-labels.test.js`
Expected: PASS (all tests from Steps 1 and 6).

- [ ] **Step 10: Commit**

```bash
git add plugin/bin/apply-refine-labels.js tests/apply-refine-labels.test.js
git commit -m "Implement apply-refine-labels.js run() — batch gh dispatch, partial-failure isolation (#844)"
```

---

### Task 2: `--run` anchoring guard tests (mirrors `materialize-run-dir-anchoring.test.js`)

**Files:**
- Create: `tests/apply-refine-labels-run-dir-anchoring.test.js`

**Interfaces:**
- Consumes: `plugin/bin/apply-refine-labels.js`'s `run(argv, deps)` (Task 1), `tests/helpers/git-fixtures.js`'s `gitRepo()`/`linkedWorktreeOf()`, `plugin/bin/lib/hooks/worktree-detect.js`.
- Produces: nothing new — this task only adds test coverage for the anchoring branch Task 1's Step 8 already implements structurally (same code path `materialize.js` uses), proving it end-to-end against real git fixtures rather than only the string-level fakes in Task 1's Step 6.

- [ ] **Step 1: Write the failing anchoring tests**

```javascript
// tests/apply-refine-labels-run-dir-anchoring.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');
const wtDetect = require('../plugin/bin/lib/hooks/worktree-detect');
const { run } = require('../plugin/bin/apply-refine-labels');

function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(prev); }
}

function fakeDeps(overrides = {}) {
  const calls = { ghAvailable: 0, stderr: [] };
  return {
    calls,
    ghAvailable: () => { calls.ghAvailable += 1; return false; }, // stop right after, if reached
    gh: () => { throw new Error('gh should never be called when --run is rejected'); },
    readFile: () => { throw new Error('readFile should never be called when --run is rejected'); },
    remoteUrl: () => { throw new Error('remoteUrl should never be called in these tests'); },
    cwd: () => process.cwd(),
    mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
    isAnchored: (resolvedPath, mainRoot) => wtDetect.isAnchoredUnderRoot(resolvedPath, mainRoot),
    stdout: () => {},
    stderr: (s) => { calls.stderr.push(s); },
    ...overrides,
  };
}

test('reject: --run resolves inside the linked worktree, not the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  const abs = path.join(wt, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['actions.json', '--run', abs], deps));
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0, 'must reject before ever checking gh availability');
});

test('accept: --run is absolute and anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  const abs = path.join(main, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['actions.json', '--run', abs], deps));
  // Rejected downstream by the stubbed ghAvailable()=false, NOT by anchoring.
  assert.strictEqual(code, 2);
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a correctly anchored --run must reach the gh-availability check');
});

test('reject: --run has no git repo ancestor at all — distinct message', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-apply-refine-norepo-'));
  const deps = fakeDeps();
  const abs = path.join(bare, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(bare, () => run(['actions.json', '--run', abs], deps));
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /could not determine the git repository root/i);
  assert.strictEqual(deps.calls.ghAvailable, 0);
});

test('run with no --run flag skips the anchoring check entirely (optional flag)', () => {
  const main = gitRepo();
  const deps = fakeDeps({ ghAvailable: () => { deps.calls.ghAvailable += 1; return false; } });
  const code = withCwd(main, () => run(['actions.json'], deps));
  assert.strictEqual(code, 2); // stops at the stubbed ghAvailable()=false, having never touched --run logic
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside|could not determine/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail or pass**

Run: `node --test tests/apply-refine-labels-run-dir-anchoring.test.js`
Expected: since Task 1 already implements the anchoring branch, these should PASS immediately — this step is a verification run, not a red/green cycle. If any fail, fix `apply-refine-labels.js`'s anchoring block (Task 1 Step 8) to match, then re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/apply-refine-labels-run-dir-anchoring.test.js
git commit -m "Add apply-refine-labels.js --run anchoring test coverage against real git fixtures (#844)"
```

---

### Task 3: Update `refine-lanes.md`'s five paste-ready blocks to the batch-dispatch form

**Files:**
- Modify: `plugin/skills/backlog/refine-lanes.md` (five "Accepted defaults, paste-ready" sections: Re-authorize, Grant, Flag-back, Priority, Dependency repair)

**Interfaces:**
- Consumes: Task 1's `apply-refine-labels.js` CLI usage: `node "${CLAUDE_PLUGIN_ROOT}/bin/apply-refine-labels.js" <actions.json> --run <dir>`.
- Produces: nothing consumed elsewhere in this plan — this is the skill-prose half of the fix (Deliverable 2 of #844).

- [ ] **Step 1: Replace the Re-authorize lane's paste-ready block**

In `plugin/skills/backlog/refine-lanes.md`, find (around line 45-52):

```
Accepted defaults, paste-ready (Step 5's Grant-rows mechanics, `bot:blocked`→`auto:build` branch —
bootstrap comment lives there, not repeated here):

```bash
── Re-authorize ──
# Terminal — #118
gh issue edit 118 --remove-label bot:blocked --add-label auto:build
```
```

Replace with (write the lane's rows to a structured actions file, then one CLI call applies the whole lane):

```
Accepted defaults, paste-ready (Step 5's Grant-rows mechanics, `bot:blocked`→`auto:build` branch —
bootstrap comment lives there, not repeated here). Write every re-authorize row's action to
`/tmp/backlog-refine-actions-reauthorize.json` (one `{issue, addLabels, removeLabels}` object per
row — `addLabels: ["auto:build"], removeLabels: ["bot:blocked"]` for every row in this lane, per
record `issue`), then apply the whole lane in one call:

```bash
── Re-authorize ──
node "${CLAUDE_PLUGIN_ROOT}/bin/apply-refine-labels.js" /tmp/backlog-refine-actions-reauthorize.json --run "$RUN_DIR"
```
```

- [ ] **Step 2: Replace the Grant lane's paste-ready block**

Find (around line 73-80):

```
Accepted defaults, paste-ready (Step 5's Grant-rows mechanics — bootstrap comment lives there, not
repeated here):

```bash
── Grant ──
# Terminal — #124
gh issue edit 124 --add-label auto:build --add-label auto:merge
```
```

Replace with:

```
Accepted defaults, paste-ready (Step 5's Grant-rows mechanics — bootstrap comment lives there, not
repeated here). Write every grant row's action to `/tmp/backlog-refine-actions-grant.json`
(`addLabels: ["auto:build"]`, or `["auto:build", "auto:merge"]` when `RECOMMEND_MERGE` was also
`true`, per record `issue`), then apply the whole lane in one call:

```bash
── Grant ──
node "${CLAUDE_PLUGIN_ROOT}/bin/apply-refine-labels.js" /tmp/backlog-refine-actions-grant.json --run "$RUN_DIR"
```
```

- [ ] **Step 3: Replace the Flag-back lane's paste-ready block**

Find (around line 140-148):

```
Accepted defaults, paste-ready (Step 5's Flag-back-rows mechanics — bootstrap comment lives there,
not repeated here):

```bash
── Flag-back ──
# Terminal — #201
gh issue edit 201 --remove-label ready
gh issue comment 201 --body-file /tmp/backlog-refine-flagback-201.md
```
```

Replace with:

```
Accepted defaults, paste-ready (Step 5's Flag-back-rows mechanics — bootstrap comment lives there,
not repeated here). Write every flag-back row's action to `/tmp/backlog-refine-actions-flagback.json`
(`removeLabels: ["ready"], commentFile: "/tmp/backlog-refine-flagback-{issue}.md"` per record —
the per-record flagback body file is still written exactly as before, just referenced by path
instead of pasted as its own `gh issue comment` line), then apply the whole lane in one call:

```bash
── Flag-back ──
node "${CLAUDE_PLUGIN_ROOT}/bin/apply-refine-labels.js" /tmp/backlog-refine-actions-flagback.json --run "$RUN_DIR"
```
```

- [ ] **Step 4: Replace the Priority lane's paste-ready block**

Find (around line 182-189):

```
Accepted defaults, paste-ready (Step 5's Priority/Related-rows mechanics — bootstrap comment lives
there, not repeated here):

```bash
── Priority ──
# Terminal — #123
gh issue edit 123 --add-label priority:high
```
```

Replace with:

```
Accepted defaults, paste-ready (Step 5's Priority/Related-rows mechanics — bootstrap comment lives
there, not repeated here). Write every priority row's action to
`/tmp/backlog-refine-actions-priority.json` (`addLabels: ["priority:{tier}"]` per record — a
Related-only row with no priority tier omits `addLabels` and only sets whatever the Related body
rewrite needs, per that row's own mechanics), then apply the whole lane in one call:

```bash
── Priority ──
node "${CLAUDE_PLUGIN_ROOT}/bin/apply-refine-labels.js" /tmp/backlog-refine-actions-priority.json --run "$RUN_DIR"
```
```

- [ ] **Step 5: Replace the Dependency-repair lane's paste-ready block**

Find (around line 218-225):

```
Accepted defaults, paste-ready (Step 5's Dependency-repair-rows mechanics, both `work-links`
branches — not repeated here):

```bash
── Dependency repair ──
# Terminal — #420 (work-links: body-text)
gh issue edit 420 --body-file /tmp/backlog-refine-body-420.md
```
```

Replace with:

```
Accepted defaults, paste-ready (Step 5's Dependency-repair-rows mechanics, both `work-links`
branches — not repeated here). Write every mechanical-repair row's action to
`/tmp/backlog-refine-actions-deprepair.json` (`commentFile` is not used here — a body *rewrite*,
not a comment, so this lane's action instead sets `bodyFile: "/tmp/backlog-refine-body-{issue}.md"`
when `work-links: body-text`; the `work-links: native` branch has no body-text mechanic to batch and
is unchanged). This lane's per-record body rewrite is not a label/comment action, so it keeps its
own paste-ready form rather than routing through `apply-refine-labels.js`:

```bash
── Dependency repair ──
# Terminal — #420 (work-links: body-text)
gh issue edit 420 --body-file /tmp/backlog-refine-body-420.md
```
```

**Note on Step 5:** `apply-refine-labels.js`'s actions contract only covers `addLabels`/`removeLabels`/`commentFile` — a body *rewrite* (`--body-file` on `gh issue edit`, not `gh issue comment`) is a different `gh` shape the CLI does not support, and this lane's rows are typically few (Task 4's audit below confirms whether this is worth extending later). Leave this lane's block as today's per-record form; do not force a batch shape onto an operation the CLI doesn't do. Record this as a known scope boundary, not a silent gap — the confirm gate below states it explicitly.

- [ ] **Step 6: Update the confirm gate / lane summary line if it references the old per-record command shape**

Search `plugin/skills/backlog/refine-lanes.md` for any other prose describing "one `gh issue edit`/`gh issue comment` pair per record" (the file's own opening description, line ~3-4) and update it to describe the new batch form for the four lanes that changed, noting the Dependency-repair exception from Step 5.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/backlog/refine-lanes.md
git commit -m "Route backlog refine's Re-authorize/Grant/Flag-back/Priority lanes through apply-refine-labels.js (#844)"
```

---

### Task 4: Audit other lane-rendering skills for the same pattern

**Files:**
- Read (audit only, no required changes unless the pattern is confirmed): `plugin/skills/_shared/upstream-feedback-batch.md`, `plugin/skills/wrap-up/review-console.md` (and any `review-console-*.md` siblings), `plugin/skills/_shared/console-execution.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: either (a) confirmation that none of these render a one-`gh`-command-per-record paste block (most likely, given `_shared/upstream-feedback-batch.md`'s name suggests it already batches), or (b) a follow-up note in the spec's own body / a fresh backlog record if a real instance is found — per Common Step 4's "Follow-up ideas" rule (`/build`'s own contract), do not expand this build's scope to fix a second file found mid-build; capture it instead.

- [ ] **Step 1: Read `_shared/upstream-feedback-batch.md` in full**

Check whether it renders one `gh` command (or one paste block) per record, or an already-batched form. Note the finding.

- [ ] **Step 2: Read `wrap-up/review-console.md` (and `review-console-interactive.md`/`review-console-execution.md` if present) for its paste-ready rendering**

Check the Review Console's own accepted-defaults rendering for the same one-line-per-item pattern refine-lanes.md had.

- [ ] **Step 3: Read `_shared/console-execution.md` in full**

Check whether it's the shared execution primitive the Review Console and other consoles already route through, and whether it already has (or lacks) a batch-dispatch shape.

- [ ] **Step 4: Record the audit finding**

Append one short paragraph to the materialized spec file at
`.claude-tweaks/pipelines/2026-08-20T142933-record-844/work/844-spec.md`, under a new `## Audit: other lane-rendering skills` heading, stating what Steps 1-3 found for each of the three files — confirmed batched already / confirmed same pattern found (name the file + line) / not applicable (no per-record paste block at all). If a real instance of the same pattern is found, do NOT fix it in this build — file a fresh backlog record via `/claude-tweaks:capture` referencing #844 and note the record number in this same paragraph instead.

- [ ] **Step 5: Commit**

```bash
git add .claude-tweaks/pipelines/2026-08-20T142933-record-844/work/844-spec.md
git commit -m "Audit other lane-rendering skills for the one-line-per-record paste pattern (#844)"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Deliverable 1 (decide + build the shape) → Task 1. Deliverable 2 (update refine-lanes.md templates) → Task 3. Deliverable 3 (audit other lane-rendering skills) → Task 4. Acceptance Criterion 1 (fewer pastes) → satisfied by Task 3's one-CLI-call-per-lane form. Acceptance Criterion 2 (per-record auditability preserved) → satisfied by the `decisions.md` AUTO line per action (Task 1) plus the `{ok, failed}` JSON summary naming every issue. Acceptance Criterion 3 (tests + npm test) → Tasks 1-2's test files + this plan's final verification step (Common Step 5, owned by `/build`, not a plan task).
- **Type consistency:** `run(argv, deps)` return type (number exit code) and `{ok: number[], failed: {issue, error}[]}` summary shape are used identically across Tasks 1-2's tests and Task 3's CLI usage line.
