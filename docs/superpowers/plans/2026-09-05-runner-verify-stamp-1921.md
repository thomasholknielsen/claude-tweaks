# Runner-Written Verify Stamp (#1921) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `plugin/bin/verify.js` the sole writer of a SHA-bound, scope-labelled JSON verification pass stamp, add a read-only `--stamp-status` mode, resolve the runner's own default log/count-stamp paths, and make `/test`, `/review`, the dispatch second call, and the SDD whole-branch reviewer read the stamp instead of re-running the suite.

**Architecture:** A new `plugin/bin/lib/verify/stamp.js` module owns compose/write/read of `{git-dir}/claude-tweaks-verify-pass.json` (plus a one-release legacy bare-SHA twin). `verify.js` writes the stamp only on a passing full-set run and gains `--stamp-status`, `--no-stamp`, `--git-dir`; `report.js` gains a `gitDir()` helper so the CLI resolves `{git-dir}/claude-tweaks-verify` and `{git-dir}/claude-tweaks-test-count.json` itself. Skill prose (`test/verification.md`, `test/SKILL.md`, `review/code-mode-steps.md`, `dispatch/task-prompt.md`, `build/dispatch.md`, `build/SKILL.md`) switches every reader to `verify.js --stamp-status`; an upstream-drift assertion pins the SDD step the reviewer instruction targets.

**Tech Stack:** Node 18+ built-ins only (`node:fs`, `node:path`, `node:child_process`), `node --test`, markdown skill files pinned by conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1921/work/1921-spec.md` (materialized from GitHub issue #1921)

## Global Constraints

- The plugin has no runtime npm dependencies — built-in modules only.
- `verify.js` never reads `.claude-tweaks/policy.yml` or CLAUDE.md (Option A boundary). Reading git and the runner's own artifacts is inside the boundary.
- Every command written into skill prose must be one plain command: no `;`, no `&&`, no pipes, never two `$(...)` substitutions (worktree Bash-shape guard, `plugin/skills/_shared/scratch-worktree.md` §7).
- Never write the stamp when `report.pass !== true` or when any check carries `skipped: "fail-fast"` (#1784). The count stamp is rewritten regardless of outcome by design (#881) — do not unify the two writers.
- The stamp lives in the checkout's own git dir (`git rev-parse --git-dir`, per-worktree under `.git/worktrees/<name>/`), never the common dir.
- `plugin/skills/build/SKILL.md` is at 36,959 bytes against the 40 KB per-invocation ceiling — keep its byte delta at or below zero (measure with `wc -c` before and after).
- `tests/policy-deprecations-pin.test.js` asserts every backtick-quoted `## \`key\`` heading in `plugin/skills/_shared/policy-deprecations.md` has a `RENAMED_KEYS` entry — the new entry there MUST use a heading that does not start with a backtick.
- `tests/bin-lib/verify/cli.test.js` runs from inside this repo: every CLI invocation in that file MUST pass an explicit `cwd` that is either a fresh temp git repo or a fresh non-git temp dir, so the new default-path logic never writes stamps into this repo's real git dir.
- Intermediate commits use `refs #1921`, never `closes`/`fixes`. Every commit message ends with the trailer line `Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB`.
- Commit tests only where the task asks for them; do not reformat adjacent code; edit in place.
- The worktree is `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony` on branch `worktree-design-1904-pipeline-ceremony`; anchor every git/test command with `git -C "<worktree>"` or an absolute path.

---

### Task 1: `stamp.js` — compose, write (JSON + legacy twin), read with fallback order

**Files:**
- Create: `plugin/bin/lib/verify/stamp.js`
- Test: `tests/bin-lib/verify/stamp.test.js`

**Interfaces:**
- Consumes: `writeJsonAtomic(filePath, data, fsImpl)` from `plugin/bin/lib/verify/atomic-write.js`.
- Produces:
  - `STAMP_JSON_NAME = 'claude-tweaks-verify-pass.json'`, `STAMP_LEGACY_NAME = 'claude-tweaks-verify-pass'`
  - `composeStamp({ report, scope, fullSha, base, changedFiles, suitesRun, flakyRetried, reportPath, at })` → `{ sha, dirty, scope, fullSha, base, changedFiles, suitesRun, flakyRetried, reportPath, at }`
  - `writeStamp(gitDir, stamp, deps = {})` → `{ jsonPath, legacyPath }`; `deps.fsImpl` defaults to `fs`
  - `readStamp(gitDir, fsImpl = fs)` → stamp object, `{ sha, scope: 'full', legacy: true }`, or `null`

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/verify/stamp.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  composeStamp, writeStamp, readStamp, STAMP_JSON_NAME, STAMP_LEGACY_NAME,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'stamp.js'));

