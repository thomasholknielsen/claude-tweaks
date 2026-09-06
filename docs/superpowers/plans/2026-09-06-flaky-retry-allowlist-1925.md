# Runner-Owned Flaky Retry Allowlist (#1925) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `verify.js` retries allowlisted flaky test files itself — every failing file listed or no retry, bounded attempts, a hit counter that escalates — so a flake no longer costs the agent a full-suite rerun.

**Architecture:** Failing-file extraction is one sniff above the existing failing-region extraction (`extract.js`). A new pure module `flaky.js` plans and applies the retry; `run.js` gains an injectable `retry` hook so a retried-to-pass suite does not fail-fast-skip the checks behind it, and exports `runOne` so retry spawns get the same log capture. `verify.js` wires the hook only when `--scope` supplied a declaration with a `flaky.files` list, renders the two `CAVEAT:` lines, and records `flakyRetried`/`retryFailed`/`retryDecision` on the report and `flakyRetried` on the stamp. `count-stamp.js` owns the per-file hit map and its 5-hit escalation. Prose: `verification.md`'s adjudication section becomes runner-first; `leftover-routing.md` gains the `flakyEscalation` row.

**Tech Stack:** Node 18+, `node --test`, no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1925/work/1925-spec.md` (record #1925)

## Global Constraints

- No new package dependencies.
- `maxRetries` default `1`, ceiling `2` (already enforced by `declaration.js`: `DEFAULT_MAX_RETRIES = 1`, `MAX_RETRIES_CEILING = 2`); escalation at `5` hits — literals in code with a comment, no policy lever.
- ANSI escapes are stripped with `/\x1b\[[0-9;]*m/g` (ESC-anchored) before every regex in the new extraction — never the record body's earlier `/^[\[[0-9;]*m/g`.
- `types`/`lint` are never retried. Only checks named `tests` or a declared suite are eligible.
- Retry log filename: `{check}-retry-{file-slug}-{i}.log`, `{file-slug}` = the file path with `/` → `-`.
- Retry spawns go through `run.js`'s `runOne` — never `execSync` inline.
- Multiple retried files in one row join with `, `.
- `plugin/skills/wrap-up/SKILL.md` is 40,708 bytes (ceiling 40,960): the one sentence Task 6 adds must keep it ≤ 40,960 (`wc -c`); the row itself lives in `leftover-routing.md`.
- Every commit message ends with `(refs #1925)` in the subject and the trailer `Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB`.
- Never `git stash`, `git stash pop`, `git checkout --`, `git reset`; stage explicit paths only.
- Working directory: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony` (confirm with `git rev-parse --show-toplevel` before any git or `node --test` command).

**Design decisions locked here (deviations from the record body, to be recorded by the build's alignment check):**
- Only paths that look like test files (`*.test.*`, `*.spec.*`, `test_*.py`, `*_test.*`) are returned by `extractFailingFiles` — a stack frame also names the source files under test, and the retry template runs a test file.
- `planRetry` has a fourth `retry: false` reason, `max-retries-0`, for `flaky.maxRetries: 0`.
- The escalation caveat renders on every run while an allowlisted file's hit count is ≥ 5 — not only on the run that crossed 5 — because the allowlist must not become permanent quietly; the wrap-up row dedupes against an already-open record.
- The retry is a `run.js` hook rather than a post-hoc pass over results, so a suite retried to a pass does not leave the checks behind it `skipped: fail-fast` (which would make `fullSet` false and suppress the stamp the spec says must be written).
- `report.json` additionally carries `checks.{name}.retryDecision` (`{retry, reason?, files?}`) whenever a plan was computed, so "why no retry" is observable.

---

### Task 1: `extractFailingFiles` in `extract.js`

**Files:**
- Modify: `plugin/bin/lib/verify/extract.js`
- Test: `tests/bin-lib/verify/extract.test.js`

**Interfaces:**
- Produces: `stripAnsi(text) → string`; `extractFailingFiles(text, family, { cwd = process.cwd() } = {}) → string[]` (deduped, log order, repo-relative — an absolute path under `cwd` is relativized; anything else is returned as printed); `TEST_FILE_RE` exported for tests.

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/verify/extract.test.js`:

```js
const { stripAnsi, extractFailingFiles } = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'extract.js'));

test('extractFailingFiles: a node --test log with one failing frame yields that test file (AC1)', () => {
  const text = [
    'not ok 1 - a fails',
    '  ---',
    '  stack: |-',
    '    at TestContext.<anonymous> (tests/a.test.js:12:5)',
    '    at Test.runInAsyncScope (node:async_hooks:206:9)',
    '  ...',
    '# tests 1', '# pass 0', '# fail 1',
  ].join('\n');
  assert.deepStrictEqual(extractFailingFiles(text, 'tap'), ['tests/a.test.js']);
});

test('extractFailingFiles: node frames name only test files — source files under test and node internals are never returned', () => {
  const text = [
    'not ok 1 - x',
    '  stack: |-',
    '    at readStamp (plugin/bin/lib/verify/stamp.js:75:3)',
    '    at TestContext.<anonymous> (tests/bin-lib/verify/stamp.test.js:40:5)',
    '    at node:internal/test_runner/test:1:1',
    '  ...',
  ].join('\n');
  assert.deepStrictEqual(extractFailingFiles(text, 'tap'), ['tests/bin-lib/verify/stamp.test.js']);
});

test('extractFailingFiles: absolute paths under cwd are relativized; the `location:` diagnostic counts too; order is log order and deduped', () => {
  const text = [
    'not ok 1 - first',
    "  location: '/repo/tests/z.test.js:3:1'",
    'not ok 2 - second',
    '    at TestContext.<anonymous> (/repo/tests/a.test.js:12:5)',
    'not ok 3 - third (same file again)',
    '    at TestContext.<anonymous> (/repo/tests/z.test.js:30:5)',
  ].join('\n');
  assert.deepStrictEqual(extractFailingFiles(text, 'tap', { cwd: '/repo' }), ['tests/z.test.js', 'tests/a.test.js']);
});

test('extractFailingFiles: frames outside failure blocks are ignored (a passing test that printed a stack is not a failing file)', () => {
  const text = [
    'ok 1 - logs a stack on purpose',
    '    at TestContext.<anonymous> (tests/noisy.test.js:5:5)',
    'not ok 2 - really fails',
    '    at TestContext.<anonymous> (tests/bad.test.js:5:5)',
    '# tests 2', '# pass 1', '# fail 1',
  ].join('\n');
  assert.deepStrictEqual(extractFailingFiles(text, 'tap'), ['tests/bad.test.js']);
});

test('extractFailingFiles: vitest FAIL line wrapped in ANSI colour yields the file (AC1, the #1837 lesson)', () => {
  const text = '\x1b[31m FAIL \x1b[0m src/x.test.ts > suite > case\n\x1b[31mAssertionError\x1b[0m\n';
  assert.deepStrictEqual(extractFailingFiles(text, 'summary'), ['src/x.test.ts']);
});

test('extractFailingFiles: vitest ❯ file lines and jest FAIL lines both parse', () => {
  const text = ['❯ src/y.test.ts (3 tests | 1 failed)', 'FAIL src/b.test.js', '  ● b > explodes', 'Tests:       2 failed, 4 passed, 6 total'].join('\n');
  assert.deepStrictEqual(extractFailingFiles(text, 'summary'), ['src/y.test.ts', 'src/b.test.js']);
});

test('extractFailingFiles: pytest FAILED path::name yields the path', () => {
  assert.deepStrictEqual(extractFailingFiles(PYTEST_FIXTURE, 'summary'), ['tests/test_b.py']);
});

test('extractFailingFiles: generic family and a log with nothing parseable yield [] — no parse, no retry (AC1)', () => {
  assert.deepStrictEqual(extractFailingFiles(GENERIC_FIXTURE, 'generic'), []);
  assert.deepStrictEqual(extractFailingFiles('not ok 1 - fails with no frame\n# fail 1', 'tap'), []);
});

test('stripAnsi removes ESC-anchored colour sequences and nothing else', () => {
  assert.strictEqual(stripAnsi('\x1b[31mred\x1b[0m [1m not a code'), 'red [1m not a code');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node -e 'const m=require("./plugin/bin/lib/verify/extract.js"); process.exit(typeof m.extractFailingFiles==="function"?0:1)'`
Expected: FAIL (exit 1 — `extractFailingFiles` is not exported yet). Then `node --test tests/bin-lib/verify/extract.test.js` — the nine new tests fail with `extractFailingFiles is not a function`.

- [ ] **Step 3: Implement** — in `plugin/bin/lib/verify/extract.js`, after `summaryLine`:

```js
// ANSI colour sequences, ESC-anchored (#1837: vitest's coloured summary
// defeated parseCounts). Stripped before every regex below — never
// applied to the region/summary paths, whose fixtures are colour-free.
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(text) { return text.replace(ANSI_RE, ''); }

// Only test files are retried — a stack frame also names the source files
// under test, and the retry template runs a test file, never a module.
const TEST_FILE_RE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?|(?:^|\/)test_[^/]+\.py|_test\.[a-z]+)$/;
const PATH = '[A-Za-z0-9_./@~-]+';
// node --test: `at fn (path:line:col)` / `at path:line:col`, and the
// `location: 'path:line:col'` diagnostic newer runners print.
const TAP_FRAME_RE = new RegExp(`(?:\\(|\\s|')(${PATH}):\\d+:\\d+\\)?`, 'g');
// vitest (` FAIL  path > name`, `❯ path (n tests | m failed)`), jest
// (`FAIL path`), pytest (`FAILED path::name`).
const SUMMARY_FAIL_RE = new RegExp(`^\\s*(?:FAIL|❯|FAILED)\\s+(${PATH})(?=\\s|::|$)`);

function relativize(file, cwd) {
  const prefix = `${cwd.replace(/\/+$/, '')}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

// Deduped, log-order, repo-relative test files named by the failing part of
// the log. `[]` whenever nothing parses — no parse ⇒ no retry (the caller
// never guesses). TAP: frames inside `not ok` blocks only, so a passing
// test that printed a stack never reads as failing.
function extractFailingFiles(text, family, { cwd = process.cwd() } = {}) {
  const lines = stripAnsi(text).split('\n');
  const found = [];
  const push = (file) => {
    const rel = relativize(file, cwd);
    if (TEST_FILE_RE.test(rel) && !rel.startsWith('node:') && !found.includes(rel)) found.push(rel);
  };
  if (family === 'tap') {
    let inFailure = false;
    for (const line of lines) {
      if (/^not ok\b/.test(line)) { inFailure = true; continue; }
      if (/^(ok \d|# )/.test(line)) { inFailure = false; continue; }
      if (!inFailure) continue;
      for (const m of line.matchAll(TAP_FRAME_RE)) push(m[1]);
    }
    return found;
  }
  if (family === 'summary') {
    for (const line of lines) {
      const m = line.match(SUMMARY_FAIL_RE);
      if (m) push(m[1]);
    }
    return found;
  }
  return found;
}
```

and extend the export block:

```js
module.exports = {
  sniffFamily, extractFailingRegion, parseCounts, summaryLine,
  stripAnsi, extractFailingFiles, TEST_FILE_RE,
  MAX_REGION_LINES, GENERIC_TAIL_LINES, MAX_LINE_CHARS,
};
```

Update the file's header comment: add one sentence — "`extractFailingFiles` (#1925) names the failing TEST files the same way, ANSI-stripped, for the runner's flaky retry; `[]` when nothing parses."

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/bin-lib/verify/extract.test.js`
Expected: PASS (all prior tests plus the nine new ones).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/verify/extract.js tests/bin-lib/verify/extract.test.js
git commit -m "Add extractFailingFiles to the verify runner — ANSI-stripped failing test files per family (refs #1925)"
```

---

### Task 2: `flaky.js` (plan/apply/run retries) and the `run.js` retry hook

**Files:**
- Create: `plugin/bin/lib/verify/flaky.js`
- Modify: `plugin/bin/lib/verify/run.js` (export `runOne`; add the `retry` hook)
- Test: `tests/bin-lib/verify/flaky.test.js` (new), `tests/bin-lib/verify/run.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (the caller passes `failingFiles`).
- Produces:
  - `planRetry({ failingFiles, flaky, retry, suite }) → { retry: true, files, command: [{file, cmd}] } | { retry: false, reason }` with `reason ∈ 'no-parse' | 'unlisted: [a, b]' | 'no-template' | 'max-retries-0'`; the `unlisted` shape also carries `unlisted: string[]`.
  - `retryLogName(checkName, file, attempt) → string` (`{check}-retry-{slug}-{i}`).
  - `applyRetryResults(check, attempts) → check'` — `attempts: [{file, attempt, exitCode, logPath, durationMs, spawnError?}]`; every attempted file passed ⇒ `{...check, exitCode: 0, flakyRetried: files, retryAttempts}`; else `{...check, flakyRetried: [], retryFailed: [files with no pass], retryAttempts}`.
  - `runRetries({ check, plan, maxRetries, logDir, runOne, spawnImpl, now }) → Promise<check'>` — serial in `plan.command` order, up to `maxRetries` attempts per file, stop at a file's first pass, short-circuit after the first file that exhausts.
  - `flakyCaveatLines(checks) → string[]` — one `CAVEAT: flaky-retried: {files} — passed on isolated rerun; see {passing retry logs}` per check with `flakyRetried.length > 0`.
  - `run.js`: `runOne` exported; `runChecks({ cmds, logDir, spawnImpl, now, retry })` where `retry(result, ctx) → Promise<result>` (default identity) is awaited for every failed, non-skipped result of a `tests`-or-unknown check before the fail-fast decision; never for `types`/`lint`.

- [ ] **Step 1: Write the failing tests** — create `tests/bin-lib/verify/flaky.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  planRetry, applyRetryResults, retryLogName, runRetries, flakyCaveatLines,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'flaky.js'));

const FLAKY = { files: ['tests/a.test.js', 'tests/b.test.js'], maxRetries: 1 };
const RETRY = { tests: 'node --test {file}' };

test('planRetry: every failing file listed + a template → retry with one command per file, log order kept (AC2)', () => {
  const plan = planRetry({ failingFiles: ['tests/b.test.js', 'tests/a.test.js'], flaky: FLAKY, retry: RETRY, suite: 'tests' });
  assert.deepStrictEqual(plan, {
    retry: true,
    files: ['tests/b.test.js', 'tests/a.test.js'],
    command: [
      { file: 'tests/b.test.js', cmd: 'node --test tests/b.test.js' },
      { file: 'tests/a.test.js', cmd: 'node --test tests/a.test.js' },
    ],
  });
});

test('planRetry: any unlisted failing file → no retry, and the reason names every unlisted file (AC2)', () => {
  const plan = planRetry({ failingFiles: ['tests/a.test.js', 'tests/real.test.js', 'tests/other.test.js'], flaky: FLAKY, retry: RETRY, suite: 'tests' });
  assert.strictEqual(plan.retry, false);
  assert.strictEqual(plan.reason, 'unlisted: [tests/real.test.js, tests/other.test.js]');
  assert.deepStrictEqual(plan.unlisted, ['tests/real.test.js', 'tests/other.test.js']);
});

test('planRetry: empty failingFiles → no-parse; no template for the suite → no-template; maxRetries 0 → max-retries-0 (AC2)', () => {
  assert.deepStrictEqual(planRetry({ failingFiles: [], flaky: FLAKY, retry: RETRY, suite: 'tests' }), { retry: false, reason: 'no-parse' });
  assert.deepStrictEqual(planRetry({ failingFiles: ['tests/a.test.js'], flaky: FLAKY, retry: {}, suite: 'tests' }), { retry: false, reason: 'no-template' });
  assert.deepStrictEqual(planRetry({ failingFiles: ['tests/a.test.js'], flaky: FLAKY, retry: RETRY, suite: 'unit' }), { retry: false, reason: 'no-template' });
  assert.deepStrictEqual(planRetry({ failingFiles: ['tests/a.test.js'], flaky: { files: ['tests/a.test.js'], maxRetries: 0 }, retry: RETRY, suite: 'tests' }), { retry: false, reason: 'max-retries-0' });
});

test('planRetry: the allowlist is suite-agnostic — a listed file retries under whichever suite it failed in, with that suite\'s template', () => {
  const plan = planRetry({ failingFiles: ['tests/a.test.js'], flaky: FLAKY, retry: { unit: 'pnpm --filter api test -- {file}' }, suite: 'unit' });
  assert.deepStrictEqual(plan.command, [{ file: 'tests/a.test.js', cmd: 'pnpm --filter api test -- tests/a.test.js' }]);
});

test('retryLogName namespaces per file and per attempt', () => {
  assert.strictEqual(retryLogName('tests', 'tests/bin-lib/a.test.js', 2), 'tests-retry-tests-bin-lib-a.test.js-2');
});

test('applyRetryResults: every attempted file passed → exitCode 0 + flakyRetried; a file with no pass → retryFailed and the original exit code kept', () => {
  const check = { name: 'tests', command: 'npm test', exitCode: 1, durationMs: 5, logPath: '/l/tests.log' };
  const ok = applyRetryResults(check, [
    { file: 'tests/a.test.js', attempt: 1, exitCode: 1, logPath: '/l/a1.log', durationMs: 1 },
    { file: 'tests/a.test.js', attempt: 2, exitCode: 0, logPath: '/l/a2.log', durationMs: 1 },
    { file: 'tests/b.test.js', attempt: 1, exitCode: 0, logPath: '/l/b1.log', durationMs: 1 },
  ]);
  assert.strictEqual(ok.exitCode, 0);
  assert.deepStrictEqual(ok.flakyRetried, ['tests/a.test.js', 'tests/b.test.js']);
  assert.strictEqual(ok.retryAttempts.length, 3);
  const bad = applyRetryResults(check, [
    { file: 'tests/a.test.js', attempt: 1, exitCode: 1, logPath: '/l/a1.log', durationMs: 1 },
  ]);
  assert.strictEqual(bad.exitCode, 1);
  assert.deepStrictEqual(bad.flakyRetried, []);
  assert.deepStrictEqual(bad.retryFailed, ['tests/a.test.js']);
});

// A scripted runOne: `script[file]` is the list of exit codes successive
// attempts return; records every call in order.
function fakeRunOne(script) {
  const calls = [];
  const runOne = async ({ name, command }) => {
    const file = command.replace(/^run /, '');
    const codes = script[file] || [0];
    const attempt = calls.filter((c) => c.file === file).length;
    calls.push({ name, file });
    return { name, command, exitCode: codes[Math.min(attempt, codes.length - 1)], durationMs: 1, logPath: `/l/${name}.log` };
  };
  return { runOne, calls };
}

test('runRetries: files run serially in plan order, each stops at its first pass, and the result carries flakyRetried', async () => {
  const { runOne, calls } = fakeRunOne({ 'tests/a.test.js': [1, 0], 'tests/b.test.js': [0] });
  const plan = { retry: true, files: ['tests/a.test.js', 'tests/b.test.js'], command: [{ file: 'tests/a.test.js', cmd: 'run tests/a.test.js' }, { file: 'tests/b.test.js', cmd: 'run tests/b.test.js' }] };
  const out = await runRetries({ check: { name: 'tests', exitCode: 1 }, plan, maxRetries: 2, logDir: '/l', runOne, spawnImpl: null, now: () => 0 });
  assert.deepStrictEqual(calls.map((c) => c.name), ['tests-retry-tests-a.test.js-1', 'tests-retry-tests-a.test.js-2', 'tests-retry-tests-b.test.js-1']);
  assert.strictEqual(out.exitCode, 0);
  assert.deepStrictEqual(out.flakyRetried, ['tests/a.test.js', 'tests/b.test.js']);
});

test('runRetries: a file that exhausts maxRetries fails the run and short-circuits the files after it', async () => {
  const { runOne, calls } = fakeRunOne({ 'tests/a.test.js': [1, 1, 1], 'tests/b.test.js': [0] });
  const plan = { retry: true, files: ['tests/a.test.js', 'tests/b.test.js'], command: [{ file: 'tests/a.test.js', cmd: 'run tests/a.test.js' }, { file: 'tests/b.test.js', cmd: 'run tests/b.test.js' }] };
  const out = await runRetries({ check: { name: 'tests', exitCode: 1 }, plan, maxRetries: 2, logDir: '/l', runOne, spawnImpl: null, now: () => 0 });
  assert.strictEqual(calls.length, 2, 'two attempts for a, none for b');
  assert.strictEqual(out.exitCode, 1);
  assert.deepStrictEqual(out.retryFailed, ['tests/a.test.js']);
  assert.deepStrictEqual(out.flakyRetried, []);
});

test('flakyCaveatLines: one line per retried check naming the files and the passing retry logs; none for an ordinary check', () => {
  const lines = flakyCaveatLines([
    { name: 'lint', exitCode: 0 },
    { name: 'tests', exitCode: 0, flakyRetried: ['tests/a.test.js'], retryAttempts: [{ file: 'tests/a.test.js', attempt: 1, exitCode: 1, logPath: '/l/a1.log' }, { file: 'tests/a.test.js', attempt: 2, exitCode: 0, logPath: '/l/a2.log' }] },
  ]);
  assert.deepStrictEqual(lines, ['CAVEAT: flaky-retried: tests/a.test.js — passed on isolated rerun; see /l/a2.log']);
});
```

and append to `tests/bin-lib/verify/run.test.js`:

```js
test('a failed tests check is handed to the retry hook, and a hook that returns exitCode 0 un-skips the checks behind it (#1925)', async () => {
  const { spawnImpl } = makeFakeSpawn({ 'run-tests': { exit: 1 }, 'run-other': { exit: 0 } });
  const seen = [];
  const retry = async (result, ctx) => {
    seen.push({ name: result.name, hasLogDir: typeof ctx.logDir === 'string', hasSpawn: typeof ctx.spawnImpl === 'function' });
    return { ...result, exitCode: 0, flakyRetried: ['tests/a.test.js'] };
  };
  const results = await runChecks({
    cmds: [{ name: 'tests', command: 'run-tests' }, { name: 'other', command: 'run-other' }],
    logDir: tmpLogDir(), spawnImpl, now: Date.now, retry,
  });
  assert.deepStrictEqual(seen, [{ name: 'tests', hasLogDir: true, hasSpawn: true }]);
  assert.strictEqual(results[0].exitCode, 0);
  assert.deepStrictEqual(results[0].flakyRetried, ['tests/a.test.js']);
  assert.strictEqual(results[1].exitCode, 0, 'other ran instead of being fail-fast skipped');
});

test('the retry hook is never called for types or lint, and a hook that keeps the failure keeps fail-fast (#1925 AC7)', async () => {
  const { spawnImpl } = makeFakeSpawn({ 'run-lint': { exit: 1 }, 'run-tests': { exit: 0 } });
  const seen = [];
  const retry = async (result) => { seen.push(result.name); return result; };
  const results = await runChecks({
    cmds: [{ name: 'lint', command: 'run-lint' }, { name: 'tests', command: 'run-tests' }],
    logDir: tmpLogDir(), spawnImpl, now: Date.now, retry,
  });
  assert.deepStrictEqual(seen, []);
  assert.strictEqual(results[1].skipped, 'fail-fast');
});

test('runOne is exported for retry spawns and records its log under logDir (#1925)', async () => {
  const { spawnImpl } = makeFakeSpawn({ 'run-x': { exit: 0, output: 'hi\n' } });
  const logDir = tmpLogDir();
  const r = await runOne({ name: 'tests-retry-tests-a.test.js-1', command: 'run-x', logDir, spawnImpl, now: Date.now });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(path.basename(r.logPath), 'tests-retry-tests-a.test.js-1.log');
  assert.strictEqual(fs.readFileSync(r.logPath, 'utf8'), 'hi\n');
});
```

`run.test.js`'s require line must also destructure `runOne`: `const { runChecks, runOne } = require(...)`. (Check the top of the file — `fs` and `path` are already required there.)

- [ ] **Step 2: Run to verify they fail**

Run: `node -e 'const m=require("./plugin/bin/lib/verify/run.js"); process.exit(typeof m.runOne==="function"?0:1)'`
Expected: FAIL (exit 1). Then `node --test tests/bin-lib/verify/flaky.test.js` fails with `Cannot find module '.../flaky.js'`, and `node --test tests/bin-lib/verify/run.test.js` fails the three new tests.

- [ ] **Step 3: Implement `flaky.js`**

```js
// plugin/bin/lib/verify/flaky.js — runner-owned flaky retry (#1925). Pure:
// planRetry decides from data only ("every failing file listed or no
// retry"), runRetries spawns through an injected runOne (the same log
// capture, spawn-error recording, and duration as any check), and
// applyRetryResults folds the attempts back into the check result. The
// hit counter and its escalation live in count-stamp.js; the caveat text
// for a retried pass lives here so verify.js renders one shape.
'use strict';

function planRetry({ failingFiles, flaky, retry, suite }) {
  if (!Array.isArray(failingFiles) || failingFiles.length === 0) return { retry: false, reason: 'no-parse' };
  const listed = new Set((flaky && flaky.files) || []);
  const unlisted = failingFiles.filter((f) => !listed.has(f));
  if (unlisted.length) return { retry: false, reason: `unlisted: [${unlisted.join(', ')}]`, unlisted };
  const template = retry && retry[suite];
  if (typeof template !== 'string') return { retry: false, reason: 'no-template' };
  if (!flaky || !(flaky.maxRetries >= 1)) return { retry: false, reason: 'max-retries-0' };
  const files = failingFiles.slice();
  return { retry: true, files, command: files.map((file) => ({ file, cmd: template.replace(/\{file\}/g, file) })) };
}

// {check}-retry-{file-slug}-{i}: per file AND per attempt, so two files
// retried in one run never share a log path (record Gotchas).
function retryLogName(checkName, file, attempt) {
  return `${checkName}-retry-${file.replace(/\//g, '-')}-${attempt}`;
}

function applyRetryResults(check, attempts) {
  const files = [...new Set(attempts.map((a) => a.file))];
  const passed = files.filter((f) => attempts.some((a) => a.file === f && a.exitCode === 0));
  const failed = files.filter((f) => !passed.includes(f));
  if (files.length > 0 && failed.length === 0) return { ...check, exitCode: 0, flakyRetried: files, retryAttempts: attempts };
  return { ...check, flakyRetried: [], retryFailed: failed, retryAttempts: attempts };
}

// Serial, plan order; a file stops at its first pass; the first file to
// exhaust maxRetries ends the run (remaining files are not attempted).
async function runRetries({ check, plan, maxRetries, logDir, runOne, spawnImpl, now }) {
  const attempts = [];
  for (const { file, cmd } of plan.command) {
    let passed = false;
    for (let attempt = 1; attempt <= maxRetries && !passed; attempt++) {
      const r = await runOne({ name: retryLogName(check.name, file, attempt), command: cmd, logDir, spawnImpl, now });
      const record = { file, attempt, exitCode: r.exitCode, logPath: r.logPath, durationMs: r.durationMs };
      if (r.spawnError !== undefined) record.spawnError = r.spawnError;
      attempts.push(record);
      passed = r.exitCode === 0;
    }
    if (!passed) break;
  }
  return applyRetryResults(check, attempts);
}

function flakyCaveatLines(checks) {
  const lines = [];
  for (const check of checks) {
    if (!check.flakyRetried || check.flakyRetried.length === 0) continue;
    const logs = (check.retryAttempts || []).filter((a) => a.exitCode === 0).map((a) => a.logPath);
    lines.push(`CAVEAT: flaky-retried: ${check.flakyRetried.join(', ')} — passed on isolated rerun; see ${logs.join(', ')}`);
  }
  return lines;
}

module.exports = { planRetry, retryLogName, applyRetryResults, runRetries, flakyCaveatLines };
```

- [ ] **Step 4: Add the hook to `run.js`** — replace `runOrSkip` and `runChecks`'s signature, and the export:

```js
// Runs c unless skip is true, in which case it records a fail-fast skip
// without spawning. A failed result is offered to `retry` (verify.js's
// flaky hook, #1925) BEFORE the fail-fast decision, so a suite retried to
// a pass never leaves the checks behind it skipped. `anyFailed ||
// failed(r)` short-circuits on a skip result (anyFailed is already true
// whenever skip is true), so anyFailed stays accurate either way.
async function runOrSkip(c, ctx, skip) {
  if (skip) return { name: c.name, command: c.command, skipped: 'fail-fast' };
  const r = await runOne({ ...c, ...ctx });
  return failed(r) ? ctx.retry(r, ctx) : r;
}

// cmds: [{name, command}] in argv order. Returns results in stage order:
// stage 1 (types/lint, argv order), tests, then unknown names in argv order.
// `retry(result, ctx)` is awaited for every failed tests/unknown result
// (never types/lint — deterministic, never retried) and may return a
// replacement result; the default keeps the failure as is.
async function runChecks({
  cmds, logDir, spawnImpl = require('child_process').spawn, now = Date.now, retry = async (r) => r,
}) {
  const ctx = { logDir, spawnImpl, now, retry };
```

(the rest of `runChecks` is unchanged) and:

```js
module.exports = { runChecks, runOne };
```

- [ ] **Step 5: Run to verify they pass**

Run: `node --test tests/bin-lib/verify/flaky.test.js tests/bin-lib/verify/run.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/verify/flaky.js plugin/bin/lib/verify/run.js tests/bin-lib/verify/flaky.test.js tests/bin-lib/verify/run.test.js
git commit -m "Add flaky.js — planRetry/runRetries/applyRetryResults — and a retry hook + runOne export in run.js (refs #1925)"
```

---

### Task 3: Wire the retry into `verify.js`; report, table, caveat, stamp fields

**Files:**
- Modify: `plugin/bin/verify.js` (requires, `statusOf`, `main`'s run + stamp + stdout sections)
- Modify: `plugin/bin/lib/verify/report.js` (`entryFor`, `composeReport`)
- Test: `tests/bin-lib/verify/cli.test.js`, `tests/bin-lib/verify/report.test.js`

**Interfaces:**
- Consumes: Task 1's `extractFailingFiles`, `stripAnsi`; Task 2's `planRetry`, `runRetries`, `flakyCaveatLines`, `runOne`, `runChecks({retry})`.
- Produces: `report.json.checks.{name}.flakyRetried | retryFailed | retryAttempts[{file, attempt, exitCode, logPath}] | retryDecision{retry, reason?, files?}`; table row `pass (flaky-retried: a, b)`; the `CAVEAT: flaky-retried:` line; stamp `flakyRetried` = union across checks. `composeReport` accepts `flakyEscalation` (Task 4 fills it; this task passes `[]`).

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/verify/cli.test.js` (after the existing `--changed-files` tests):

```js
// A repo whose string-form tests command prints a TAP failure naming
// `failingFile` and exits 1, plus a retry template whose command writes a
// marker with the retried file and exits `retryExit`. `flaky` overrides
// the declaration's flaky section (default: tests/flaky.test.js listed).
function flakyRepo({ failingFile = 'tests/flaky.test.js', retryExit = 0, flaky = { files: ['tests/flaky.test.js'] }, extraDecl = {} } = {}) {
  const r = tmpGitRepo();
  const tap = ['not ok 1 - a flaky one', '  ---', '  stack: |-', `    at TestContext.<anonymous> (${failingFile}:12:5)`, '  ...', '# tests 1', '# pass 0', '# fail 1'].join('\\n');
  fs.writeFileSync(path.join(r.repo, 'fail.js'), `process.stdout.write(${JSON.stringify(tap)} + '\\n'); process.exit(1);\n`);
  fs.writeFileSync(path.join(r.repo, 'retry.js'), `require('fs').writeFileSync('retry.marker', process.argv[2]); process.exit(${retryExit});\n`);
  const decl = {
    checks: { tests: 'node fail.js' },
    retry: { tests: 'node retry.js {file}' },
    rules: [{ match: 'src/**', suites: ['tests'], static: true }],
    flaky,
    ...extraDecl,
  };
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify(decl));
  r.git('add', '.');
  r.git('commit', '-q', '-m', 'flaky fixture');
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  const args = ['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', branch, '--cmd', 'tests=node fail.js'];
  return { ...r, branch, args, marker: path.join(r.repo, 'retry.marker'), retryLog: (i) => path.join(r.gitDir, 'claude-tweaks-verify', `tests-retry-tests-flaky.test.js-${i}.log`) };
}

test('flaky retry: an allowlisted failing file is re-run through the template and the run passes with flakyRetried on row, report, and stamp (#1925 AC3)', async () => {
  const r = flakyRepo();
  const { code, stdout, stderr } = await runCli(r.args, { cwd: r.repo });
  assert.strictEqual(code, 0, stderr);
  assert.match(stdout, /\| tests \| pass \(flaky-retried: tests\/flaky\.test\.js\) \|/);
  assert.match(stdout, /^CAVEAT: flaky-retried: tests\/flaky\.test\.js — passed on isolated rerun; see .*tests-retry-tests-flaky\.test\.js-1\.log$/m);
  assert.strictEqual(fs.readFileSync(r.marker, 'utf8'), 'tests/flaky.test.js');
  const report = JSON.parse(fs.readFileSync(path.join(r.gitDir, 'claude-tweaks-verify', 'report.json'), 'utf8'));
  assert.strictEqual(report.pass, true);
  assert.deepStrictEqual(report.checks.tests.flakyRetried, ['tests/flaky.test.js']);
  assert.deepStrictEqual(report.checks.tests.retryDecision, { retry: true, files: ['tests/flaky.test.js'] });
  assert.strictEqual(report.checks.tests.retryAttempts.length, 1);
  assert.strictEqual(report.checks.tests.exitCode, 0);
  const stamp = stampOf(r.gitDir);
  assert.deepStrictEqual(stamp.flakyRetried, ['tests/flaky.test.js']);
  assert.strictEqual(stamp.scope, 'full');
});

test('flaky retry: an unlisted failing file is an ordinary failure — no retry spawned, no stamp, the decision names it (#1925 AC4)', async () => {
  const r = flakyRepo({ failingFile: 'tests/real.test.js' });
  const { code, stdout } = await runCli(r.args, { cwd: r.repo });
  assert.strictEqual(code, 1);
  assert.match(stdout, /\| tests \| fail \|/);
  assert.doesNotMatch(stdout, /flaky-retried/);
  assert.ok(!fs.existsSync(r.marker), 'no retry command may run for an unlisted file');
  assert.ok(!fs.existsSync(r.retryLog(1)));
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
  const report = JSON.parse(fs.readFileSync(path.join(r.gitDir, 'claude-tweaks-verify', 'report.json'), 'utf8'));
  assert.deepStrictEqual(report.checks.tests.retryDecision, { retry: false, reason: 'unlisted: [tests/real.test.js]' });
  assert.strictEqual('flakyRetried' in report.checks.tests, false);
});

test('flaky retry: maxRetries 2 performs at most two attempts and an exhausted file fails the run with retryFailed; maxRetries 3 is rejected by the declaration (#1925 AC6)', async () => {
  const r = flakyRepo({ retryExit: 1, flaky: { files: ['tests/flaky.test.js'], maxRetries: 2 } });
  const { code, stdout } = await runCli(r.args, { cwd: r.repo });
  assert.strictEqual(code, 1);
  assert.match(stdout, /\| tests \| fail \|/);
  assert.ok(fs.existsSync(r.retryLog(1)) && fs.existsSync(r.retryLog(2)), 'two attempts logged');
  assert.ok(!fs.existsSync(r.retryLog(3)));
  const report = JSON.parse(fs.readFileSync(path.join(r.gitDir, 'claude-tweaks-verify', 'report.json'), 'utf8'));
  assert.deepStrictEqual(report.checks.tests.retryFailed, ['tests/flaky.test.js']);
  assert.strictEqual(report.checks.tests.retryAttempts.length, 2);
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));

  const r3 = flakyRepo({ flaky: { files: ['tests/flaky.test.js'], maxRetries: 3 } });
  const three = await runCli(r3.args, { cwd: r3.repo });
  assert.strictEqual(three.code, 2);
  assert.match(three.stderr, /flaky\.maxRetries: must be an integer from 0 to 2/);
});

test('flaky retry: a failing lint check never triggers a retry and still fail-fasts tests (#1925 AC7)', async () => {
  const r = flakyRepo();
  const { code } = await runCli([...r.args, '--cmd', 'lint=node fail.js'], { cwd: r.repo });
  assert.strictEqual(code, 1);
  assert.ok(!fs.existsSync(r.marker));
  const report = JSON.parse(fs.readFileSync(path.join(r.gitDir, 'claude-tweaks-verify', 'report.json'), 'utf8'));
  assert.strictEqual(report.checks.tests.skipped, 'fail-fast');
  assert.strictEqual('retryDecision' in report.checks.lint, false);
});

test('flaky retry: without --scope (no declaration) a failing tests check is never retried, byte-for-byte today\'s behavior (#1925)', async () => {
  const r = flakyRepo();
  const { code, stdout } = await runCli(['--cmd', 'tests=node fail.js'], { cwd: r.repo });
  assert.strictEqual(code, 1);
  assert.doesNotMatch(stdout, /flaky-retried/);
  assert.ok(!fs.existsSync(r.marker));
});

test('flaky retry: a retried-to-pass suite does not fail-fast-skip the suites behind it, so the full set stamps (#1925 design)', async () => {
  const r = tmpGitRepo();
  const tap = ['not ok 1 - flaky', '    at TestContext.<anonymous> (tests/flaky.test.js:1:1)', '# tests 1', '# pass 0', '# fail 1'].join('\\n');
  fs.writeFileSync(path.join(r.repo, 'fail.js'), `process.stdout.write(${JSON.stringify(tap)} + '\\n'); process.exit(1);\n`);
  fs.writeFileSync(path.join(r.repo, 'retry.js'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(r.repo, 'other.js'), "require('fs').writeFileSync('other.marker', 'ran');\n");
  const decl = {
    checks: { tests: { unit: 'node fail.js', other: 'node other.js' } },
    retry: { unit: 'node retry.js {file}' },
    rules: [{ match: 'src/**', suites: ['unit'], static: true }],
    flaky: { files: ['tests/flaky.test.js'] },
  };
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify(decl));
  r.git('add', '.');
  r.git('commit', '-q', '-m', 'two suites');
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  const { code, stdout, stderr } = await runCli(['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', branch, '--cmd', 'unit=node fail.js', '--cmd', 'other=node other.js'], { cwd: r.repo });
  assert.strictEqual(code, 0, stderr);
  assert.match(stdout, /\| unit \| pass \(flaky-retried: tests\/flaky\.test\.js\) \|/);
  assert.match(stdout, /\| other \| pass \|/);
  assert.ok(fs.existsSync(path.join(r.repo, 'other.marker')), 'other ran after unit was retried to a pass');
  assert.deepStrictEqual(stampOf(r.gitDir).flakyRetried, ['tests/flaky.test.js']);
});
```

and append to `tests/bin-lib/verify/report.test.js` (its top already requires `composeReport`; add a check-entry test):

```js
test('composeReport carries flakyRetried/retryFailed/retryAttempts/retryDecision on a check entry and flakyEscalation at top level only when non-empty (#1925)', () => {
  const retried = {
    name: 'tests', command: 'x', exitCode: 0, durationMs: 1, logPath: '/l/tests.log',
    flakyRetried: ['tests/a.test.js'],
    retryAttempts: [{ file: 'tests/a.test.js', attempt: 1, exitCode: 0, logPath: '/l/r1.log', durationMs: 1 }],
    retryDecision: { retry: true, files: ['tests/a.test.js'] },
  };
  const plain = { name: 'lint', command: 'y', exitCode: 0, durationMs: 1, logPath: '/l/lint.log' };
  const git = { sha: 'abc', dirty: false };
  const report = composeReport({ checks: [retried, plain], startedAt: 't', durationMs: 2, git, flakyEscalation: [{ file: 'tests/a.test.js', hits: 5 }] });
  assert.deepStrictEqual(report.checks.tests.flakyRetried, ['tests/a.test.js']);
  assert.deepStrictEqual(report.checks.tests.retryAttempts, [{ file: 'tests/a.test.js', attempt: 1, exitCode: 0, logPath: '/l/r1.log' }]);
  assert.deepStrictEqual(report.checks.tests.retryDecision, { retry: true, files: ['tests/a.test.js'] });
  assert.strictEqual('flakyRetried' in report.checks.lint, false);
  assert.deepStrictEqual(report.flakyEscalation, [{ file: 'tests/a.test.js', hits: 5 }]);
  const none = composeReport({ checks: [plain], startedAt: 't', durationMs: 2, git, flakyEscalation: [] });
  assert.strictEqual('flakyEscalation' in none, false);
  const failed = composeReport({ checks: [{ ...plain, name: 'tests', exitCode: 1, retryFailed: ['tests/a.test.js'], flakyRetried: [] }], startedAt: 't', durationMs: 2, git });
  assert.deepStrictEqual(failed.checks.tests.retryFailed, ['tests/a.test.js']);
  assert.strictEqual('flakyRetried' in failed.checks.tests, false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node -e 'const s=require("fs").readFileSync("plugin/bin/verify.js","utf8"); process.exit(s.includes("flaky-retried")?0:1)'`
Expected: FAIL (exit 1). Then `node --test tests/bin-lib/verify/cli.test.js tests/bin-lib/verify/report.test.js` — the six new CLI tests and the report test fail.

- [ ] **Step 3: `report.js`** — in `entryFor`, after the `counts` line:

```js
  if (check.flakyRetried && check.flakyRetried.length) entry.flakyRetried = check.flakyRetried;
  if (check.retryFailed && check.retryFailed.length) entry.retryFailed = check.retryFailed;
  if (check.retryAttempts) entry.retryAttempts = check.retryAttempts.map(({ file, attempt, exitCode, logPath }) => ({ file, attempt, exitCode, logPath }));
  if (check.retryDecision) entry.retryDecision = check.retryDecision;
```

and in `composeReport`: add `flakyEscalation = []` to the destructured params and, next to the `scope` line:

```js
  // #1925: only when an allowlisted file has crossed the escalation
  // threshold — absence over an empty array, same as the fields above.
  if (Array.isArray(flakyEscalation) && flakyEscalation.length) report.flakyEscalation = flakyEscalation;
```

- [ ] **Step 4: `verify.js`** — requires (top of file, next to the existing `extract`/`run` requires):

```js
const { sniffFamily, extractFailingRegion, parseCounts, summaryLine, extractFailingFiles, stripAnsi } = require('./lib/verify/extract');
const { runChecks, runOne } = require('./lib/verify/run');
const { planRetry, runRetries, flakyCaveatLines } = require('./lib/verify/flaky');
```

(merge into the existing destructures rather than adding duplicate `require` lines — check what each line already imports.) `statusOf`:

```js
function statusOf(check) {
  if (check.skipped) return `skipped: ${check.skipped}`;
  if (check.exitCode === 0 && check.flakyRetried && check.flakyRetried.length) return `pass (flaky-retried: ${check.flakyRetried.join(', ')})`;
  return check.exitCode === 0 ? 'pass' : 'fail';
}
```

In `main`, replace the `const results = ...` line with the hook + run:

```js
  // Flaky retry (#1925): only a --scope run with a declaration that lists
  // flaky files ever retries; without one every failure is byte-for-byte
  // today's. Eligible checks are `tests` or a declared suite — never
  // types/lint (run.js never offers those to the hook either). The decision
  // is recorded on the check whether or not a retry ran.
  const flakyEnabled = Boolean(decl && decl.flaky.files.length > 0);
  const retryHook = async (result, ctx) => {
    if (!flakyEnabled) return result;
    if (!(result.name === 'tests' || decl.suites.includes(result.name))) return result;
    let text = '';
    try { text = fs.readFileSync(result.logPath, 'utf8'); } catch { return result; }
    const plain = stripAnsi(text);
    const failingFiles = extractFailingFiles(plain, sniffFamily(plain));
    const plan = planRetry({ failingFiles, flaky: decl.flaky, retry: decl.retry, suite: result.name });
    const decision = plan.retry ? { retry: true, files: plan.files } : { retry: false, reason: plan.reason };
    if (!plan.retry) return { ...result, retryDecision: decision };
    const retried = await runRetries({
      check: result, plan, maxRetries: decl.flaky.maxRetries,
      logDir: ctx.logDir, runOne, spawnImpl: ctx.spawnImpl, now: ctx.now,
    });
    return { ...retried, retryDecision: decision };
  };
  const results = sel && sel.mode === 'none' ? [] : (await runChecks({ cmds, logDir, retry: retryHook })).map(enrich);
  const retriedFiles = [...new Set(results.flatMap((c) => c.flakyRetried || []))];
```

`enrich` spreads the result, so `flakyRetried`/`retryFailed`/`retryAttempts`/`retryDecision` survive it; a retried pass has `exitCode 0`, so `failingRegion` is `null` while `summary` still reports the original run's counts — that is intended (the row's status column says `flaky-retried`).

In the `composeStamp({...})` call replace `flakyRetried: []` with `flakyRetried: retriedFiles`. In `composeReport({...})` add `flakyEscalation: []` (Task 4 replaces the literal). In the stdout section, after the `testCountRegression` caveat line:

```js
  for (const line of flakyCaveatLines(results)) lines.push('', line);
```

- [ ] **Step 5: Run to verify they pass**

Run: `node --test tests/bin-lib/verify/cli.test.js tests/bin-lib/verify/report.test.js tests/bin-lib/verify/run.test.js tests/bin-lib/verify/stamp.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/verify.js plugin/bin/lib/verify/report.js tests/bin-lib/verify/cli.test.js tests/bin-lib/verify/report.test.js
git commit -m "verify.js retries allowlisted flaky files under --scope — flaky-retried row, CAVEAT line, report and stamp fields (refs #1925)"
```

---

### Task 4: Hit counter and escalation in `count-stamp.js`

**Files:**
- Modify: `plugin/bin/lib/verify/count-stamp.js`
- Modify: `plugin/bin/verify.js` (the count-stamp block)
- Test: `tests/bin-lib/verify/count-stamp.test.js`, `tests/bin-lib/verify/cli.test.js`

**Interfaces:**
- Consumes: Task 3's `retriedFiles`, `decl.flaky.files`, `composeReport({flakyEscalation})`.
- Produces: `FLAKY_ESCALATION_HITS = 5`; `nextFlakyHits(previous, retriedFiles, allowlist) → {file: n}` (previous map pruned to the allowlist, +1 per retried file); `flakyEscalations(hits) → [{file, hits}]` (sorted by file, `hits ≥ 5`); `escalationCaveatLine({file, hits}) → string`. Count stamp shape: `{tests, sha, recordedAt, flakyHits}`.

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/verify/count-stamp.test.js` (extend its require to destructure `nextFlakyHits, flakyEscalations, escalationCaveatLine, FLAKY_ESCALATION_HITS`):

```js
test('nextFlakyHits increments each retried file, keeps other allowlisted counts, and prunes files no longer allowlisted (#1925)', () => {
  const previous = { tests: 10, sha: 'a', recordedAt: 't', flakyHits: { 'tests/a.test.js': 2, 'tests/gone.test.js': 7, 'tests/b.test.js': 1 } };
  assert.deepStrictEqual(
    nextFlakyHits(previous, ['tests/a.test.js', 'tests/new.test.js'], ['tests/a.test.js', 'tests/b.test.js', 'tests/new.test.js']),
    { 'tests/a.test.js': 3, 'tests/b.test.js': 1, 'tests/new.test.js': 1 },
  );
});

test('nextFlakyHits tolerates a missing or malformed flakyHits map and a null previous stamp (bootstrap)', () => {
  assert.deepStrictEqual(nextFlakyHits(null, ['tests/a.test.js'], ['tests/a.test.js']), { 'tests/a.test.js': 1 });
  assert.deepStrictEqual(nextFlakyHits({ tests: 1, flakyHits: 'nope' }, [], ['tests/a.test.js']), {});
  assert.deepStrictEqual(nextFlakyHits({ tests: 1, flakyHits: { 'tests/a.test.js': 'x' } }, [], ['tests/a.test.js']), {});
});

test('flakyEscalations lists allowlisted files at or above the threshold, sorted by file, and the caveat names the count (#1925 AC5 shape)', () => {
  assert.strictEqual(FLAKY_ESCALATION_HITS, 5);
  assert.deepStrictEqual(flakyEscalations({ 'tests/z.test.js': 6, 'tests/a.test.js': 5, 'tests/b.test.js': 4 }), [
    { file: 'tests/a.test.js', hits: 5 }, { file: 'tests/z.test.js', hits: 6 },
  ]);
  assert.strictEqual(
    escalationCaveatLine({ file: 'tests/a.test.js', hits: 5 }),
    'CAVEAT: flaky-allowlist: tests/a.test.js retried 5 times — file a fix or remove it from the allowlist',
  );
});
```

and append to `tests/bin-lib/verify/cli.test.js`:

```js
test('flaky retry: a pre-seeded flakyHits of 4 escalates on the fifth retry — both caveats render, report.flakyEscalation has one entry, the count stamp records 5 (#1925 AC5)', async () => {
  const r = flakyRepo();
  const countStampPath = path.join(r.gitDir, 'claude-tweaks-test-count.json');
  fs.writeFileSync(countStampPath, JSON.stringify({ tests: 1, sha: 'seed', recordedAt: 't', flakyHits: { 'tests/flaky.test.js': 4 } }));
  const { code, stdout, stderr } = await runCli(r.args, { cwd: r.repo });
  assert.strictEqual(code, 0, stderr);
  assert.match(stdout, /^CAVEAT: flaky-retried: tests\/flaky\.test\.js — passed on isolated rerun/m);
  assert.match(stdout, /^CAVEAT: flaky-allowlist: tests\/flaky\.test\.js retried 5 times — file a fix or remove it from the allowlist$/m);
  const report = JSON.parse(fs.readFileSync(path.join(r.gitDir, 'claude-tweaks-verify', 'report.json'), 'utf8'));
  assert.deepStrictEqual(report.flakyEscalation, [{ file: 'tests/flaky.test.js', hits: 5 }]);
  const stamp = JSON.parse(fs.readFileSync(countStampPath, 'utf8'));
  assert.deepStrictEqual(stamp.flakyHits, { 'tests/flaky.test.js': 5 });
  assert.strictEqual(stamp.tests, 1);
});

test('flaky retry: hits accumulate across two runs and a file removed from the allowlist is pruned from the map (#1925)', async () => {
  const r = flakyRepo({ flaky: { files: ['tests/flaky.test.js', 'tests/other.test.js'] } });
  const countStampPath = path.join(r.gitDir, 'claude-tweaks-test-count.json');
  fs.writeFileSync(countStampPath, JSON.stringify({ tests: 1, sha: 'seed', recordedAt: 't', flakyHits: { 'tests/other.test.js': 2, 'tests/removed.test.js': 9 } }));
  const first = await runCli(r.args, { cwd: r.repo });
  assert.strictEqual(first.code, 0, first.stderr);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(countStampPath, 'utf8')).flakyHits, { 'tests/flaky.test.js': 1, 'tests/other.test.js': 2 });
  assert.doesNotMatch(first.stdout, /flaky-allowlist/);
  // Second run at the same HEAD: the prior stamp is full at this sha, so the
  // scope run is mode none and nothing spawns — the map must be untouched.
  const second = await runCli(r.args, { cwd: r.repo });
  assert.strictEqual(second.code, 0, second.stderr);
  assert.match(second.stdout, /^Scope: none/m);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(countStampPath, 'utf8')).flakyHits, { 'tests/flaky.test.js': 1, 'tests/other.test.js': 2 });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node -e 'const m=require("./plugin/bin/lib/verify/count-stamp.js"); process.exit(typeof m.nextFlakyHits==="function"?0:1)'`
Expected: FAIL (exit 1). Then `node --test tests/bin-lib/verify/count-stamp.test.js tests/bin-lib/verify/cli.test.js` — the new tests fail.

- [ ] **Step 3: Implement in `count-stamp.js`** — after `caveatLine`:

```js
// Flaky-allowlist hit counter (#1925). Persisted in this stamp (the one
// per-checkout file the runner already rewrites) as `flakyHits: {file: n}`;
// a key is dropped the moment its file leaves the allowlist, so the map can
// never outlive the declaration. The threshold is a stated literal, not a
// policy lever: an allowlisted file retried this often needs a fix or its
// entry removed, and the caveat keeps saying so on every run until one of
// those happens — an allowlist with no pressure to shrink becomes permanent.
const FLAKY_ESCALATION_HITS = 5;

function nextFlakyHits(previous, retriedFiles, allowlist) {
  const prior = previous && previous.flakyHits && typeof previous.flakyHits === 'object' && !Array.isArray(previous.flakyHits)
    ? previous.flakyHits : {};
  const next = {};
  for (const file of allowlist) {
    const n = prior[file];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) next[file] = n;
  }
  for (const file of retriedFiles) next[file] = (next[file] || 0) + 1;
  return next;
}

function flakyEscalations(hits) {
  return Object.entries(hits)
    .filter(([, n]) => n >= FLAKY_ESCALATION_HITS)
    .map(([file, n]) => ({ file, hits: n }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

function escalationCaveatLine({ file, hits }) {
  return `CAVEAT: flaky-allowlist: ${file} retried ${hits} times — file a fix or remove it from the allowlist`;
}

module.exports = {
  readStamp, detectRegression, caveatLine,
  nextFlakyHits, flakyEscalations, escalationCaveatLine, FLAKY_ESCALATION_HITS,
};
```

(replace the existing `module.exports` line.) Update the header comment with one sentence: "Also home to the flaky-allowlist hit counter (#1925): `flakyHits` rides in the same stamp."

- [ ] **Step 4: `verify.js` count-stamp block** — replace the block from `let testCountRegression = null;` through the closing of `if (countStampPath && (!sel || sel.mode === 'full')) { ... }` with:

```js
  let testCountRegression = null;
  let flakyEscalation = [];
  // H3 (review): a narrowed run's "tests" count is not comparable to a full
  // run's baseline — comparing it would fire a false CAVEAT, and persisting
  // it would silently corrupt the baseline the next full run reads against.
  // The flaky hit map (#1925) is the exception: it moves on any run that
  // retried, but only ever alongside a still-valid baseline — a non-full run
  // with no prior stamp has no `tests` to write and persists nothing.
  if (countStampPath) {
    const fullMode = !sel || sel.mode === 'full';
    const previousCount = readCountStamp(countStampPath);
    if (fullMode) testCountRegression = detectRegression(previousCount, currentCount);
    const allowlist = decl ? decl.flaky.files : [];
    const hits = nextFlakyHits(previousCount, retriedFiles, allowlist);
    flakyEscalation = flakyEscalations(hits);
    let toWrite = null;
    if (fullMode && currentCount !== null) toWrite = { ...currentCount, flakyHits: hits };
    else if (retriedFiles.length > 0 && previousCount !== null) toWrite = { ...previousCount, flakyHits: hits };
    if (toWrite !== null) {
      // Fail-toward-absence on the write side too (readStamp already does
      // this on read): a stamp-write failure (ENOSPC, EACCES, a
      // --count-stamp path whose parent directory doesn't exist) must never
      // crash the whole run and discard an otherwise-passing report — this
      // is a caveat/surfacing mechanism, not a hard gate (count-stamp.js's
      // own stated intent). report.json's own write below is deliberately
      // unguarded: it IS the run's output, so a failure there must surface.
      try {
        fs.mkdirSync(path.dirname(countStampPath), { recursive: true });
        writeJsonAtomic(countStampPath, toWrite);
      } catch { /* best-effort persistence; next run simply has no baseline */ }
    }
  }
```

Import `nextFlakyHits, flakyEscalations, escalationCaveatLine` from `./lib/verify/count-stamp` on the existing require line. In `composeReport({...})` replace `flakyEscalation: []` with `flakyEscalation`. In the stdout section, after the `flakyCaveatLines` loop:

```js
  for (const e of flakyEscalation) lines.push('', escalationCaveatLine(e));
```

- [ ] **Step 5: Run to verify they pass**

Run: `node --test tests/bin-lib/verify/count-stamp.test.js tests/bin-lib/verify/cli.test.js`
Expected: PASS (including the existing #881 count-stamp CLI tests — the rewritten block must keep their behavior: a full run still writes `{tests, sha, recordedAt}` plus `flakyHits: {}`; `readStamp` ignores the extra key).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/verify/count-stamp.js plugin/bin/verify.js tests/bin-lib/verify/count-stamp.test.js tests/bin-lib/verify/cli.test.js
git commit -m "Count stamp tracks flakyHits per retried file; escalation caveat and report.flakyEscalation at 5 hits (refs #1925)"
```

---

### Task 5: `verification.md` Flake handling, docs rows, prose pin

**Files:**
- Modify: `plugin/skills/test/verification.md` (the `### Flake adjudication (tests check only)` section; the Step 3 caveat sentence; the "Reading the result" field list)
- Modify: `docs/plugin-structure.md` (the `plugin/bin/lib/verify/` row)
- Test: `tests/verification-flake-handling.test.js` (new)

**Interfaces:** none (prose).

- [ ] **Step 1: Write the failing test** — create `tests/verification-flake-handling.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('verification.md: the runner owns flake retries — the section is "Flake handling" and the agent is no longer told to re-run every failed file first (#1925)', () => {
  const text = read('plugin/skills/test/verification.md');
  assert.ok(text.includes('### Flake handling (tests check only)'));
  assert.ok(!text.includes('### Flake adjudication'));
  assert.ok(!text.includes('Before reporting a `tests` check failure, re-run each failed file in isolation once'));
  assert.ok(text.includes('CAVEAT: flaky-retried:'));
  assert.ok(text.includes('CAVEAT: flaky-allowlist:'));
  assert.ok(text.includes('`flaky.files`'));
  assert.ok(text.includes('kind `flaky-allowlist`'), 'the agent stages an allowlist proposal, never edits the allowlist itself');
  assert.ok(text.includes('AUTO {time} — Flaky retry: {files} passed on isolated rerun (declared in verify-scope.json). Reversibility: high.'));
  assert.ok(text.includes('node --test path/to/file.test.js'), 'the isolated rerun still applies to an UNLISTED failing file');
});

test('docs/plugin-structure.md names flaky.js and the count stamp\'s flakyHits (#1925)', () => {
  const text = read('docs/plugin-structure.md');
  assert.ok(text.includes('flaky.js (#1925'));
  assert.ok(text.includes('flakyHits'));
  assert.ok(text.includes('extractFailingFiles'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/verification-flake-handling.test.js`
Expected: FAIL (the section is still "Flake adjudication"; the docs row lacks `flaky.js`).

- [ ] **Step 3: Rewrite the section in `verification.md`** — replace everything from the line `### Flake adjudication (tests check only)` up to (not including) `### Gate behavior` with:

````markdown
### Flake handling (tests check only)

The runner owns flake retries (#1925). A project lists known-flaky test files — exact repo-relative paths — in `.claude-tweaks/verify-scope.json`'s `flaky.files`, with a per-suite `retry` command template (`{file}` substituted; `flaky.maxRetries` default 1, ceiling 2). On a `tests`-family failure under `--scope`, the runner extracts the failing test files from the log (ANSI stripped) and, only when **every** failing file is allowlisted, re-runs those files serially in log order — each up to `maxRetries` attempts, stopping at a file's first pass, failing the run on the first file that exhausts its attempts (`report.json.checks.{suite}.retryFailed`). A retried pass reads `pass (flaky-retried: {files})` in the table; `report.json` carries `checks.{suite}.flakyRetried` and `retryAttempts` (one `{suite}-retry-{file-slug}-{i}.log` per attempt), the pass stamp carries `flakyRetried`, and a `CAVEAT: flaky-retried: {files} — passed on isolated rerun; see {log}` line renders under the table — present it verbatim in Step 3, never folded into the row, and log `AUTO {time} — Flaky retry: {files} passed on isolated rerun (declared in verify-scope.json). Reversibility: high.` per `_shared/auto-decision-log.md`. The count stamp keeps a per-file `flakyHits` counter; from 5 hits the runner also prints `CAVEAT: flaky-allowlist: {file} retried {n} times — file a fix or remove it from the allowlist` and sets `report.json.flakyEscalation` — `/claude-tweaks:wrap-up`'s leftover routing (`wrap-up/leftover-routing.md`) turns that into a backlog record. An unlisted failing file, a log with no parseable test file, a suite with no `retry` template, or `maxRetries: 0` means an ordinary failure with no retry — `checks.{suite}.retryDecision.reason` says which. `types`/`lint` are deterministic and never retried; a run without `--scope` never retries.

For a failure in an **unlisted** file, "Isolating pre-existing failures by file" above still applies, agent-performed, once: re-run that one file in isolation (`node --test path/to/file.test.js`) and report the outcome separately — isolated pass → **flake** (machine load), isolated fail → **regression**. When it passes, do not add the file to `flaky.files` yourself. Stage a proposal instead — `node "${CLAUDE_PLUGIN_ROOT}/bin/stage-item.js" --run "$PIPELINE_RUN_DIR" --id flaky-allowlist-{slug} --file {proposal-path}` (kind `flaky-allowlist`; `{slug}` is the file path with `/` → `-`); the proposal names the file for `flaky.files` and, when the failing suite has no `retry` template yet, the template to add alongside it — it is incomplete without both — and report the run as **failed pending that decision**, logging `STAGED {time} — Flaky allowlist proposal: {file} passed one isolated rerun. Stage path: staged/flaky-allowlist-{slug}.md. Reversibility: high.` Check the ledger first: "Pre-existing failures" above covers the distinct case of a failure already tracked before this spec's own changes, and only failures it does not cover get diagnosed here.

````

Then, in "### Reading the result", extend the per-check field list `{command, exitCode, durationMs, logPath, summary, failingRegion}` with ` — plus, after a flaky retry (#1925), `flakyRetried`/`retryFailed`/`retryAttempts`/`retryDecision`` and the top-level list with `, and \`flakyEscalation\` when an allowlisted file has hit the escalation threshold`. In Step 3's report paragraph, change "When `report.json` carries `testCountRegression`, render its `CAVEAT:` line" to "When the runner printed any `CAVEAT:` line (`testCountRegression`, `flaky-retried`, `flaky-allowlist`), render each".

- [ ] **Step 4: `docs/plugin-structure.md`** — in the `plugin/bin/lib/verify/` row, after the `extract.js (...)` clause change it to read `extract.js (content-sniffed TAP/summary/generic failing-region extraction + strict suite counts; extractFailingFiles — the ANSI-stripped failing test files the flaky retry keys on)`, after the `count-stamp.js (#881 ...)` clause append ` and, since #1925, the flaky-allowlist hit counter (flakyHits per retried file, pruned to the allowlist, escalation caveat at 5)`, and add before `atomic-write.js` the clause `flaky.js (#1925 — planRetry: every failing file allowlisted or no retry; runRetries: serial per-file re-runs through run.js's runOne, bounded by flaky.maxRetries, short-circuit on the first exhausted file; flakyCaveatLines), `.

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/verification-flake-handling.test.js tests/bin-lib/verify/snippet-conformance.test.js`
Expected: PASS (the canonical invocation block is untouched, so snippet-conformance still finds exactly one).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/test/verification.md docs/plugin-structure.md tests/verification-flake-handling.test.js
git commit -m "verification.md: Flake handling is runner-first — allowlisted retries, CAVEAT lines, staged allowlist proposals (refs #1925)"
```

---

### Task 6: `flakyEscalation` leftover row

**Files:**
- Modify: `plugin/skills/wrap-up/leftover-routing.md` (new section after "## Fix-exhaust first")
- Modify: `plugin/skills/wrap-up/SKILL.md` (one sentence in "### Leftover work"; ≤ 40,960 bytes after)
- Test: `tests/wrap-up-flaky-escalation-row.test.js` (new)

**Interfaces:** none (prose).

- [ ] **Step 1: Write the failing test** — create `tests/wrap-up-flaky-escalation-row.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('leftover-routing.md carries the runner-reported flakyEscalation row and wrap-up SKILL.md cites it within the byte ceiling (#1925)', () => {
  const routing = read('plugin/skills/wrap-up/leftover-routing.md');
  assert.ok(routing.includes('## Runner-reported leftovers (`flakyEscalation`)'));
  assert.ok(routing.includes('Flaky allowlist: {file} retried {n} times'));
  assert.ok(routing.includes('`Defer-reason: pre-existing-outside-diff`'));
  assert.ok(routing.includes('report.json'));
  const skill = read('plugin/skills/wrap-up/SKILL.md');
  assert.ok(skill.includes('`flakyEscalation`'));
  assert.ok(Buffer.byteLength(skill, 'utf8') <= 40960, `wrap-up/SKILL.md is ${Buffer.byteLength(skill, 'utf8')} bytes`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/wrap-up-flaky-escalation-row.test.js`
Expected: FAIL (no such section yet).

- [ ] **Step 3: Add the section to `leftover-routing.md`** — insert after the "## Fix-exhaust first" section (before "## Staging (every mode — policy lookup)"):

````markdown
## Runner-reported leftovers (`flakyEscalation`)

A second leftover source, alongside unfinished spec sections: the verification runner's own escalation (#1925). Read the run's latest `report.json` — `{git-dir}/claude-tweaks-verify/report.json` for this checkout (`git rev-parse --git-dir`), or the `reportPath` the pass stamp names. Each `flakyEscalation` entry (`{file, hits}`) is an allowlisted flaky test file the runner has retried `hits` times (5 or more) — the allowlist is being used to launder a failure that nobody has fixed. It is never fixed here (a flake's cause is outside this work's diff), so it skips the fix-exhaust gate and routes as a leftover with `Defer-reason: pre-existing-outside-diff`, through the materiality floor like any other section: title `Flaky allowlist: {file} retried {n} times`, `type: bug`, Current State = the file, its hit count, the suite and retry template that re-ran it, and the `CAVEAT: flaky-allowlist:` line verbatim; Deliverables = fix the flake (or justify removing the entry) and remove the file from `flaky.files`; Acceptance Criteria = the file passes `{retry template}` five times consecutively with the allowlist entry removed, and the next full run prints no `flaky-allowlist` caveat for it. Before composing, check for an already-open record whose title starts with `Flaky allowlist: {file}` (`gh issue list --search "Flaky allowlist in:title" --state open --json number,title` under `work-backend: github-issues`, then keep only titles beginning with that exact prefix — the search is word-based and also matches the record that built this feature; the local store's titles otherwise) — the caveat renders on every run until the entry is fixed or removed, so a second run must fold into the existing record (log `SKIP {time} — flakyEscalation: {file} already tracked by #{n}.`), never file a duplicate. Stage per the steps below; the slug is `flaky-{file path with / → -}`.

````

- [ ] **Step 4: Cite it from `wrap-up/SKILL.md`** — in the "### Leftover work (formerly Step 4, record-based only)" paragraph, change the sentence `If every spec section is complete, report "No leftover work to route" and skip this step entirely — do not read the file.` to `If every spec section is complete and the run's latest \`report.json\` carries no \`flakyEscalation\` (that file's runner-reported row), report "No leftover work to route" and skip this step entirely — do not read the file.` Then measure: `wc -c plugin/skills/wrap-up/SKILL.md` must print ≤ 40960. If it does not, trim the same number of bytes from that paragraph's own wording (e.g. drop "(formerly Step 4, record-based only)" from the heading is NOT allowed — other tests pin headings; instead shorten "Identify unfinished spec sections that cannot be completed in the current work context." to "Identify spec sections that cannot finish in this work context.").

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/wrap-up-flaky-escalation-row.test.js tests/deferral-gate-conformance.test.js tests/wrap-up-registry-pin.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/wrap-up/leftover-routing.md plugin/skills/wrap-up/SKILL.md tests/wrap-up-flaky-escalation-row.test.js
git commit -m "wrap-up leftover routing: a runner flakyEscalation entry files a Flaky allowlist record (refs #1925)"
```

---

## Self-review notes

- Spec coverage: Deliverable 1 → Task 1; 2 → Task 2; 3 → Task 3 (+ run.js hook in Task 2); 4 → Task 4; 5 → Task 5; 6 → Task 6; 7 (tests) → each task's Step 1 (extract, flaky, cli AC3/AC4/AC5/AC6/AC7, count-stamp, prose pins). AC8 (`npm test` no new failures relative to `main`) is the build's Common Step 5.
- Types: `planRetry` returns `{retry, files, command}` (Task 2) and Task 3's hook reads `plan.files`/`plan.command`/`plan.reason` — consistent. `runRetries` takes `{check, plan, maxRetries, logDir, runOne, spawnImpl, now}` in both places. `nextFlakyHits(previous, retriedFiles, allowlist)` — same order in Task 4's test and verify.js.
- Placeholders: none — every step carries its code or its exact prose.
