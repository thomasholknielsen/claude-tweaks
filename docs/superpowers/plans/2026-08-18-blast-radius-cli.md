# Blast-Radius CLI (record #888) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `merge-check.md` Step 1's prose-guarded shell choreography with a single hard-failing `bin/blast-radius.js` CLI so an unresolvable merge base can never silently read as a zero-file diff that clears every auto-merge threshold.

**Architecture:** A pure-logic module `plugin/bin/lib/blast-radius-cli.js` (injectable `git` runner, reusing `bin/lib/issues/blast-radius.js` for classification and `bin/lib/policy-schema.js#resolvePolicyKeys` for config) wrapped by a thin CLI shell `plugin/bin/blast-radius.js` (argv parsing, exit codes, stderr). `merge-check.md` Step 1 collapses to one fenced command bound to an extract-and-run conformance test.

**Tech Stack:** Node 18+ built-ins only (`child_process.execFileSync`, `fs`), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-18T151433-spec-888-889/spec-888/work/888-spec.md`

## Global Constraints

- Zero runtime npm deps (matches every `plugin/bin/*.js` CLI).
- `classifyDiffFiles`/`blastRadiusSummary` stay the single classification implementation — consumed, never reimplemented.
- No code path may emit a summary JSON when merge-base resolution failed: failure = non-zero exit + stderr + **no stdout**.
- Commit messages use `refs #888`, never `closes/fixes` (issue closes via the PR's own `Fixes` lines).
- Skill prose keeps the `${CLAUDE_PLUGIN_ROOT}` spelling (docs/skill-authoring.md, "Plugin-root references").
- Surgical edits: do not reformat adjacent prose or code.

---

### Task 1: `plugin/bin/lib/blast-radius-cli.js` — pure logic with injectable git runner

**Files:**
- Create: `plugin/bin/lib/blast-radius-cli.js`
- Test: `tests/bin-lib/blast-radius-cli.test.js`

**Interfaces:**
- Consumes: `classifyDiffFiles(files, sensitivePaths)` and `blastRadiusSummary(classified)` from `plugin/bin/lib/issues/blast-radius.js`; `resolvePolicyKeys(keys, {policyRaw, runConfigRaw})` from `plugin/bin/lib/policy-schema.js` (returns `{[key]: {value, source, ...}}`; `merge-sensitive-paths` is a `list`-typed key — its resolved `value` may be an array or a comma-separated string depending on how the policy file wrote it; handle both).
- Produces: `computeBlastRadius(opts, deps) -> { mergeBase, config: { mergeSensitivePaths: string[], autoMergeMaxLines: number, autoMergeMaxFiles: number }, summary: { implLines, testLines, implFiles, testFiles, sensitiveFilesTouched } }`. Throws `BlastRadiusError` (exported; has `.message`) on any resolution failure. `opts = { base?: string, integrationBranch?: string, runDir?: string|null }`; `deps = { git?: (args: string[]) => string, readFile?: (path) => string|null }`.

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/blast-radius-cli.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { computeBlastRadius, BlastRadiusError, parseNumstat } = require(
  path.join(__dirname, '..', '..', 'plugin', 'bin', 'lib', 'blast-radius-cli.js')
);

const SHA = 'a'.repeat(40);

// A fake git runner keyed by the subcommand (argv[0]). Records calls.
function fakeGit(handlers) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    const handler = handlers[args[0]];
    if (!handler) throw new Error(`unexpected git ${args.join(' ')}`);
    return handler(args);
  };
  git.calls = calls;
  return git;
}

test('happy path: derives merge base from integration branch, classifies, resolves config', () => {
  const git = fakeGit({
    'merge-base': () => `${SHA}\n`,
    diff: () => '10\t2\tplugin/bin/foo.js\n5\t0\ttests/foo.test.js\n',
    'rev-parse': () => '/repo\n',
  });
  const readFile = (p) => (p.endsWith('policy.yml')
    ? 'merge-sensitive-paths: plugin/bin/hooks.js\nauto-merge-max-lines: 50\n'
    : null);
  const out = computeBlastRadius({ integrationBranch: 'main' }, { git, readFile });
  assert.strictEqual(out.mergeBase, SHA);
  assert.strictEqual(out.summary.implLines, 12);
  assert.strictEqual(out.summary.implFiles, 1);
  assert.strictEqual(out.summary.testLines, 5);
  assert.strictEqual(out.summary.testFiles, 1);
  assert.deepStrictEqual(out.summary.sensitiveFilesTouched, []);
  assert.strictEqual(out.config.autoMergeMaxLines, 50);
  assert.strictEqual(out.config.autoMergeMaxFiles, 2); // schema default
  assert.deepStrictEqual(out.config.mergeSensitivePaths, ['plugin/bin/hooks.js']);
});

test('--base short-circuits merge-base derivation and is verified via rev-parse', () => {
  const git = fakeGit({
    'rev-parse': (args) => (args.includes('--show-toplevel') ? '/repo\n' : `${SHA}\n`),
    diff: () => '',
  });
  const out = computeBlastRadius({ base: 'abc123' }, { git, readFile: () => null });
  assert.strictEqual(out.mergeBase, SHA);
  assert.ok(!git.calls.some((c) => c[0] === 'merge-base'), 'merge-base must not run when base is given');
});

test('unresolvable merge base throws BlastRadiusError — never a zero summary', () => {
  const git = fakeGit({
    'merge-base': () => { throw new Error('fatal: Not a valid object name'); },
    'rev-parse': () => '/repo\n',
  });
  assert.throws(
    () => computeBlastRadius({ integrationBranch: 'main' }, { git, readFile: () => null }),
    BlastRadiusError
  );
});

test('unverifiable --base throws BlastRadiusError', () => {
  const git = fakeGit({
    'rev-parse': (args) => {
      if (args.includes('--show-toplevel')) return '/repo\n';
      throw new Error('fatal: Needed a single revision');
    },
  });
  assert.throws(
    () => computeBlastRadius({ base: 'nonsense' }, { git, readFile: () => null }),
    BlastRadiusError
  );
});

test('genuinely empty diff with a valid base yields zero summary WITH the mergeBase attached', () => {
  const git = fakeGit({
    'merge-base': () => `${SHA}\n`,
    diff: () => '',
    'rev-parse': () => '/repo\n',
  });
  const out = computeBlastRadius({ integrationBranch: 'main' }, { git, readFile: () => null });
  assert.strictEqual(out.mergeBase, SHA);
  assert.strictEqual(out.summary.implFiles, 0);
  assert.strictEqual(out.summary.implLines, 0);
});

test('neither base nor integrationBranch throws BlastRadiusError', () => {
  assert.throws(
    () => computeBlastRadius({}, { git: fakeGit({}), readFile: () => null }),
    BlastRadiusError
  );
});

test('binary-file numstat dashes count the file with zero lines', () => {
  const parsed = parseNumstat('-\t-\tassets/logo.png\n3\t1\tplugin/bin/foo.js\n');
  assert.deepStrictEqual(parsed[0], { path: 'assets/logo.png', additions: 0, deletions: 0 });
  assert.deepStrictEqual(parsed[1], { path: 'plugin/bin/foo.js', additions: 3, deletions: 1 });
});

test('numstat rename paths with tabs survive (path is everything after the second tab)', () => {
  const parsed = parseNumstat('1\t1\tdir/a\tb.md\n');
  assert.deepStrictEqual(parsed[0], { path: 'dir/a\tb.md', additions: 1, deletions: 1 });
});

test('sensitive-path hit from resolved policy lands in sensitiveFilesTouched', () => {
  const git = fakeGit({
    'merge-base': () => `${SHA}\n`,
    diff: () => '2\t0\tplugin/bin/hooks.js\n',
    'rev-parse': () => '/repo\n',
  });
  const readFile = (p) => (p.endsWith('policy.yml') ? 'merge-sensitive-paths: plugin/bin/hooks.js\n' : null);
  const out = computeBlastRadius({ integrationBranch: 'main' }, { git, readFile });
  assert.deepStrictEqual(out.summary.sensitiveFilesTouched, ['plugin/bin/hooks.js']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/blast-radius-cli.test.js`
Expected: FAIL with `Cannot find module '.../plugin/bin/lib/blast-radius-cli.js'`

- [ ] **Step 3: Write the implementation**

Create `plugin/bin/lib/blast-radius-cli.js`:

```js
'use strict';
// The gather half of assess-agent-autonomy's merge-check mode, as one process
// (#888): merge-base resolution, numstat parsing, policy-config resolution, and
// classification via bin/lib/issues/blast-radius.js. Hard-fails (throws
// BlastRadiusError) when the base cannot be resolved — a zero-file summary from
// a resolution failure is structurally impossible, which is the whole point:
// the retired prose choreography could silently read `git diff ""..HEAD` as an
// empty diff and clear every auto-merge threshold.
//
// Injectable seams (deps.git, deps.readFile) follow the same fake-runner test
// convention as the gh-shelling modules (see the gh-api-module-pattern skill).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { classifyDiffFiles, blastRadiusSummary } = require('./issues/blast-radius.js');
const { resolvePolicyKeys } = require('./policy-schema.js');

class BlastRadiusError extends Error {}

function defaultGit(args) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function defaultReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// git diff --numstat: "<additions>\t<deletions>\t<path>" per line; binary files
// report "-" for both counts (counted as a changed file with zero lines); a
// path may itself contain tabs, so it is everything after the second tab.
function parseNumstat(raw) {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [additions, deletions, ...pathParts] = line.split('\t');
      return {
        path: pathParts.join('\t'),
        additions: Number.parseInt(additions, 10) || 0,
        deletions: Number.parseInt(deletions, 10) || 0,
      };
    });
}

function resolveConfig({ git, readFile, runDir }) {
  let root;
  try {
    root = git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    root = process.cwd();
  }
  const policyRaw = readFile(path.join(root, '.claude-tweaks', 'policy.yml'));
  const runConfigRaw = runDir ? readFile(path.join(runDir, 'config.yml')) : null;
  const resolved = resolvePolicyKeys(
    ['merge-sensitive-paths', 'auto-merge-max-lines', 'auto-merge-max-files'],
    { policyRaw, runConfigRaw }
  );
  const rawPaths = resolved['merge-sensitive-paths'] && resolved['merge-sensitive-paths'].value;
  const mergeSensitivePaths = Array.isArray(rawPaths)
    ? rawPaths
    : String(rawPaths || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    mergeSensitivePaths,
    autoMergeMaxLines: Number(resolved['auto-merge-max-lines'].value),
    autoMergeMaxFiles: Number(resolved['auto-merge-max-files'].value),
  };
}

function computeBlastRadius(opts = {}, deps = {}) {
  const git = deps.git || defaultGit;
  const readFile = deps.readFile || defaultReadFile;
  const { base, integrationBranch, runDir = null } = opts;

  if (!base && !integrationBranch) {
    throw new BlastRadiusError('one of --base or --integration-branch is required');
  }

  let mergeBase;
  if (base) {
    try {
      mergeBase = git(['rev-parse', '--verify', `${base}^{commit}`]).trim();
    } catch (err) {
      throw new BlastRadiusError(`--base "${base}" does not resolve to a commit: ${err.message}`);
    }
  } else {
    try {
      mergeBase = git(['merge-base', integrationBranch, 'HEAD']).trim();
    } catch (err) {
      throw new BlastRadiusError(
        `could not resolve merge base of "${integrationBranch}" and HEAD: ${err.message}`
      );
    }
  }
  if (!mergeBase) {
    throw new BlastRadiusError('merge-base resolution returned an empty value');
  }

  const files = parseNumstat(git(['diff', '--numstat', `${mergeBase}..HEAD`]));
  const config = resolveConfig({ git, readFile, runDir });
  const summary = blastRadiusSummary(classifyDiffFiles(files, config.mergeSensitivePaths));
  return { mergeBase, config, summary };
}

module.exports = { computeBlastRadius, parseNumstat, BlastRadiusError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/blast-radius-cli.test.js`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/blast-radius-cli.js tests/bin-lib/blast-radius-cli.test.js
git commit -m "Add blast-radius-cli lib — hard-failing merge-base + numstat + config resolution (refs #888)"
```

---

### Task 2: `plugin/bin/blast-radius.js` — thin CLI shell + end-to-end fixture test

**Files:**
- Create: `plugin/bin/blast-radius.js`
- Test: `tests/blast-radius-cli-e2e.test.js`

**Interfaces:**
- Consumes: `computeBlastRadius`, `BlastRadiusError` from Task 1 (exact signatures above).
- Produces: CLI contract `node plugin/bin/blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]` — success: exit 0, one JSON object `{mergeBase, config, summary}` on stdout; any failure: exit 1, `blast-radius: <message>` on stderr, **nothing on stdout**.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/blast-radius-cli-e2e.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'plugin', 'bin', 'blast-radius.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Fixture: a repo with a main branch, a feature branch one behavior commit
// (plugin file) and one test commit ahead, plus a policy.yml naming a
// sensitive path.
function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blast-radius-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Test');
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'merge-sensitive-paths: secrets/*\n');
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'base');
  git(dir, 'checkout', '-b', 'feature');
  fs.writeFileSync(path.join(dir, 'impl.js'), 'x\ny\nz\n');
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tests', 'impl.test.js'), 'a\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'feature work');
  return dir;
}

test('e2e: success prints one JSON object with mergeBase, config, summary', () => {
  const dir = makeFixtureRepo();
  const res = spawnSync('node', [CLI, '--integration-branch', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.match(out.mergeBase, /^[0-9a-f]{40}$/);
  assert.strictEqual(out.summary.implFiles, 1);
  assert.strictEqual(out.summary.implLines, 3);
  assert.strictEqual(out.summary.testFiles, 1);
  assert.deepStrictEqual(out.config.mergeSensitivePaths, ['secrets/*']);
  assert.strictEqual(out.config.autoMergeMaxLines, 40);
});

test('e2e: unresolvable integration branch exits 1 with stderr and NO stdout', () => {
  const dir = makeFixtureRepo();
  const res = spawnSync('node', [CLI, '--integration-branch', 'no-such-branch'], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /blast-radius: could not resolve merge base/);
  assert.strictEqual(res.stdout, '', 'a resolution failure must never print a summary');
});

test('e2e: missing both base flags exits 1 with usage on stderr', () => {
  const dir = makeFixtureRepo();
  const res = spawnSync('node', [CLI], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /usage: blast-radius\.js/);
  assert.strictEqual(res.stdout, '');
});

test('e2e: --base pass-through uses the given commit', () => {
  const dir = makeFixtureRepo();
  const baseSha = git(dir, 'rev-parse', 'main').trim();
  const res = spawnSync('node', [CLI, '--base', baseSha], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stderr);
  assert.strictEqual(JSON.parse(res.stdout).mergeBase, baseSha);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/blast-radius-cli-e2e.test.js`
Expected: FAIL with `Cannot find module '.../plugin/bin/blast-radius.js'` (spawn returns status 1 but with module-not-found stderr, failing the success-path assertion)

- [ ] **Step 3: Write the CLI shell**

Create `plugin/bin/blast-radius.js`:

```js
#!/usr/bin/env node
// bin/blast-radius.js
//
// The gather step of assess-agent-autonomy's merge-check mode as ONE process
// (#888): merge-base resolution, `git diff --numstat` parsing, policy-config
// resolution (merge-sensitive-paths / auto-merge-max-lines /
// auto-merge-max-files), and classification via bin/lib/issues/blast-radius.js.
// A thin shell over bin/lib/blast-radius-cli.js#computeBlastRadius — no logic
// lives here. Zero runtime npm deps.
//
// Usage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]
// Success: exit 0, one JSON object {mergeBase, config, summary} on stdout.
// Any failure — unknown flag, missing/unresolvable base, git error — exits 1
// with a stderr message and NO stdout: a resolution failure must never be
// readable as a zero-file blast radius (the silent-approval hazard the
// retired shell choreography in merge-check.md carried).
'use strict';
const { computeBlastRadius, BlastRadiusError } = require('./lib/blast-radius-cli.js');

function fail(msg) {
  process.stderr.write(`blast-radius: ${msg}\n`);
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  while (args.length) {
    const arg = args.shift();
    const value = args.shift();
    if (value === undefined) return fail(`${arg} requires a value`);
    if (arg === '--base') opts.base = value;
    else if (arg === '--integration-branch') opts.integrationBranch = value;
    else if (arg === '--run') opts.runDir = value;
    else return fail(`unknown argument: ${arg}\nusage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]`);
  }
  if (!opts.base && !opts.integrationBranch) {
    return fail('usage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]');
  }
  let result;
  try {
    result = computeBlastRadius(opts);
  } catch (err) {
    if (err instanceof BlastRadiusError) return fail(err.message);
    throw err;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/blast-radius-cli-e2e.test.js tests/bin-lib/blast-radius-cli.test.js`
Expected: PASS (all tests, both files)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/blast-radius.js tests/blast-radius-cli-e2e.test.js
git commit -m "Add blast-radius.js CLI shell — exit-1-no-stdout on resolution failure (refs #888)"
```

---

### Task 3: Rewrite `merge-check.md` Step 1, bind the snippet, sweep stale references

**Files:**
- Modify: `plugin/skills/assess-agent-autonomy/merge-check.md` (Step 1 only — lines 7-105 of the current file; Steps 2-3 and Anti-Patterns untouched except the two wording tweaks below)
- Modify: `plugin/skills/assess-agent-autonomy/SKILL.md` (one sentence in `## Input`)
- Modify: `docs/plugin-structure.md` (add the CLI to the `plugin/bin/` listing, matching the list's existing row format)
- Test: `tests/blast-radius-snippet.test.js`

**Interfaces:**
- Consumes: the CLI contract from Task 2 (exact flags and output shape).
- Produces: the new fenced `bash` block in `merge-check.md` (below, byte-exact) that the snippet test extracts and executes.

- [ ] **Step 1: Rewrite `merge-check.md`'s `## Step 1: Gather`**

Replace everything from the `> **Parallel execution:**` blockquote (line 9) through the `(`$MERGE_SENSITIVE_PATHS_CSV` is the comma-separated value...)` paragraph (line 105) with:

````markdown
The calling agent has just finished this run's build, test, and review — the diff and review
verdict are already in its own context. Confirm rather than re-derive where possible. The merge
base is the commit this run's worktree branched from — the same base the pipeline's own build
started from.

- **If the caller passed `--base <ref>`** (see Input — e.g. one of dispatch's per-group Task
  calls, which ran `/flow` inside its dispatching session's worktree, often already knows this
  value), pass it through to the CLI below as `--base <ref>` and skip integration-branch
  resolution entirely — it names a merge-base commit, not a branch.

- **Otherwise**, resolve `INTEGRATION_BRANCH` per `skills/_shared/integration-branch.md` and pass
  it as `--integration-branch`. If nothing resolves — no `origin` remote, no `gh` auth, an
  offline or detached runner — stop here. This is the "inconclusive read" case `SKILL.md`'s Error
  Handling already covers, not a hard crash. Render Step 3 directly: `VERDICT: needs-human` /
  `RATIONALE: {name the specific resolution failure, e.g. "could not resolve this project's
  integration branch"}`, and skip the rest of this mode's procedure.

The whole gather — merge-base resolution, the numstat diff, this project's
`merge-sensitive-paths`/`auto-merge-max-lines`/`auto-merge-max-files` config, and the
classification (`bin/lib/issues/blast-radius.js`) — is one CLI call, substituting the resolved
branch literally for `{integration-branch}` (or `--base <ref>` when the caller supplied one):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/blast-radius.js" --integration-branch {integration-branch}
```

It prints one JSON object: `mergeBase` (the resolved base commit), `config`
(`mergeSensitivePaths` list plus the two `autoMergeMax*` numbers, resolved from this project's
policy by the CLI itself), and `summary` (`implLines`/`implFiles`/`testLines`/`testFiles`/
`sensitiveFilesTouched`) — everything Step 2 weighs.

**A non-zero exit is a resolution failure, not a zero-radius diff.** The CLI hard-fails —
stderr, no JSON — when the merge base cannot be resolved, so a resolution failure can never be
read as a 0-file blast radius that clears every threshold (the silent-approval hazard the
previous multi-command shell choreography here guarded against with prose alone, #888). On a
non-zero exit, render Step 3 directly: `VERDICT: needs-human` / `RATIONALE: {the CLI's stderr
line}` — the same handling as an unresolvable integration branch above.

Measuring from the integration branch rather than the GitHub default is what makes blast radius
mean the record's own change. Against a branch that diverged long ago, the merge base is ancient
and the diff spans every commit since the fork — which reads as an enormous change and returns
`needs-human` for a reason that looks legitimate and isn't (#132).
````

Then, in `## Step 2: Judge`, adjust only these two references (no other Step 2 text changes):
- `**Sensitive-path hit is a hard floor.** If \`sensitiveFilesTouched\` is non-empty` → `**Sensitive-path hit is a hard floor.** If the CLI summary's \`sensitiveFilesTouched\` is non-empty`
- `**Weigh \`blastRadiusSummary.implLines\`/\`implFiles\` against the project's configured` → `**Weigh the summary's \`implLines\`/\`implFiles\` against the CLI-reported`

- [ ] **Step 2: Update `SKILL.md`'s `## Input` sentence**

In `plugin/skills/assess-agent-autonomy/SKILL.md`, replace:

`` `merge-check` uses `#{n}` only as a temp-file-name suffix for its own git-diff/config-derived gather — it never fetches the record itself. ``

with:

`` `merge-check` doesn't consume `#{n}` at all — its gather is a single `bin/blast-radius.js` call (git diff + config, see `merge-check.md` Step 1) — and it never fetches the record itself. ``

- [ ] **Step 3: Add the CLI to `docs/plugin-structure.md`**

Find the `plugin/bin/` CLI listing in `docs/plugin-structure.md` and add a row/line for `blast-radius.js` in its existing format (read the neighboring entries first and match their style exactly): `blast-radius.js — merge-check's gather as one hard-failing process: merge base + numstat + policy config + classification (#888)`.

- [ ] **Step 4: Write the snippet-binding test (extract and run)**

Create `tests/blast-radius-snippet.test.js`:

```js
'use strict';
// Binds merge-check.md's Step 1 fenced command to execution (docs/
// skill-authoring.md, "Executable snippets in skill prose" — extract-and-run
// form): the doc is the only source of the executed text, run against a
// fixture repo with CLAUDE_PLUGIN_ROOT and {integration-branch} substituted.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const DOC = path.join(__dirname, '..', 'plugin', 'skills', 'assess-agent-autonomy', 'merge-check.md');
const PLUGIN_ROOT = path.join(__dirname, '..', 'plugin');

function extractSnippet() {
  const doc = fs.readFileSync(DOC, 'utf8');
  const match = /is one CLI call[^\n]*\n[^\n]*\n\n```bash\n([^`]+)```/m.exec(doc);
  assert.ok(match, 'extraction pattern is out of sync with merge-check.md — update this test');
  return match[1].trim();
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('merge-check.md Step 1 snippet executes verbatim against a fixture repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blast-snippet-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'base');
  git(dir, 'checkout', '-b', 'feature');
  fs.writeFileSync(path.join(dir, 'b.js'), 'b\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'change');

  const snippet = extractSnippet().replace('{integration-branch}', 'main');
  const out = execSync(snippet, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  });
  const parsed = JSON.parse(out);
  assert.match(parsed.mergeBase, /^[0-9a-f]{40}$/);
  assert.strictEqual(parsed.summary.implFiles, 1);
});
```

- [ ] **Step 5: Run the new test plus the full assess-agent-autonomy-adjacent suites**

Run: `node --test tests/blast-radius-snippet.test.js tests/bin-lib/blast-radius-cli.test.js tests/blast-radius-cli-e2e.test.js tests/bin-lib/skill-audit/`
Expected: PASS. (The skill-audit suites scan `SKILL.md` prose repo-wide — the Input-sentence edit must not trip the CSC/house-structure/anti-pattern pins; SKILL.md's Anti-Patterns table is untouched, so the row count is unchanged.)

- [ ] **Step 6: Sweep stale references**

Run each; expected hits after the rewrite are ONLY this plan file and pipeline run artifacts (`docs/superpowers/plans/`, `.claude-tweaks/pipelines/`), which are excluded from the sweep's scope:

```bash
grep -rn "assess-merge-files\|assess-merge-blast-radius\|MERGE_SENSITIVE_PATHS_CSV" plugin/ docs/ README.md tests/
grep -rn "one Bash call" plugin/skills/assess-agent-autonomy/
```

If any live file still matches, fix it (update or delete the stale reference) before committing.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/assess-agent-autonomy/merge-check.md plugin/skills/assess-agent-autonomy/SKILL.md docs/plugin-structure.md tests/blast-radius-snippet.test.js
git commit -m "Rewrite merge-check gather as one blast-radius.js call, bind snippet test (refs #888)"
```
