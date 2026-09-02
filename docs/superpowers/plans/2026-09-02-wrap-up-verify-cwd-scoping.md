# Wrap-up Verify: cwd-scoped plans-ledger/design-caches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `wrap-up`'s verify verb's `plans-ledger`/`design-caches` checks scan the invoking checkout's own working tree (`cwd`), not always the main checkout (`repoRoot`), so a worktree-local leftover plan/SDD-ledger file is actually caught under this project's default `worktree`/`pr-first` mode.

**Architecture:** `runVerify` (`plugin/bin/lib/wrap-up/engine-verify.js`) gains a new `cwd` parameter, threaded alongside the existing `repoRoot` (which stays main-checkout-only, for `run-dir-archived`'s pipeline-directory lookups). Only the two checks that scan the filesystem for leftover scratch files — `plans-ledger` and `design-caches` — switch from reading `repoRoot` to reading `cwd`. The CLI entry point (`plugin/bin/wrap-up-engine.js`'s `runVerifyVerb`) defaults `cwd` to `process.cwd()` in production, which is exactly the invoking worktree when the CLI is run from inside one.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-02T072841-record-1222/work/1222-spec.md`

## Global Constraints

- `repoRoot`'s existing resolution and every other check's use of it (`run-dir-archived` in particular) must stay unchanged — only `plans-ledger`/`design-caches` switch to `cwd`.
- `npm test` must stay fully green, and no `plans-ledger`/`design-caches` assertion in `tests/bin-lib/wrap-up/engine-verify.test.js` may depend on this worktree's own live/churning filesystem state.
- Injectable-runner convention (`deps.git`/`deps.gh`) is unchanged — `cwd` is a plain string path, not a new seam.

---

### Task 1: Thread `cwd` through `runVerify`; switch `plans-ledger`/`design-caches` to read it

**Files:**
- Modify: `plugin/bin/lib/wrap-up/engine-verify.js`
- Test: `tests/bin-lib/wrap-up/engine-verify.test.js`

**Interfaces:**
- Produces: `runVerify({ runDir, originalRunDir, base, repoRoot, cwd, deps })` — `cwd` is a new, optional parameter (defaults to `process.cwd()` when omitted, matching `repoRoot`'s existing default pattern). Every registered check function now receives `cwd` in its argument object alongside `repoRoot`.

- [ ] **Step 1: Write the failing tests proving `plans-ledger`/`design-caches` must read `cwd`, not `repoRoot`**

Add these two tests to `tests/bin-lib/wrap-up/engine-verify.test.js`, immediately after the existing `'plans-ledger check does not count .superpowers/sdd/.gitignore itself as a leftover'` test (before the `function writeSpecFile(...)` helper):

```javascript
test('plans-ledger check scans `cwd`, not `repoRoot`, for untracked plan-file leftovers', () => {
  const cwd = makeTmpDir('verify-plans-ledger-cwd-clean-');
  const repoRoot = makeTmpDir('verify-plans-ledger-cwd-reporoot-dirty-');
  const calls = [];
  const fakeGit = (args, dir) => {
    calls.push({ args, dir });
    if (args[0] === 'status' && dir === repoRoot) return '?? docs/superpowers/plans/leftover-at-reporoot.md\n';
    return '';
  };
  try {
    const result = runVerify({ runDir: '/tmp/verify-cwd-scoping-does-not-matter', base: 'main', repoRoot, cwd, deps: { git: fakeGit, gh: () => '' } });
    const row = result.rows.find((r) => r.check === 'plans-ledger');
    assert.strictEqual(row.result, 'pass', row.detail);
    const statusCall = calls.find((c) => c.args[0] === 'status');
    assert.strictEqual(statusCall.dir, cwd, 'plans-ledger must scan cwd, not repoRoot');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('design-caches check scans `cwd`, not `repoRoot`, for untracked cache-file leftovers', () => {
  const cwd = makeTmpDir('verify-design-caches-cwd-dirty-');
  const repoRoot = makeTmpDir('verify-design-caches-cwd-reporoot-clean-');
  fs.mkdirSync(path.join(cwd, 'docs', 'plans'), { recursive: true });
  const calls = [];
  const fakeGit = (args, dir) => {
    calls.push({ args, dir });
    if (args[0] === 'status' && dir === cwd) return '?? docs/plans/some-topic-audit.json\n';
    return '';
  };
  try {
    const result = runVerify({ runDir: '/tmp/verify-cwd-scoping-does-not-matter', base: 'main', repoRoot, cwd, deps: { git: fakeGit, gh: () => '' } });
    const row = result.rows.find((r) => r.check === 'design-caches');
    assert.strictEqual(row.result, 'fail', row.detail);
    assert.match(row.detail, /some-topic-audit\.json/);
    const statusCall = calls.find((c) => c.args[0] === 'status');
    assert.strictEqual(statusCall.dir, cwd, 'design-caches must scan cwd, not repoRoot');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: FAIL — both new tests fail. `plans-ledger` still scans `repoRoot` (reports `fail`, not `pass`, since the fixture's "dirty" content is at `repoRoot` today); `design-caches` reports `pass` instead of `fail` (it never sees the leftover, which lives at `cwd`, not `repoRoot`).

- [ ] **Step 3: Add the `cwd` parameter to `runVerify` and thread it into every check's argument object**

In `plugin/bin/lib/wrap-up/engine-verify.js`, change the `runVerify` function signature and body (currently at line 590):

```javascript
function runVerify({ runDir, originalRunDir, base, repoRoot, cwd, deps = {} }) {
  const git = deps.git || defaultGit;
  const gh = deps.gh || defaultGh;
  const resolvedRepoRoot = repoRoot || process.cwd();
  const resolvedCwd = cwd || process.cwd();
  const resolvedOriginalRunDir = originalRunDir || runDir;
  const expectations = runDir === null ? null : readExpectations(runDir);
```

and update the two `rows` construction sites' argument objects — the `runDir === null` branch is unaffected (no check functions are invoked there), but the `CHECKS.map` branch's call to each check function must also pass `cwd`:

```javascript
        try {
          const { result, detail } = fn({
            runDir, originalRunDir: resolvedOriginalRunDir, base, repoRoot: resolvedRepoRoot,
            cwd: resolvedCwd, expectations, deps: { git, gh },
          });
          return { check: name, result, detail: detail || '' };
        } catch (err) {
          return { check: name, result: 'fail', detail: `check threw: ${err.message}` };
        }
```

- [ ] **Step 4: Switch `plans-ledger` to read `cwd` instead of `repoRoot`**

Replace the `plans-ledger` check registration (currently lines 132-189, including its explanatory comment) with:

```javascript
// ---- plans + ledger removal ------------------------------------------------
//
// docs/superpowers/plans/ and docs/plans/ hold ephemeral scratch (execution
// plans; design-wrapper cache JSON) that should be untracked by the time
// wrap-up finishes -- slug-matching a plan's TOPIC filename against the
// run's SPEC identity essentially never matches (they come from unrelated
// naming schemes), so this scans for untracked entries via `git status`
// instead. `cwd` -- the invoking checkout's own working tree, not `repoRoot`
// (always the main checkout) -- since under this project's default
// `worktree`/`pr-first` mode, an execution-plan or design-cache file created
// by a run lives in that run's WORKTREE's own working tree, not the main
// checkout's: a worktree's untracked files never appear in any other
// checkout's `git status`, even though they share one object store.
// `repoRoot`-scoped scanning was blind to a run's own leftovers under the
// default mode and could only ever catch leftovers left directly in the main
// checkout (record #900 whole-branch re-review, finding #3; fixed here,
// record #1222). `run-dir-archived` still needs `repoRoot` for its
// `.claude-tweaks/pipelines/` lookups (that path genuinely only exists in the
// main checkout, gitignored, never in a worktree) -- this check alone reads
// `cwd`.
// `--porcelain=v1 -uall` (not the default `-uno`) so a wholly-untracked
// directory reports every file inside it individually instead of collapsing
// to one `?? {dir}/` line the suffix/name filters below could never match.
registerCheck('plans-ledger', ({ cwd, deps }) => {
  let status;
  try {
    status = deps.git(['status', '--porcelain=v1', '-uall', '--', 'docs/superpowers/plans', 'docs/plans'], cwd);
  } catch (err) {
    return { result: 'unknown', detail: `git status failed: ${err.message}` };
  }
  const leftovers = status.split('\n').filter((l) => l.startsWith('??')).map((l) => l.slice(3).trim());
  // .superpowers/sdd/ is gitignored entirely so it never shows up in `git
  // status` even with the paths above -- check it directly. Any entry
  // present there is a leftover SDD ledger workspace that should have been
  // deleted at wrap-up. Dotfiles (the directory's own `.gitignore`
  // scaffolding, always present) are not leftovers -- only real content
  // counts.
  const sddDir = path.join(cwd, '.superpowers', 'sdd');
  let sddEntries = [];
  try {
    if (fs.existsSync(sddDir)) {
      sddEntries = fs.readdirSync(sddDir)
        .filter((e) => !e.startsWith('.'))
        .map((e) => path.join('.superpowers/sdd', e));
    }
  } catch { /* unreadable dir -- treat as no entries rather than throwing */ }
  const all = [...leftovers, ...sddEntries];
  if (all.length) return { result: 'fail', detail: `${all.length} leftover artifact(s) remain: ${all.join(', ')}` };
  return { result: 'pass', detail: '' };
});
```

- [ ] **Step 5: Switch `design-caches` to read `cwd` instead of `repoRoot`**

Replace the `design-caches` check registration (currently lines 191-211, including its explanatory comment) with:

```javascript
// ---- design caches deleted --------------------------------------------------
//
// `cwd`, matching plans-ledger's reasoning above -- this check scans the
// invoking checkout's own working tree, not always the main checkout.
registerCheck('design-caches', ({ cwd, expectations, deps }) => {
  const deferred = deferredSet(expectations);
  if (deferred.has('design-caches')) return { result: 'skip', detail: 'deferred to parent console' };
  const cacheDir = path.join(cwd, 'docs', 'plans');
  if (!fs.existsSync(cacheDir)) return { result: 'pass', detail: '' };
  let status;
  try {
    status = deps.git(['status', '--porcelain=v1', '-uall', '--', 'docs/plans'], cwd);
  } catch (err) {
    return { result: 'unknown', detail: `git status failed: ${err.message}` };
  }
  const suffixes = ['-audit.json', '-recommendations.json', '-declined.json'];
  const untracked = status.split('\n').filter((l) => l.startsWith('??')).map((l) => l.slice(3).trim());
  const matches = untracked.filter((f) => suffixes.some((suf) => f.endsWith(suf)));
  if (matches.length) return { result: 'fail', detail: `${matches.length} cache file(s) remain: ${matches.join(', ')}` };
  return { result: 'pass', detail: '' };
});
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: PASS for the two new tests from Step 1. Other tests in this file are expected to newly FAIL at this point (existing `plans-ledger`/`design-caches`-focused tests and the AC1/AC2 fixtures still isolate only `repoRoot`, not `cwd`) — Task 3 fixes those. Confirm specifically that the two new tests pass and note which existing tests now fail, to compare against Task 3's fix.

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/wrap-up/engine-verify.js tests/bin-lib/wrap-up/engine-verify.test.js
git commit -m "wrap-up verify: thread cwd through runVerify, switch plans-ledger/design-caches to read it

refs #1222"
```

---

### Task 2: Wire `cwd` through the CLI entry point; add a real-worktree integration test for AC1

**Files:**
- Modify: `plugin/bin/wrap-up-engine.js`
- Test: `tests/bin-lib/wrap-up/engine-verify.test.js`

**Interfaces:**
- Consumes: `runVerify({ ..., cwd })` from Task 1.
- Produces: `runVerifyVerb`'s call to `runVerify` now passes `cwd: process.cwd()` explicitly.

- [ ] **Step 1: Write the failing integration test proving a worktree-local leftover is caught from that worktree (AC1)**

First, update the top-level import at the head of `tests/bin-lib/wrap-up/engine-verify.test.js` (currently `const { gitRepo } = require('../../helpers/git-fixtures');`) to also pull in `linkedWorktreeOf`:

```javascript
const { gitRepo, linkedWorktreeOf } = require('../../helpers/git-fixtures');
```

Then add this test, immediately after the two new tests from Task 1:

```javascript
test('AC1 (live git): a plans-ledger leftover created in a worktree is caught by a verify run invoked from that same worktree, and is invisible from the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  try {
    fs.mkdirSync(path.join(wt, 'docs', 'superpowers', 'plans'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'docs', 'superpowers', 'plans', '2026-09-02-leftover-plan.md'), '# leftover\n');
    const realGit = (args, cwd) => realExecFileSync('git', args, { cwd, encoding: 'utf8' });
    const runDir = makeTmpDir('verify-ac1-livewt-');

    // Sanity check first: the main checkout's own git status must not see
    // the worktree-local leftover at all -- proving the pre-fix repoRoot-only
    // scan really was structurally blind to it, not just untested.
    const mainStatus = realExecFileSync(
      'git', ['status', '--porcelain=v1', '-uall', '--', 'docs/superpowers/plans', 'docs/plans'],
      { cwd: main, encoding: 'utf8' },
    );
    assert.strictEqual(mainStatus.trim(), '', 'sanity: the main checkout must not see the worktree-local leftover');

    const result = runVerify({ runDir, base: 'main', repoRoot: main, cwd: wt, deps: { git: realGit, gh: () => '' } });
    const row = result.rows.find((r) => r.check === 'plans-ledger');
    assert.strictEqual(row.result, 'fail', row.detail);
    assert.match(row.detail, /2026-09-02-leftover-plan\.md/);
  } finally {
    fs.rmSync(wt, { recursive: true, force: true });
    fs.rmSync(main, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: FAIL at the `assert.strictEqual(mainStatus.trim(), '', ...)` line is expected to PASS (that's real `git status` behavior, unrelated to this fix), but the `assert.strictEqual(row.result, 'fail', ...)` assertion FAILS — Task 1 already switched `plans-ledger` to read `cwd`, so this specific test should actually already pass once Task 1 lands. Run it to confirm; if it already passes, note that and proceed directly to Step 3 (the CLI wiring below is still required for production correctness even though this particular test doesn't exercise the CLI).

- [ ] **Step 3: Wire `cwd` through `runVerifyVerb`**

In `plugin/bin/wrap-up-engine.js`, replace `runVerifyVerb` (currently lines 355-364):

```javascript
function runVerifyVerb(args) {
  if (!args.runDir || !args.base) { usageExit(); return; }
  const repoRoot = resolveRepoRoot(process.cwd());
  const cwd = process.cwd();
  const resolvedDir = resolveArchivedRunDir(args.runDir, repoRoot);
  const { rows, exitCode } = runVerify({ runDir: resolvedDir, originalRunDir: args.runDir, base: args.base, repoRoot, cwd, deps: {} });
  process.stdout.write(`${renderVerifyTable(rows)}\n`);
  // Never process.exit() right after a large write -- can truncate stdout on
  // a pipe (see MEMORY.md's async-write-vs-process-exit-race incident).
  process.exitCode = exitCode;
}
```

- [ ] **Step 4: Run the full engine-verify test file to confirm the new tests pass**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: The two Task 1 tests and this task's AC1 integration test PASS. Other pre-existing tests may still fail (expected — Task 3 fixes those).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/wrap-up-engine.js tests/bin-lib/wrap-up/engine-verify.test.js
git commit -m "wrap-up verify: wire cwd through runVerifyVerb; add live-worktree AC1 integration test

refs #1222"
```

---

### Task 3: Rework the existing test suite's isolation convention (no more live-worktree dependency)

**Files:**
- Modify: `tests/bin-lib/wrap-up/engine-verify.test.js`

**Interfaces:**
- Consumes: `runVerify({ ..., cwd })` from Task 1 — every call site below adds `cwd: repoRoot` (or `cwd: repo`, matching whichever isolated-tmp-dir variable that test already declares) alongside its existing `repoRoot: repoRoot` argument, reusing the same isolated directory for both parameters since these tests have no need for `cwd` and `repoRoot` to diverge — only the two dedicated Task 1 tests exercise that divergence.

- [ ] **Step 1: Run the full suite to enumerate exactly which existing tests fail after Tasks 1-2**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: FAIL — the AC1/AC2 fixture tests and the pre-existing `plans-ledger`/`design-caches`-focused tests fail, because they isolate only `repoRoot` (now unused by these two checks) while `plans-ledger`/`design-caches` fall back to `cwd = process.cwd()` — this worktree's own live, churning `docs/superpowers/plans/`/`.superpowers/sdd/` state (which, as of this very run, includes this plan's own file and its SDD ledger workspace).

- [ ] **Step 2: Update the `makeCleanRepoRoot()` explanatory comment**

In `tests/bin-lib/wrap-up/engine-verify.test.js`, replace the comment immediately above `function makeCleanRepoRoot()` (currently lines 15-25):

```javascript
// plans-ledger's sdd-leftover check reads `cwd`'s own filesystem directly
// (not via deps.git), so any test whose assertions depend on an exact
// failing-row set or a specific exitCode -- but isn't itself exercising
// plans-ledger/design-caches -- must pass an isolated `cwd` (record #1222:
// plans-ledger/design-caches read `cwd`, distinct from `repoRoot`, which
// stays reserved for run-dir-archived's main-checkout lookups) rather than
// let it default to process.cwd(). This worktree's own working tree
// legitimately has real leftover docs/superpowers/plans and .superpowers/sdd
// entries at any given time (that's the exact vacuous-check bug the original
// #900 fix round closed for the main checkout, and #1222 closes for a
// worktree), so relying on the default would make those tests depend on live
// worktree state. Tests below that need only isolation (not a real
// cwd-vs-repoRoot divergence) pass this same tmp dir as both `repoRoot` and
// `cwd` -- the two params diverge only in the dedicated "scans `cwd`, not
// `repoRoot`" tests above, which prove the switch itself.
function makeCleanRepoRoot() {
  return makeTmpDir('verify-clean-reporoot-');
}
```

- [ ] **Step 3: Add `cwd: repoRoot` to the AC1 fixture's two `runVerify` calls**

In the `'AC1: fixture run-dir with one unexecuted approved action exits 3 naming that check; fixing it exits 0'` test, update both `runVerify` calls:

```javascript
    const dirtyResult = runVerify({ runDir: originalPath, base: 'main', repoRoot, cwd: repoRoot, deps: { git: fakeGitDirty, gh: () => 'gh version 2.0.0' } });
```

```javascript
    const cleanResult = runVerify({ runDir: originalPath, base: 'main', repoRoot, cwd: repoRoot, deps: { git: fakeGitClean, gh: () => 'gh version 2.0.0' } });
```

- [ ] **Step 4: Add `cwd: repoRoot` to the AC2 fixture's `runVerify` call**

In the `'AC2: gh absent renders acceptance-labeling unknown, exit code reflects only checks that ran'` test:

```javascript
    const result = runVerify({ runDir: originalPath, base: 'main', repoRoot, cwd: repoRoot, deps: { git: cleanGit, gh: throwingGh } });
```

- [ ] **Step 5: Add `cwd: repoRoot` to the six plans-ledger/design-caches direct-assertion tests**

Update each of these six `runVerify` calls (each already declares `const repoRoot = makeCleanRepoRoot();` in its own test):

`'plans-ledger check passes when git status reports no untracked entries and no sdd leftovers'`:
```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot, cwd: repoRoot, deps: { git: () => '', gh: () => '' } });
```

`'plans-ledger check fails when git status reports an untracked plan file, naming it'` — also update the assertion message on the following line:
```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot, cwd: repoRoot, deps: { git: fakeGit, gh: () => '' } });
    const row = result.rows.find((r) => r.check === 'plans-ledger');
    assert.strictEqual(row.result, 'fail');
    assert.match(row.detail, /2099-01-01-some-topic\.md/);
    const statusCall = calls.find((c) => c.args[0] === 'status');
    assert.deepStrictEqual(statusCall.args, ['status', '--porcelain=v1', '-uall', '--', 'docs/superpowers/plans', 'docs/plans']);
    assert.strictEqual(statusCall.cwd, repoRoot, 'git status must run against cwd (the isolated fixture), not process.cwd()');
```

`'plans-ledger check fails when a .superpowers/sdd/ leftover directory is present, naming it'`:
```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot, cwd: repoRoot, deps: { git: () => '', gh: () => '' } });
```

`'design-caches check passes when cache dir does not exist'`:
```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot, cwd: repoRoot, deps: { git: () => '', gh: () => '' } });
```

`'design-caches check fails when an untracked *-audit.json cache file remains'`:
```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot, cwd: repoRoot, deps: { git: fakeGit, gh: () => '' } });
```

`'design-caches check does not fail on a TRACKED file matching a cache suffix (only untracked counts)'`:
```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot, cwd: repoRoot, deps: { git: fakeGit, gh: () => '' } });
```

- [ ] **Step 6: Add `cwd: repo` to the real-git design-caches test**

In `'design-caches check catches an untracked *-audit.json inside a WHOLLY-untracked docs/plans/ directory (real git, no fake)'` (which declares `const repo = gitRepo();`):

```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot: repo, cwd: repo, deps: { git: realGit, gh: () => '' } });
```

- [ ] **Step 7: Add `cwd: repoRoot` to the sdd-gitignore-only test**

In `'plans-ledger check does not count .superpowers/sdd/.gitignore itself as a leftover'`:

```javascript
    const result = runVerify({ runDir, base: 'main', repoRoot, cwd: repoRoot, deps: { git: () => '', gh: () => '' } });
```

- [ ] **Step 8: Run the full engine-verify test file — verify every test passes**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: PASS — every test in the file, including all tests updated in this task and both tests added in Tasks 1-2.

- [ ] **Step 9: Run the full project test suite**

Run: `npm test`
Expected: PASS — full suite green, confirming this change did not regress `run-dir-archived` (which still reads `repoRoot`, untouched) or any other check.

- [ ] **Step 10: Commit**

```bash
git add tests/bin-lib/wrap-up/engine-verify.test.js
git commit -m "wrap-up verify tests: isolate cwd (not just repoRoot) so plans-ledger/design-caches assertions no longer depend on live worktree state

refs #1222"
```