function fakeFs(files = {}) {
  return {
    files,
    readFileSync: (p) => {
      if (!(p in files)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return files[p];
    },
    writeFileSync: (p, data) => { files[p] = data; },
    renameSync: (from, to) => { files[to] = files[from]; delete files[from]; },
  };
}

const REPORT = { sha: 'abc123', dirty: false, pass: true, checks: {} };

test('composeStamp copies sha/dirty from the report and carries every field verbatim', () => {
  const stamp = composeStamp({
    report: REPORT, scope: 'full', fullSha: 'abc123', base: null, changedFiles: [],
    suitesRun: ['tests'], flakyRetried: [], reportPath: '/g/claude-tweaks-verify/report.json',
    at: '2026-09-05T14:07:09Z',
  });
  assert.deepStrictEqual(stamp, {
    sha: 'abc123', dirty: false, scope: 'full', fullSha: 'abc123', base: null, changedFiles: [],
    suitesRun: ['tests'], flakyRetried: [], reportPath: '/g/claude-tweaks-verify/report.json',
    at: '2026-09-05T14:07:09Z',
  });
});

test('composeStamp never lets caller-supplied fields override the derived sha/dirty (no spread-after-derived)', () => {
  const stamp = composeStamp({
    report: { sha: 'real', dirty: true }, scope: 'full', fullSha: 'real', base: null, changedFiles: [],
    suitesRun: [], flakyRetried: [], reportPath: '/r.json', at: 't', sha: 'forged', dirty: false,
  });
  assert.strictEqual(stamp.sha, 'real');
  assert.strictEqual(stamp.dirty, true);
});

test('writeStamp writes the JSON stamp and the legacy bare-SHA twin atomically', () => {
  const fsImpl = fakeFs();
  const stamp = composeStamp({
    report: REPORT, scope: 'full', fullSha: 'abc123', base: null, changedFiles: [],
    suitesRun: ['tests'], flakyRetried: [], reportPath: '/r.json', at: 't',
  });
  const out = writeStamp('/g', stamp, { fsImpl });
  assert.strictEqual(out.jsonPath, path.join('/g', STAMP_JSON_NAME));
  assert.strictEqual(out.legacyPath, path.join('/g', STAMP_LEGACY_NAME));
  assert.deepStrictEqual(JSON.parse(fsImpl.files[out.jsonPath]), stamp);
  assert.strictEqual(fsImpl.files[out.legacyPath], 'abc123\n');
  assert.ok(!Object.keys(fsImpl.files).some((p) => p.endsWith('.tmp')), 'no tmp files left behind');
});

test('readStamp returns null when neither file exists', () => {
  assert.strictEqual(readStamp('/g', fakeFs()), null);
});

test('readStamp prefers the JSON stamp regardless of the bare file', () => {
  const fsImpl = fakeFs({
    [path.join('/g', STAMP_JSON_NAME)]: JSON.stringify({ sha: 'json', scope: 'full', fullSha: 'json' }),
    [path.join('/g', STAMP_LEGACY_NAME)]: 'bare\n',
  });
  assert.deepStrictEqual(readStamp('/g', fsImpl), { sha: 'json', scope: 'full', fullSha: 'json' });
});

test('readStamp returns null on unparseable JSON — never falls back to the bare file', () => {
  const fsImpl = fakeFs({
    [path.join('/g', STAMP_JSON_NAME)]: 'not json',
    [path.join('/g', STAMP_LEGACY_NAME)]: 'abc123\n',
  });
  assert.strictEqual(readStamp('/g', fsImpl), null);
});

test('readStamp returns null when the JSON parses but is not an object with a string sha', () => {
  assert.strictEqual(readStamp('/g', fakeFs({ [path.join('/g', STAMP_JSON_NAME)]: '"abc"' })), null);
  assert.strictEqual(readStamp('/g', fakeFs({ [path.join('/g', STAMP_JSON_NAME)]: '{"scope":"full"}' })), null);
});

test('readStamp falls back to the bare file as a legacy full-scope stamp when JSON is absent', () => {
  const fsImpl = fakeFs({ [path.join('/g', STAMP_LEGACY_NAME)]: 'abc123\n' });
  assert.deepStrictEqual(readStamp('/g', fsImpl), { sha: 'abc123', scope: 'full', legacy: true });
});

test('readStamp returns null when the bare file is not a 40-hex SHA', () => {
  const fsImpl = fakeFs({ [path.join('/g', STAMP_LEGACY_NAME)]: 'garbage\n' });
  assert.strictEqual(readStamp('/g', fsImpl), null);
  assert.strictEqual(readStamp('/g', fakeFs({ [path.join('/g', STAMP_LEGACY_NAME)]: '' })), null);
});
```

Note: the "40-hex SHA" test uses `abc123` in earlier cases only for the JSON path (the JSON path does not validate SHA length); for the bare-file fallback, use a real 40-hex value in the fallback test — replace `'abc123\n'` in the fallback test with `'0123456789abcdef0123456789abcdef01234567\n'` and the expected `sha` accordingly.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/stamp.test.js"`
Expected: FAIL with "Cannot find module '.../plugin/bin/lib/verify/stamp.js'"

- [ ] **Step 3: Write the module**

Create `plugin/bin/lib/verify/stamp.js`:

```js
// plugin/bin/lib/verify/stamp.js — the runner-written verification pass
// stamp (#1921). bin/verify.js is the ONLY writer: an agent-written stamp is a
// claim, a runner-written one is an artifact bound to the report it summarizes
// (#1784: the agent stamped a failing run). JSON is canonical from this
// release; the bare-SHA twin (STAMP_LEGACY_NAME) is written for one minor
// release so an installed build running older skill prose still finds it —
// removal condition in skills/_shared/policy-deprecations.md.
//
// Read fallback order (spec Gotchas): JSON present and parses -> use it
// (regardless of the bare file); JSON present but unparseable -> null (no
// fallback); JSON absent -> try the bare file; bare file absent or not a
// 40-hex SHA -> null. Fail toward absence, like count-stamp.js.
'use strict';

const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./atomic-write');

const STAMP_JSON_NAME = 'claude-tweaks-verify-pass.json';
const STAMP_LEGACY_NAME = 'claude-tweaks-verify-pass';
const SHA_RE = /^[0-9a-f]{40}$/;

// Derived fields (sha, dirty) come from the report and are assigned AFTER
// the caller-supplied fields so a caller can never override them (the same
// rule appendEvent states in bin/lib/hooks/context.js).
function composeStamp({
  report, scope, fullSha, base, changedFiles, suitesRun, flakyRetried, reportPath, at,
}) {
  return {
    sha: report.sha,
    dirty: report.dirty,
    scope,
    fullSha,
    base,
    changedFiles,
    suitesRun,
    flakyRetried,
    reportPath,
    at,
  };
}

function writeStamp(gitDir, stamp, deps = {}) {
  const fsImpl = deps.fsImpl || fs;
  const jsonPath = path.join(gitDir, STAMP_JSON_NAME);
  const legacyPath = path.join(gitDir, STAMP_LEGACY_NAME);
  writeJsonAtomic(jsonPath, stamp, fsImpl);
  const tmp = `${legacyPath}.tmp`;
  fsImpl.writeFileSync(tmp, `${stamp.sha}\n`);
  fsImpl.renameSync(tmp, legacyPath);
  return { jsonPath, legacyPath };
}

function readStamp(gitDir, fsImpl = fs) {
  const jsonPath = path.join(gitDir, STAMP_JSON_NAME);
  let jsonText = null;
  try { jsonText = fsImpl.readFileSync(jsonPath, 'utf8'); } catch { jsonText = null; }
  if (jsonText !== null) {
    let parsed;
    try { parsed = JSON.parse(jsonText); } catch { return null; }
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.sha !== 'string') return null;
    return parsed;
  }
  let bare;
  try { bare = String(fsImpl.readFileSync(path.join(gitDir, STAMP_LEGACY_NAME), 'utf8')).trim(); } catch { return null; }
  if (!SHA_RE.test(bare)) return null;
  return { sha: bare, scope: 'full', legacy: true };
}

module.exports = {
  composeStamp, writeStamp, readStamp, STAMP_JSON_NAME, STAMP_LEGACY_NAME,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/stamp.test.js"`
Expected: PASS (all tests)

- [ ] **Step 5: Mutation probe (test-authoring discipline)**

Temporarily change `readStamp`'s `return null;` on the unparseable-JSON branch to fall through to the bare file, run the suite, confirm the "never falls back" test goes red, then restore the file byte-identical (`git -C "<worktree>" diff -- plugin/bin/lib/verify/stamp.js` must show only the intended module). Report mutants tried / caught in your status line.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/stamp.js tests/bin-lib/verify/stamp.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Add verify stamp module — JSON stamp with legacy bare-SHA twin and fail-toward-absence read (refs #1921)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 2: `args.js` — parse `--stamp-status`, `--no-stamp`, `--git-dir`

**Files:**
- Modify: `plugin/bin/lib/verify/args.js`
- Test: `tests/bin-lib/verify/args.test.js`

**Interfaces:**
- Produces: `parseArgs(argv)` → `{ cmds, json, logDir, countStamp, stampStatus: boolean, noStamp: boolean, gitDir: string|null }`. When `stampStatus` is `true`, zero `--cmd` flags is valid. `USAGE` becomes:
  `usage: verify.js --cmd <name>=<command> [--cmd <name>=<command> ...] [--json <path>] [--log-dir <dir>] [--count-stamp <path>] [--no-stamp] [--git-dir <dir>] | verify.js --stamp-status [--git-dir <dir>]`

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/verify/args.test.js` (read the file first; reuse its existing `require` of `parseArgs`/`UsageError`/`USAGE` — do not add a second require):

```js
test('--stamp-status parses with no --cmd and sets stampStatus (#1921)', () => {
  const parsed = parseArgs(['--stamp-status']);
  assert.strictEqual(parsed.stampStatus, true);
  assert.deepStrictEqual(parsed.cmds, []);
  assert.strictEqual(parsed.gitDir, null);
});

test('--git-dir is accepted with --stamp-status and with a run (#1921)', () => {
  assert.strictEqual(parseArgs(['--stamp-status', '--git-dir', '/g']).gitDir, '/g');
  assert.strictEqual(parseArgs(['--cmd', 'tests=node -e 0', '--git-dir', '/g']).gitDir, '/g');
  assert.throws(() => parseArgs(['--git-dir']), UsageError);
});

test('--no-stamp is a boolean flag defaulting to false (#1921)', () => {
  assert.strictEqual(parseArgs(['--cmd', 'tests=node -e 0']).noStamp, false);
  assert.strictEqual(parseArgs(['--cmd', 'tests=node -e 0', '--no-stamp']).noStamp, true);
  assert.strictEqual(parseArgs(['--cmd', 'tests=node -e 0']).stampStatus, false);
});

test('a run without --cmd is still a usage error when --stamp-status is absent (#1921)', () => {
  assert.throws(() => parseArgs(['--no-stamp']), UsageError);
});

test('USAGE names the new flags (#1921)', () => {
  for (const flag of ['--stamp-status', '--no-stamp', '--git-dir']) assert.ok(USAGE.includes(flag), flag);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e "const a=require('/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/lib/verify/args.js'); a.parseArgs(['--stamp-status'])"`
Expected: FAIL — throws `UsageError: unknown flag: --stamp-status` (non-zero exit). Then run `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/args.test.js"` and confirm the five new tests are the failing ones.

- [ ] **Step 3: Implement**

Replace the body of `plugin/bin/lib/verify/args.js` from `const USAGE =` through the end of `parseArgs` with:

```js
const USAGE =
  'usage: verify.js --cmd <name>=<command> [--cmd <name>=<command> ...] [--json <path>] '
  + '[--log-dir <dir>] [--count-stamp <path>] [--no-stamp] [--git-dir <dir>] '
  + '| verify.js --stamp-status [--git-dir <dir>]';

const VALUE_FLAGS = new Set(['--cmd', '--json', '--log-dir', '--count-stamp', '--git-dir']);

// argv = process.argv.slice(2). Throws UsageError on any malformed input —
// the CLI prints message + USAGE to stderr and exits non-zero (AC6).
// --stamp-status (#1921) is a read-only mode: it needs no --cmd at all.
function parseArgs(argv) {
  const cmds = [];
  let json = null;
  let logDir = null;
  let countStamp = null;
  let gitDir = null;
  let stampStatus = false;
  let noStamp = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--stamp-status') { stampStatus = true; continue; }
    if (flag === '--no-stamp') { noStamp = true; continue; }
    if (VALUE_FLAGS.has(flag)) {
      const value = argv[i + 1];
      i++;
      if (value === undefined) throw new UsageError(`${flag} requires a value`);
      if (flag === '--json') { json = value; continue; }
      if (flag === '--log-dir') { logDir = value; continue; }
      if (flag === '--count-stamp') { countStamp = value; continue; }
      if (flag === '--git-dir') { gitDir = value; continue; }
      const eq = value.indexOf('=');
      if (eq === -1) throw new UsageError(`--cmd value must be <name>=<command>, got: ${value}`);
      if (eq === 0) throw new UsageError(`--cmd value has an empty name: ${value}`);
      const name = value.slice(0, eq);
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new UsageError(`--cmd name must match [A-Za-z0-9_-]+, got: ${name}`);
      }
      const command = value.slice(eq + 1);
      if (command === '') throw new UsageError(`--cmd ${name} has an empty command`);
      if (cmds.some((c) => c.name === name)) throw new UsageError(`duplicate --cmd name: ${name}`);
      cmds.push({ name, command });
      continue;
    }
    throw new UsageError(`unknown flag: ${flag}`);
  }
  if (cmds.length === 0 && !stampStatus) throw new UsageError('at least one --cmd <name>=<command> is required');
  return { cmds, json, logDir, countStamp, gitDir, stampStatus, noStamp };
}
```

Keep the `class UsageError` line and the `module.exports` line unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/args.test.js"`
Expected: PASS (existing tests included — the existing `[]` → UsageError case still holds because `stampStatus` is false)

- [ ] **Step 5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/args.js tests/bin-lib/verify/args.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Parse --stamp-status, --no-stamp, and --git-dir in verify.js args (refs #1921)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 3: `report.js` — `gitDir()` helper for the runner's default paths

**Files:**
- Modify: `plugin/bin/lib/verify/report.js`
- Test: `tests/bin-lib/verify/report.test.js`

**Interfaces:**
- Produces: `gitDir(execImpl = execFileSync, cwd = process.cwd())` → absolute path string of `git rev-parse --git-dir` resolved against `cwd`, or `null` when git fails (not a checkout, no git). Exported alongside `gitInfo`, `composeReport`, `writeReportAtomic`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/verify/report.test.js` (read the file first; add `gitDir` to its existing destructured require of `report.js`, and add `const path = require('path');` only if the file does not already import it):

```js
test('gitDir resolves a relative rev-parse answer against cwd and returns an absolute path (#1921)', () => {
  const exec = (cmd, args) => {
    assert.strictEqual(cmd, 'git');
    assert.deepStrictEqual(args, ['rev-parse', '--git-dir']);
    return '.git\n';
  };
  assert.strictEqual(gitDir(exec, '/repo'), path.join('/repo', '.git'));
});

test('gitDir passes an already-absolute worktree git dir through unchanged (#1921)', () => {
  const exec = () => '/repo/.git/worktrees/wt\n';
  assert.strictEqual(gitDir(exec, '/elsewhere'), '/repo/.git/worktrees/wt');
});

test('gitDir returns null when git fails (outside a checkout) (#1921)', () => {
  const exec = () => { throw new Error('fatal: not a git repository'); };
  assert.strictEqual(gitDir(exec, '/tmp'), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e "const r=require('/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/lib/verify/report.js'); if (typeof r.gitDir !== 'function') { console.error('gitDir is not exported'); process.exit(1); }"`
Expected: FAIL — `gitDir is not exported`, exit 1. Then run `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/report.test.js"` and confirm the three new tests fail with "gitDir is not a function".

- [ ] **Step 3: Implement**

In `plugin/bin/lib/verify/report.js`, add `const path = require('path');` after the `execFileSync` require, then insert after `gitInfo`:

```js
// The checkout's own git dir (per-worktree under .git/worktrees/<name>/,
// never the common dir — a sibling worktree's pass must not satisfy this one).
// bin/verify.js resolves its default --log-dir/--count-stamp and the #1921
// stamp location from this; null means "not inside a checkout" and the CLI
// falls back to its tmpdir behavior.
function gitDir(execImpl = execFileSync, cwd = process.cwd()) {
  try {
    const out = String(execImpl('git', ['rev-parse', '--git-dir'], { encoding: 'utf8', cwd })).trim();
    if (out === '') return null;
    return path.resolve(cwd, out);
  } catch {
    return null;
  }
}
```

and change the export line to `module.exports = { gitInfo, gitDir, composeReport, writeReportAtomic };`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/report.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/report.js tests/bin-lib/verify/report.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Add gitDir helper to verify report module for runner-resolved default paths (refs #1921)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 4: `verify.js` — default paths, stamp write gate, `--no-stamp`, `--stamp-status`

**Files:**
- Modify: `plugin/bin/verify.js`
- Test: `tests/bin-lib/verify/cli.test.js`

**Interfaces:**
- Consumes: Task 1's `composeStamp`/`writeStamp`/`readStamp`/`STAMP_JSON_NAME`/`STAMP_LEGACY_NAME`; Task 2's `parsed.stampStatus`/`noStamp`/`gitDir`; Task 3's `gitDir()`.
- Produces: `verify.js --stamp-status [--git-dir <dir>]` prints one JSON object `{ present, sha, head, dirty, scope, fullSha, match, reportPath, legacy }` and exits 0 in every case; a passing full-set run writes both stamp files under the checkout's git dir unless `--no-stamp`; `--log-dir` defaults to `{git-dir}/claude-tweaks-verify` and `--count-stamp` to `{git-dir}/claude-tweaks-test-count.json` inside a checkout.

- [ ] **Step 1: Rework the test harness so no test touches this repo's git dir, then add the failing tests**

In `tests/bin-lib/verify/cli.test.js`:

(a) Replace `runCli` and add `tmpGitRepo`:

```js
const { execFile, spawnSync, execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'verify.js');

// Every invocation runs from a fresh temp dir — never from this repo — so the
// runner's git-dir-relative defaults (#1921) can never write into the real
// checkout's .git (a stamp or count written by a test would poison the next
// real run's skip/caveat decisions).
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cli-test-'));
}

function runCli(args, opts = {}) {
  const cwd = opts.cwd || tmpDir();
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { maxBuffer: 10 * 1024 * 1024, cwd },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr, cwd }));
  });
}

// A throwaway git repo with one commit: git-dir === {repo}/.git.
function tmpGitRepo() {
  const repo = tmpDir();
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q');
  git('config', 'user.email', 'verify-test@example.invalid');
  git('config', 'user.name', 'verify test');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  return { repo, git, gitDir: path.join(repo, '.git') };
}
```

(b) In the existing AC2 `spawnSync` test, add `cwd: tmpDir()` to its options object. Leave every other existing test as-is (they now run from a non-git temp dir via `runCli`'s default `cwd`, which preserves their mkdtemp expectations).

(c) Append the new tests:

```js
test('a passing full-set run writes the JSON stamp and the legacy bare-SHA twin (#1921 AC1)', async () => {
  const { repo, git, gitDir } = tmpGitRepo();
  const { code, stdout } = await runCli(['--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(code, 0);
  const stamp = JSON.parse(fs.readFileSync(path.join(gitDir, 'claude-tweaks-verify-pass.json'), 'utf8'));
  const head = git('rev-parse', 'HEAD').trim();
  assert.strictEqual(stamp.scope, 'full');
  assert.strictEqual(stamp.sha, head);
  assert.strictEqual(stamp.fullSha, head);
  assert.strictEqual(stamp.dirty, false);
  assert.strictEqual(stamp.base, null);
  assert.deepStrictEqual(stamp.changedFiles, []);
  assert.deepStrictEqual(stamp.suitesRun, ['tests']);
  assert.deepStrictEqual(stamp.flakyRetried, []);
  assert.ok(fs.existsSync(stamp.reportPath), 'reportPath must exist');
  assert.strictEqual(fs.readFileSync(path.join(gitDir, 'claude-tweaks-verify-pass'), 'utf8'), `${head}\n`);
  assert.ok(stdout.includes('report:'));
});

test('a failing run, a fail-fast skip, and --no-stamp write neither stamp file (#1921 AC2, #1784)', async () => {
  for (const args of [
    ['--cmd', 'tests=node -e "process.exit(1)"'],
    ['--cmd', 'types=node -e "process.exit(1)"', '--cmd', 'tests=node -e 0'],
    ['--cmd', 'tests=node -e 0', '--no-stamp'],
  ]) {
    const { repo, gitDir } = tmpGitRepo();
    await runCli(args, { cwd: repo });
    assert.ok(!fs.existsSync(path.join(gitDir, 'claude-tweaks-verify-pass.json')), `json stamp written for ${JSON.stringify(args)}`);
    assert.ok(!fs.existsSync(path.join(gitDir, 'claude-tweaks-verify-pass')), `bare stamp written for ${JSON.stringify(args)}`);
  }
});

test('--stamp-status reports match/mismatch/absent as data with exit 0 (#1921 AC3)', async () => {
  const { repo, git, gitDir } = tmpGitRepo();
  const absent = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(absent.code, 0);
  const a = JSON.parse(absent.stdout);
  assert.strictEqual(a.present, false);
  assert.strictEqual(a.match, false);

  await runCli(['--cmd', 'tests=node -e 0'], { cwd: repo });
  const matched = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(matched.code, 0);
  const m = JSON.parse(matched.stdout);
  assert.strictEqual(m.present, true);
  assert.strictEqual(m.match, true);
  assert.strictEqual(m.sha, git('rev-parse', 'HEAD').trim());
  assert.strictEqual(m.head, m.sha);
  assert.strictEqual(m.dirty, false);
  assert.strictEqual(m.scope, 'full');
  assert.strictEqual(m.legacy, false);
  assert.ok(fs.existsSync(m.reportPath));

  git('commit', '-q', '--allow-empty', '-m', 'move head');
  const moved = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(moved.code, 0);
  const v = JSON.parse(moved.stdout);
  assert.strictEqual(v.present, true);
  assert.strictEqual(v.match, false);
  assert.notStrictEqual(v.head, v.sha);
  assert.ok(fs.existsSync(path.join(gitDir, 'claude-tweaks-verify-pass.json')));
});

test('--stamp-status recomputes dirty from the live tree — a dirty edit with no new commit is match:false (#1921 Gotchas)', async () => {
  const { repo } = tmpGitRepo();
  await runCli(['--cmd', 'tests=node -e 0'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'scratch.txt'), 'dirty');
  const { code, stdout } = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(code, 0);
  const s = JSON.parse(stdout);
  assert.strictEqual(s.present, true);
  assert.strictEqual(s.dirty, true);
  assert.strictEqual(s.match, false);
});

test('--stamp-status honors --git-dir and reads a legacy bare-SHA stamp as scope full (#1921)', async () => {
  const { repo, git, gitDir } = tmpGitRepo();
  fs.writeFileSync(path.join(gitDir, 'claude-tweaks-verify-pass'), `${git('rev-parse', 'HEAD').trim()}\n`);
  const { code, stdout } = await runCli(['--stamp-status', '--git-dir', gitDir], { cwd: repo });
  assert.strictEqual(code, 0);
  const s = JSON.parse(stdout);
  assert.strictEqual(s.present, true);
  assert.strictEqual(s.legacy, true);
  assert.strictEqual(s.scope, 'full');
  assert.strictEqual(s.match, true);
  assert.strictEqual(s.reportPath, null);
});

test('--stamp-status outside any checkout prints present:false and exits 0 (#1921 Gotchas)', async () => {
  const { code, stdout } = await runCli(['--stamp-status']);
  assert.strictEqual(code, 0);
  const s = JSON.parse(stdout);
  assert.strictEqual(s.present, false);
  assert.strictEqual(s.match, false);
  assert.strictEqual(s.head, null);
});

test('inside a checkout, --log-dir defaults under the git dir and --count-stamp is persisted there (#1921 AC4)', async () => {
  const { repo, gitDir } = tmpGitRepo();
  const tap = 'node -e "console.log(\'# tests 3\'); console.log(\'# pass 3\'); console.log(\'# fail 0\')"';
  const { code, stdout } = await runCli(['--cmd', `tests=${tap}`], { cwd: repo });
  assert.strictEqual(code, 0);
  const m = stdout.match(/report: (\S+)/);
  assert.strictEqual(m[1], path.join(gitDir, 'claude-tweaks-verify', 'report.json'));
  assert.ok(fs.existsSync(m[1]));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(gitDir, 'claude-tweaks-test-count.json'), 'utf8')).tests, 3);
});

test('an explicit --log-dir still wins inside a checkout (#1921)', async () => {
  const { repo } = tmpGitRepo();
  const logDir = tmpDir();
  const { code, stdout } = await runCli(['--log-dir', logDir, '--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(code, 0);
  assert.ok(stdout.includes(`report: ${path.join(logDir, 'report.json')}`));
});
```

Also rename the existing test `'--log-dir defaults to a fresh tmpdir and --json defaults inside it'` to `'outside a checkout, --log-dir defaults to a fresh tmpdir and --json defaults inside it (#1921 AC4)'` and add, inside it, `assert.ok(m[1].includes('claude-tweaks-verify-'), 'mkdtemp fallback dir');`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/verify.js" --stamp-status`
Expected: FAIL — before Task 4 lands, `main` never reaches the `--stamp-status` branch and the CLI falls through to running zero checks / writing no JSON status line (or, if Task 2 is not yet merged in this checkout, exits 2 with usage) — either way there is no `{"present":` line on stdout; treat any stdout that is not a single JSON object as the failing signature. Then run `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/cli.test.js"` and confirm the new tests fail: the AC1 test on the missing `claude-tweaks-verify-pass.json`, the `--stamp-status` tests on `JSON.parse` of non-JSON stdout.

- [ ] **Step 3: Implement**

Rewrite `plugin/bin/verify.js` as follows (keep `enrich` and `statusOf` byte-identical; only `main` and the requires change):

```js
#!/usr/bin/env node
// plugin/bin/verify.js — deterministic verification runner (#892).
// The caller resolves the project's check commands (verification.md Step 1)
// and passes each as --cmd <name>=<command>; this CLI owns execution order,
// per-check log capture, exit-code keying, bounded extraction, and
// report.json. It never reads .claude-tweaks/policy.yml or CLAUDE.md —
// command resolution stays caller-side (spec: Option A boundary). Reading
// git and its own artifacts (the #1921 pass stamp) stays inside that boundary.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs, UsageError, USAGE } = require('./lib/verify/args');
const { runChecks } = require('./lib/verify/run');
const { sniffFamily, extractFailingRegion, parseCounts, summaryLine } = require('./lib/verify/extract');
const { gitInfo, gitDir: resolveGitDir, composeReport } = require('./lib/verify/report');
const { readStamp: readCountStamp, detectRegression, caveatLine } = require('./lib/verify/count-stamp');
const { writeJsonAtomic } = require('./lib/verify/atomic-write');
const { composeStamp, writeStamp, readStamp: readVerifyStamp } = require('./lib/verify/stamp');

// [enrich and statusOf unchanged]

// --stamp-status (#1921): a read of the runner's own artifact. Status is data,
// never a failure — exit 0 in every case, including "no checkout at all".
// `dirty` and `head` are recomputed fresh from the live tree, never echoed
// from the stored stamp (spec Gotchas: a tree that went dirty after a clean
// pass reports match:false).
function stampStatus(parsed) {
  const gitDir = parsed.gitDir || resolveGitDir();
  const stamp = gitDir ? readVerifyStamp(gitDir) : null;
  const git = gitDir ? gitInfo() : { sha: null, dirty: null };
  const present = stamp !== null;
  const scope = present ? (stamp.scope || null) : null;
  const status = {
    present,
    sha: present ? stamp.sha : null,
    head: git.sha,
    dirty: git.dirty,
    scope,
    fullSha: present ? (stamp.fullSha === undefined ? stamp.sha : stamp.fullSha) : null,
    match: present && git.sha !== null && stamp.sha === git.sha && git.dirty === false && scope === 'full',
    reportPath: present && typeof stamp.reportPath === 'string' ? stamp.reportPath : null,
    legacy: present ? stamp.legacy === true : false,
  };
  process.stdout.write(`${JSON.stringify(status)}\n`);
  process.exitCode = 0;
}

async function main() {
  process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n${USAGE}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  if (parsed.stampStatus) { stampStatus(parsed); return; }

  // Default paths resolve against the checkout's own git dir (#1921) so the
  // canonical skill invocation is one plain command with no $(...)
  // substitutions (the worktree Bash-shape guard refuses two of them).
  // Explicit flags win; outside a checkout the tmpdir fallback stands and
  // no count stamp is persisted.
  const gitDir = parsed.gitDir || resolveGitDir();
  const logDir = parsed.logDir
    || (gitDir ? path.join(gitDir, 'claude-tweaks-verify') : fs.mkdtempSync(path.join(os.tmpdir(), 'claude-tweaks-verify-')));
  fs.mkdirSync(logDir, { recursive: true });
  const jsonPath = parsed.json || path.join(logDir, 'report.json');
  const countStampPath = parsed.countStamp || (gitDir ? path.join(gitDir, 'claude-tweaks-test-count.json') : null);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const results = (await runChecks({ cmds: parsed.cmds, logDir })).map(enrich);
  const git = gitInfo();

  // Suite-count regression stamp (#881, IL-84): the "tests" check's own
  // parsed count is compared against the previous run's persisted count.
  // --count-stamp is caller-resolved (verification.md Step 2) or defaults
  // under the git dir (#1921); outside a checkout with no flag, persistence
  // and comparison are disabled entirely.
  const testsCheck = results.find((c) => c.name === 'tests' && !c.skipped);
  const currentCount = testsCheck && testsCheck.counts && typeof testsCheck.counts.tests === 'number'
    ? { tests: testsCheck.counts.tests, sha: git.sha, recordedAt: startedAt }
    : null;
  let testCountRegression = null;
  if (countStampPath) {
    const previousCount = readCountStamp(countStampPath);
    testCountRegression = detectRegression(previousCount, currentCount);
    if (currentCount !== null) {
      // Fail-toward-absence on the write side too (readStamp already does
      // this on read): a stamp-write failure (ENOSPC, EACCES, a
      // --count-stamp path whose parent directory doesn't exist) must never
      // crash the whole run and discard an otherwise-passing report — this
      // is a caveat/surfacing mechanism, not a hard gate (count-stamp.js's
      // own stated intent). report.json's own write below is deliberately
      // unguarded: it IS the run's output, so a failure there must surface.
      try {
        fs.mkdirSync(path.dirname(countStampPath), { recursive: true });
        writeJsonAtomic(countStampPath, currentCount);
      } catch { /* best-effort persistence; next run simply has no baseline */ }
    }
  }

  const report = composeReport({
    checks: results, startedAt, durationMs: Date.now() - startMs, git, testCountRegression,
  });
  writeJsonAtomic(jsonPath, report);

  // Verification pass stamp (#1921): the runner is the ONLY writer, and only
  // for a passing run of the full resolved set — every --cmd check ran, none
  // was fail-fast skipped (#1784: an agent-written stamp let a failing run
  // stamp a pass). `dirty` never gates the write; --stamp-status's match
  // rule already requires dirty === false. --no-stamp is the caller's
  // declaration that this --cmd set is deliberately partial. The write is
  // best-effort like the count stamp: a stamp failure never fails the run.
  const fullSet = results.every((c) => !c.skipped);
  if (report.pass === true && fullSet && !parsed.noStamp && gitDir && git.sha) {
    const suitesRun = results.filter((c) => c.name !== 'types' && c.name !== 'lint').map((c) => c.name);
    const stamp = composeStamp({
      report, scope: 'full', fullSha: git.sha, base: null, changedFiles: [],
      suitesRun, flakyRetried: [], reportPath: path.resolve(jsonPath), at: new Date().toISOString(),
    });
    try { writeStamp(gitDir, stamp); } catch { /* best-effort; next --stamp-status simply reads absent */ }
  }

  const lines = ['| Check | Status | Duration | Summary |', '|---|---|---|---|'];
  for (const check of results) {
    const duration = check.skipped ? '—' : `${(check.durationMs / 1000).toFixed(1)}s`;
    const summary = check.skipped ? '—' : (check.summary || '—');
    lines.push(`| ${check.name} | ${statusOf(check)} | ${duration} | ${summary} |`);
  }
  for (const check of results) {
    if (!check.skipped && check.exitCode !== 0 && check.failingRegion) {
      lines.push('', `### ${check.name} failing region (full log: ${check.logPath})`, check.failingRegion);
    }
  }
  if (testCountRegression) lines.push('', caveatLine(testCountRegression));
  lines.push('', `report: ${jsonPath}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`verify.js: ${String((err && err.stack) || err)}\n`);
  process.exitCode = 1;
});
```

Note the existing count-stamp test `'a --count-stamp write failure never crashes the run'` passes an explicit `--count-stamp`, so its behavior is unchanged; the existing `'omitting --count-stamp disables persistence'` test now runs from a non-git temp dir (runCli's default cwd) where `gitDir` is `null`, so its expectation still holds.

- [ ] **Step 4: Run the verify suites to verify they pass**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/cli.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/args.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/stamp.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/report.test.js"`
Expected: PASS

- [ ] **Step 5: Confirm no stamp or count file leaked into this repo's git dir**

Run: `ls "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/"`
Expected: no `claude-tweaks-verify-pass.json` newer than the test run that was not produced by a real full-suite pass (the pre-existing `claude-tweaks-verify/` and `claude-tweaks-test-count.json` from the run's pre-flight sweep may exist — that is fine).

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/verify.js tests/bin-lib/verify/cli.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "verify.js writes the pass stamp on a full passing run, adds --stamp-status/--no-stamp, and resolves git-dir default paths (refs #1921)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 5: `test/verification.md` + `test/SKILL.md` + snippet conformance + `docs/plugin-structure.md`

**Files:**
- Modify: `plugin/skills/test/verification.md` (Step 2 invocation, foreground rule, Skip-if-recent artifact branch, Step 2.5 rewrite)
- Modify: `plugin/skills/test/SKILL.md` (Pipeline behavior bullet list)
- Modify: `tests/bin-lib/verify/snippet-conformance.test.js`
- Modify: `docs/plugin-structure.md` (lines 40 and 125 — the `plugin/bin/lib/verify/` row and the verify CLI command row)

**Interfaces:**
- Consumes: Task 4's `--stamp-status` JSON shape and default paths.
- Produces: the canonical Step 2 invocation with zero `$(git rev-parse` substitutions; the `--stamp-status` fenced block that `review/code-mode-steps.md` (Task 6) cites.

- [ ] **Step 1: Extend the conformance test first**

In `tests/bin-lib/verify/snippet-conformance.test.js`, change `extractSnippet` to select the run invocation only, and add the new pins:

```js
// The one fenced bash block that RUNS bin/verify.js (carries --cmd); the
// --stamp-status read block is pinned separately below.
function extractSnippet() {
  const blocks = [...DOC.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const hits = blocks.filter((b) => b.includes('bin/verify.js') && b.includes('--cmd'));
  assert.strictEqual(hits.length, 1,
    `expected exactly one fenced bin/verify.js --cmd invocation, found ${hits.length}`);
  return hits[0].trim();
}

function extractStampStatusSnippet() {
  const blocks = [...DOC.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const hits = blocks.filter((b) => b.includes('bin/verify.js') && b.includes('--stamp-status'));
  assert.strictEqual(hits.length, 1,
    `expected exactly one fenced bin/verify.js --stamp-status invocation, found ${hits.length}`);
  return hits[0].trim();
}
```

Append these tests:

```js
test('the canonical invocation carries no $(git rev-parse ...) substitution — the runner resolves its own paths (#1921 AC5)', () => {
  assert.ok(!extractSnippet().includes('$(git rev-parse'), 'Step 2 invocation still substitutes a git dir');
});

test('the --stamp-status read block parses clean through the real arg parser (#1921)', () => {
  const argv = snippetArgv(extractStampStatusSnippet());
  const parsed = parseArgs(argv);
  assert.strictEqual(parsed.stampStatus, true);
});

test('agents never write the stamp: no redirect into claude-tweaks-verify-pass remains, and the foreground rule is stated (#1921 AC6)', () => {
  assert.ok(!/>\s*"?\$\(git rev-parse --git-dir\)\/claude-tweaks-verify-pass/.test(DOC), 'a write into the bare stamp file remains');
  assert.ok(!/git rev-parse HEAD > /.test(DOC), 'the agent-side stamp write command remains');
  assert.ok(DOC.includes('run_in_background'), 'the foreground rule must name run_in_background');
});
```

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/snippet-conformance.test.js"`
Expected: FAIL — AC5 test (the current snippet contains `$(git rev-parse`), the `--stamp-status` block count is 0, and the AC6 test (the `git rev-parse HEAD >` write is still present)

- [ ] **Step 2: Edit `plugin/skills/test/verification.md`**

(a) Replace the Step 2 fenced block (currently the single `node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --log-dir ... --count-stamp ... --cmd ...` command) with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --cmd types="tsc --noEmit" --cmd lint="eslint ." --cmd tests="npm test"
```

(b) Replace the paragraph immediately after that block (the one beginning `Substitute the project's own commands from Step 1` and ending `leave it off to disable count persistence and comparison entirely.`) with:

```markdown
Substitute the project's own commands from Step 1, one `--cmd <name>=<command>` per resolved check, and omit any stage the project doesn't have (`--cmd tests="npm test"` alone is valid — in this repo it is the whole set). The reserved names `types`, `lint`, and `tests` get the ordering policy: `types` and `lint` run concurrently, `tests` starts only after every supplied one of them exits 0, and a stage-1 failure reports `tests` as `skipped: fail-fast`. Any other name runs serially after the known stages under the same fail-fast. The runner resolves its own paths (#1921): inside a git checkout, logs land under `{git-dir}/claude-tweaks-verify/` and the suite-count stamp at `{git-dir}/claude-tweaks-test-count.json` — the checkout's own git dir (`git rev-parse --git-dir`), per-worktree unique, so a concurrent session's run can never clobber it; outside a checkout it falls back to a fresh directory under the OS tmpdir with no count stamp. `--log-dir` and `--count-stamp` still override when passed explicitly. This is why the invocation above is one plain command with no `$(...)` substitutions — the worktree Bash-shape guard (`_shared/scratch-worktree.md` §7) refuses two of them in one command.

**Foreground rule.** Run the runner in the foreground of the calling agent — never with `run_in_background`, and never start a second attempt while one is running (`[IL-108]`'s family: #1904's first call stalled waiting on a background verify child's notification that never arrived). A run that needs to outlive the agent's turn is a sign the check set is wrong, not a reason to background it.

**A targeted run never stamps.** A deliberately partial `--cmd` set (types only, a scoped test path) must pass `--no-stamp` — the runner cannot tell a partial set from the full one (it trusts that the caller's `--cmd` flags ARE the complete set), so a partial run without `--no-stamp` would leave an incorrectly-labelled `scope: "full"` stamp.
```

(c) Replace the Skip-if-recent section's two bullets and the following `**Note:**` paragraph with:

```markdown
- **Match** — `skip this procedure entirely` and note: "Verification skipped — passed in previous pipeline step." This prevents redundant type check + lint + test runs when `/flow` chains build → test.
- **Mismatch** (`VERIFICATION_SHA` present but different from `HEAD`) — the tree changed since build's verification — **do not skip**; run the full procedure below and note why: "Verification re-run — tree changed since build's pass ({old-sha} → {current-sha})."
- **Signal absent** (`VERIFICATION_PASSED` unset, or `VERIFICATION_SHA` missing — the second call of a dispatched group, whose conversation never saw the first call's signal) — read the runner's own artifact instead (#1921), one plain command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --stamp-status
```

  It prints one JSON object — `{present, sha, head, dirty, scope, fullSha, match, reportPath, legacy}` — and exits 0 in every case (status is data, not failure). `match: true` (the stamp's `sha` equals `HEAD`, the live tree is clean, `scope` is `full`) → skip with the note `Verification skipped — runner stamp {sha} (full) matches HEAD; report: {reportPath}` and log an `AUTO` decision per `_shared/auto-decision-log.md` (`--step "Skip-if-recent (runner stamp)"`). Any other state — absent, mismatched, dirty, non-`full` scope — → run the full procedure below and note why (`Verification re-run — runner stamp {absent | {sha} ≠ HEAD {head} | dirty tree | scope {scope}}`). The conversation signal keeps precedence when present; the stamp is the path for a caller that has none. Fail-open: a missing or stale stamp is never a reason to trust a skip, only a matching one is.

**Note:** Skipping verification does not skip QA. When `/claude-tweaks:test` skips this procedure — by conversation signal or by a matching runner stamp — and QA stories exist, it still runs QA story validation separately.
```

(d) Replace the whole `## Step 2.5: Verification pass stamp` section (heading through its last bullet, ending `A stale stamp is never a reason to trust a skip.`) with:

```markdown
## Step 2.5: Verification pass stamp

The runner stamps; agents never do (#1921). When `verify.js` exits 0 for the full resolved check set — every `--cmd` check ran, none was fail-fast skipped — it writes `{git-dir}/claude-tweaks-verify-pass.json` itself: `{sha, dirty, scope: "full", fullSha, base: null, changedFiles: [], suitesRun, flakyRetried: [], reportPath, at}`, bound to the `report.json` it summarizes, plus (for this release only — removal condition in `_shared/policy-deprecations.md`) the legacy bare-SHA twin `{git-dir}/claude-tweaks-verify-pass`. The stamp lives in the checkout's own git dir (per-worktree, never tracked, never shared across sessions).

Rules:

- No agent-side write exists — do not run `git rev-parse HEAD` into either stamp file. A failing run, a fail-fast skip, or a `--no-stamp` run leaves both files untouched (#1784: an agent-written stamp once recorded a `pass: false` run as a pass).
- A targeted or partial run passes `--no-stamp` (Step 2 above) and therefore never stamps.
- The stamp asserts verification only — QA story outcomes are tracked separately (the QA ledger), and consumers that care about QA consult that as they already do.
- Consumers read it only through `verify.js --stamp-status` (Skip-if-recent above; `/claude-tweaks:review` Step 1.5) and treat `present: false`, `match: false`, or a dirty tree as "no recent pass" and re-run — fail-open. A stale stamp is never a reason to trust a skip.
```

- [ ] **Step 3: Edit `plugin/skills/test/SKILL.md`**

In the `**Pipeline behavior:**` bullet list, insert after the bullet `- No \`VERIFICATION_PASSED\` + \`skip-qa\` → run types/lint/tests but skip QA story validation`:

```markdown
- No `VERIFICATION_PASSED` + runner stamp matching `HEAD` (`verify.js --stamp-status` → `match: true`, per `verification.md`'s Skip-if-recent artifact branch) → skip verification, report "runner stamp {sha} (full) matches HEAD", run QA if stories exist, set `TEST_PASSED=true`
```

- [ ] **Step 4: Edit `docs/plugin-structure.md`**

Line 40 (`plugin/bin/lib/verify/` row): after `atomic-write.js (writeJsonAtomic — the one temp-file-then-rename write behind both report.json and the count stamp)` insert `, stamp.js (#1921 — the runner-written verification pass stamp: composeStamp/writeStamp/readStamp for {git-dir}/claude-tweaks-verify-pass.json plus its one-release legacy bare-SHA twin; JSON-first read with fail-toward-absence fallback)`.

Line 125 (verify CLI row): replace the flag list `--cmd <name>=<command> [--cmd <name>=<command> ...] [--json <path>] [--log-dir <dir>]` with `--cmd <name>=<command> [--cmd <name>=<command> ...] [--json <path>] [--log-dir <dir>] [--count-stamp <path>] [--no-stamp] [--git-dir <dir>] | --stamp-status [--git-dir <dir>]`, and replace `--log-dir defaults to a fresh mkdtemp under the OS tmpdir` with `--log-dir defaults to {git-dir}/claude-tweaks-verify and --count-stamp to {git-dir}/claude-tweaks-test-count.json inside a checkout (a fresh mkdtemp under the OS tmpdir, no count stamp, outside one); a passing full-set run writes the #1921 pass stamp under the git dir unless --no-stamp; --stamp-status prints {present, sha, head, dirty, scope, fullSha, match, reportPath, legacy} and always exits 0`.

- [ ] **Step 5: Run the conformance suite and the docs pins**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/snippet-conformance.test.js"`
Expected: PASS

Run: `grep -rn 'claude-tweaks-verify-pass"' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills"`
Expected: no line containing a `>` redirect into the file (the only remaining hit outside `review/code-mode-steps.md` — fixed in Task 6 — must be a mention, not a write)

Run: `grep -c '\$(git rev-parse' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/test/verification.md"`
Expected: `0`

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/skills/test/verification.md plugin/skills/test/SKILL.md tests/bin-lib/verify/snippet-conformance.test.js docs/plugin-structure.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "verification.md: runner stamps, --stamp-status skip branch, foreground rule, no-substitution invocation (refs #1921)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 6: Readers switch to the stamp — review Step 1.5, dispatch second call, SDD reviewer instruction, build Common Step 5, skill graph, deprecations

**Files:**
- Modify: `plugin/skills/review/code-mode-steps.md` (Step 1.5, lines ~58-80)
- Modify: `plugin/skills/dispatch/task-prompt.md` (after the `CRITICAL:` block, ~line 124-128)
- Modify: `plugin/skills/build/dispatch.md` (the "Whole-branch review model" sentence)
- Modify: `plugin/skills/build/SKILL.md` (Common Step 5 `**Note:**` paragraph, ~line 257)
- Modify: `docs/skill-graph.md` (`## build` table; `## test` table's `/review` row)
- Modify: `plugin/skills/_shared/policy-deprecations.md` (append one entry)

**Interfaces:**
- Consumes: Task 5's `--stamp-status` block wording.

- [ ] **Step 1: Measure `build/SKILL.md` before editing**

Run: `wc -c "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/build/SKILL.md"`
Expected: `36959` (record the number)

- [ ] **Step 2: `review/code-mode-steps.md` Step 1.5 — both branches**

Replace the pipeline branch paragraph `Check for \`TEST_PASSED=true\` in pipeline context. If present, proceed to Step 2.` with:

```markdown
Check for `TEST_PASSED=true` in pipeline context. If present, add one belt-and-braces read of the runner's own artifact (#1921) — `node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --stamp-status` (one plain command; prints `{present, sha, head, dirty, scope, fullSha, match, reportPath, legacy}`, exit 0 always). `match: true` → proceed to Step 2. `match: false` with `TEST_PASSED=true` is reported, never silently accepted: "TEST_PASSED set but the runner stamp does not match HEAD ({stamp-sha} vs {head}) — re-running `/claude-tweaks:test`", then re-trigger `/claude-tweaks:test` and re-check.
```

Replace the standalone branch's fenced `cat "$(git rev-parse --git-dir)/claude-tweaks-verify-pass"` block and its two bullets with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --stamp-status
```

```markdown
- **`match: true`** (the stamp's `sha` equals `HEAD`, the live tree is clean, `scope` is `full`) → a recent pass; proceed to Step 2. The stamp asserts verification only (types + lint + tests) — when QA stories exist, the QA Ledger Check below still runs as usual.
- **`present: false`, `match: false`, or `dirty: true`** → no recent pass (fail-open; a stale stamp is never trusted): auto-trigger `/claude-tweaks:test`. If QA stories exist (`stories/*.yaml`), trigger `/claude-tweaks:test all` (full suite + QA). Otherwise trigger `/claude-tweaks:test` (standard suite only).
```

Keep the paragraph before the block (`Check the verification pass stamp ...`) but change `one comparison, replacing the commit-archaeology this check used to require:` to `one read of the runner-written stamp (#1921), replacing the commit-archaeology this check used to require:`.

- [ ] **Step 3: `dispatch/task-prompt.md` — one sentence after the CRITICAL block**

Immediately after the line `unverified until checked against the artifact it claims to summarize.` (the end of the `CRITICAL:` paragraph inside the second-call prompt) insert a new paragraph:

```markdown
A runner-written pass stamp matching HEAD (`verify.js --stamp-status`) is the raw artifact `artifact-verdict.js` describes — read it and its `report.json`; re-execute only when it does not match.
```

- [ ] **Step 4: `build/dispatch.md` — the reviewer must not run the full suite**

In the "Whole-branch review model" sentence, after `An explicit per-invocation \`model\` overrides the session's own \`/model\`/effort (that file's Overrides section, probed 2026-08-17) — this is what keeps a session-level model change from silently downgrading the review.` insert:

```markdown
Also instruct that reviewer, in the same dispatch text: review the diff, and run only the focused tests it names — never the full suite. Common Step 5 runs the full suite once, after the review's fix wave, and is the producer of the runner-written pass stamp (`verify.js`, #1921); a reviewer-side full run duplicates that pass without producing the artifact. The upstream step this instruction targets (SDD's `## Final Review`) is pinned in `tools/upstream-drift/manifest.yml`.
```

- [ ] **Step 5: `build/SKILL.md` Common Step 5 note — net-zero bytes**

Replace the `**Note:**` paragraph of Common Step 5 (currently: `**Note:** \`/build\` always runs verification (it is the *producer* of \`VERIFICATION_PASSED\`). The skip-if-recent rule in \`test/verification.md\` applies only to \`/test\` callers — never to this step. On a pass, also capture \`VERIFICATION_SHA=$(git rev-parse HEAD)\` — passed forward alongside \`VERIFICATION_PASSED=true\` so \`/test\`'s skip-if-recent check can detect a tree change between this step and its own invocation (see \`verification.md\`'s "Skip-if-recent" section) instead of trusting a bare boolean.`) with:

```markdown
**Note:** `/build` always runs verification (it is the *producer* of `VERIFICATION_PASSED` and of the runner-written pass stamp, #1921). The skip-if-recent rule in `test/verification.md` applies only to `/test` callers — never to this step. On a pass, read `VERIFICATION_SHA` from `report.json`'s `sha` (the runner wrote it) and pass it forward with `VERIFICATION_PASSED=true`, so `/test`'s skip-if-recent check can detect a tree change between this step and its own invocation instead of trusting a bare boolean.
```

Run: `wc -c "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/build/SKILL.md"`
Expected: a number ≤ 36959. If larger, trim words from the replacement paragraph (not from elsewhere) until it is.

- [ ] **Step 6: `docs/skill-graph.md`**

In the `## test` table, replace the `/review` row (`| \`/review\` | \`/review\` gates on \`TEST_PASSED=true\` from \`/test\`. \`/review\` never runs verification itself — that's \`/test\`'s job. |`) with:

```markdown
| `/review` | `/review` gates on `TEST_PASSED=true` from `/test`. `/review` never runs verification itself — that's `/test`'s job. Both of `/review` Step 1.5's branches read the runner-written pass stamp through `verify.js --stamp-status` (#1921): the pipeline branch as a belt-and-braces check that `TEST_PASSED` still matches `HEAD`, the standalone branch as its recent-pass test. |
```

In the `## build` table, append a row at the end of the table:

```markdown
| `/superpowers:subagent-driven-development` | `/build`'s subagent execution strategy (`build/dispatch.md`) drives it; the invocation text instructs its final whole-branch reviewer to review the diff and focused tests only, never the full suite — Common Step 5 runs the suite once after the review's fix wave as the runner stamp's producer (#1921), and `tools/upstream-drift/manifest.yml` pins the SDD `## Final Review` step that instruction targets. |
```

- [ ] **Step 7: `_shared/policy-deprecations.md` — the bare-SHA twin's removal condition**

Append at the end of the file (the heading deliberately does NOT start with a backtick — `tests/policy-deprecations-pin.test.js` treats every `` ## ` `` heading as a `RENAMED_KEYS` key):

```markdown
## Bare-SHA verify stamp twin — claude-tweaks-verify-pass (#1921)

Not a policy key: the file `{git-dir}/claude-tweaks-verify-pass` is the pre-#1921 verification pass stamp (a bare SHA an agent used to write by hand). Since #1921 `bin/verify.js` writes the canonical JSON stamp `{git-dir}/claude-tweaks-verify-pass.json` and, as the expand phase of that contract change, still writes the bare-SHA twin so an installed build running older skill prose (`review/code-mode-steps.md`'s former `cat` read) keeps finding it. `stamp.js`'s `readStamp` also reads the bare file as a `{scope: 'full', legacy: true}` fallback when the JSON is absent.

Removal condition: delete the twin write in `stamp.js`'s `writeStamp`, the legacy read branch in `readStamp`, and this entry at the first minor release after the one that shipped #1921 (resolve via `docs/shipped-versions.tsv`), once `grep -rn 'claude-tweaks-verify-pass"' plugin/skills` returns no reader of the bare file.
```

- [ ] **Step 8: Verify the prose pins still pass**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/policy-deprecations-pin.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/snippet-conformance.test.js"`
Expected: PASS

Run: `grep -rn 'claude-tweaks-verify-pass"' "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills"`
Expected: no line whose text contains `>` before the file name (AC6 — no write target remains; a mention inside `policy-deprecations.md`'s prose is fine)

Run: `node --test $(find "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests" -maxdepth 1 -name 'skill-graph*.test.js' -o -maxdepth 1 -name '*context-cost*' | head -5)` — if the find returns nothing, run instead `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/skill-audit/context-cost.test.js"`
Expected: PASS (the 40 KB ceiling holds for `build/SKILL.md`)

- [ ] **Step 9: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/skills/review/code-mode-steps.md plugin/skills/dispatch/task-prompt.md plugin/skills/build/dispatch.md plugin/skills/build/SKILL.md docs/skill-graph.md plugin/skills/_shared/policy-deprecations.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Readers switch to the runner stamp: review Step 1.5, dispatch second call, SDD reviewer skips the suite (refs #1921)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 7: Pin SDD's `## Final Review` step in the upstream-drift manifest

**Files:**
- Modify: `tools/upstream-drift/manifest.yml` (the `superpowers` dependency's `assertions:` list, ~lines 163-189)
- Test: `tools/upstream-drift/tests/manifest.test.js` (existing — run only)

**Interfaces:**
- Consumes: `build/dispatch.md`'s reviewer instruction (Task 6) as the `file:` the assertion belongs to.

- [ ] **Step 1: Confirm the literal exists in both installed superpowers versions**

Run: `grep -c "## Final Review" /Users/thomasholknielsen/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/SKILL.md /Users/thomasholknielsen/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development/SKILL.md`
Expected: `1` for each file

- [ ] **Step 2: Add the assertion**

In `tools/upstream-drift/manifest.yml`, under the `superpowers` dependency's `assertions:` list, append after the `plugin/bin/lib/hooks/worktree-detect.js` assertion (the last one):

```yaml
      - file: "plugin/skills/build/dispatch.md"
        claims: "SDD's final whole-branch review is a named step — the dispatch /build instructs to review the diff and focused tests only, never the full suite (#1921)"
        upstream-path: "skills/subagent-driven-development/SKILL.md"
        must-match: "## Final Review"
```

Match the indentation of the sibling assertions exactly (6 spaces before `- file:`).

- [ ] **Step 3: Run the drift tooling's own tests and an offline dry run**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tools/upstream-drift/tests/manifest.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tools/upstream-drift/tests/checks.test.js"`
Expected: PASS

Run: `node "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tools/upstream-drift/run.js" findings --dep superpowers --offline` (run with the worktree as cwd — the runner reads `tools/upstream-drift/manifest.yml` relative to it)
Expected: exit 0, stdout `[]` followed by `[upstream-drift] no version moved and every assertion and fixture holds — nothing to file` (verified against the pre-edit manifest on 2026-09-05: identical output, so a failing new assertion would instead surface as a finding for `plugin/skills/build/dispatch.md` in the array).

- [ ] **Step 4: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add tools/upstream-drift/manifest.yml
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Pin SDD's Final Review step in the upstream-drift manifest (refs #1921)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 8: Full-suite run through the runner (AC8)

**Files:**
- none modified (verification only)

- [ ] **Step 1: Run the full suite through the runner in the foreground, from the worktree**

Run: `node "/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/6.116.0/bin/verify.js" --log-dir "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-verify" --count-stamp "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-test-count.json" --cmd tests="npm test"` (with the worktree as cwd — pass `cwd` via `git -C`-free absolute invocation from the worktree directory)
Expected: exit 1 with exactly the 4 pre-existing failures the batch pre-flight sweep recorded in the run ledger (`tests/bin-lib/reconcile/reap-merged.test.js` ×3 — the `#1793` realpath cases — and `tests/impeccable-cli-contract.test.js` "the installed CLI matches the pinned version"), and no other `not ok` line. Note the spec's AC8 list (5 failures incl. `reconcile.test.js` FAST_CHECKS) is stale — the pre-flight baseline measured on `00035037d` is 4.

- [ ] **Step 2: Confirm the failure set by file, not by keyword**

Run: `grep "^not ok" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-verify/tests.log"`
Expected: exactly 4 lines, matching the baseline set above. Any additional line is a regression this build introduced — fix it before reporting.

---

## Self-review

- **Spec coverage:** stamp.js (T1); verify.js write gate + `--no-stamp` (T4); default paths (T4 + T5 prose + docs row); `verification.md` Step 2.5 rewrite, Skip-if-recent artifact branch, foreground rule (T5); `test/SKILL.md` row (T5); `review/code-mode-steps.md` both branches (T6); `dispatch/task-prompt.md` sentence (T6); `build/dispatch.md` + `build/SKILL.md` Common Step 5 (T6); drift assertion + drift check (T7); tests: `stamp.test.js` (T1), `cli.test.js` cases incl. the dirty-tree Gotcha (T4), prose pin (T5); `docs/skill-graph.md` rows + `policy-deprecations.md` (T6); `docs/plugin-structure.md` (T5); AC8 (T8).
- **Placeholder scan:** none.
- **Type consistency:** `readStamp` in `stamp.js` is imported into `verify.js` as `readVerifyStamp` to avoid clashing with `count-stamp.js`'s `readStamp`; `gitDir` from `report.js` is imported as `resolveGitDir` because `main` uses a local `gitDir` variable; `parseArgs` returns `gitDir`/`stampStatus`/`noStamp` exactly as Task 4 reads them.
