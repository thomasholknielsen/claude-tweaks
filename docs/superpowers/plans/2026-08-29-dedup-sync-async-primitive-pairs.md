# Dedup Sync/Async Primitive Pairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the hand-duplicated try/catch/classify wrapper shape shared by `runGit`/`runGitAsync` (`plugin/bin/lib/hooks/git-exec.js`) and `ghHealthCheck`/`ghHealthCheckAsync` (`plugin/bin/lib/reconcile/preflight.js`) into one shared primitive, so a future fix to either pair's contract structurally cannot land without applying to both twins.

**Architecture:** Add `runClassified(fn, mapError)` / `runClassifiedAsync(fn, mapError)` to `plugin/bin/lib/shared-primitives.js` — the established home for small cross-directory primitives (#977). Each existing pair keeps its own `buildSuccess`/`buildFailure` shaping functions, but each is now defined **once per pair** and reused by both the sync and async twin, instead of the return-shape logic being retyped in each twin's own catch block. `sharedFetch`/`sharedFetchAsync` (`plugin/bin/lib/reconcile/shared-fetch.js`) are explicitly **out of scope** — they are thin one-line delegations to `runGit`/`runGitAsync` with per-shape argument selection, not a hand-duplicated wrapper; the record's body named them as living in `preflight.js`, but they actually live in `shared-fetch.js` and are structurally different from the two pairs this plan addresses (materialize.md's Named-location drift note — verify before scoping).

**Tech Stack:** Node.js (`node --test`), `child_process.execFileSync`/`execFile`, no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T172758-record-1652/work/1652-spec.md`

## Global Constraints

- No behavioral change to any existing caller (spec Acceptance Criteria).
- Existing test suites for `git-exec.js`, `preflight.js`, and `reconcile/index.js`'s FAST_CHECKS all still pass unmodified (spec Acceptance Criteria).
- `cp.execFileSync(...)` must remain resolved via property access on `cp` **at call time** inside `runGit` (not hoisted to a destructured module-scope binding) — `tests/hooks-git-exec.test.js`'s `windowsHide` test stubs `cp.execFileSync` and re-requires the module to observe it.
- `promisify(cp.execFile)` must remain called **inside** `runGitAsync`'s function body at call time, never hoisted to module scope — `tests/hooks-git-exec.test.js`'s async timeout test stubs `cp.execFile` directly and relies on this (git-exec.js's own header comment states the same constraint, and `gh-api-module-pattern` names this exact hazard, #872).

---

### Task 1: Add `runClassified`/`runClassifiedAsync` to shared-primitives.js

**Files:**
- Modify: `plugin/bin/lib/shared-primitives.js`
- Test: `tests/bin-lib/shared-primitives.test.js` (create)

**Interfaces:**
- Produces: `runClassified(fn, mapError)` — calls `fn()`, returns its value on success, returns `mapError(err)` on a thrown error. `runClassifiedAsync(fn, mapError)` — same shape, `fn` and the wrapper are both async; `mapError` stays synchronous (neither existing pair's error mapper needs to await anything).

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/shared-primitives.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runClassified, runClassifiedAsync } = require('../../plugin/bin/lib/shared-primitives');

test('runClassified: returns fn()\'s value on success', () => {
  const result = runClassified(() => 'ok', () => 'unused');
  assert.strictEqual(result, 'ok');
});

test('runClassified: returns mapError(err) when fn() throws', () => {
  const err = new Error('boom');
  const result = runClassified(
    () => { throw err; },
    (caught) => ({ caught }),
  );
  assert.deepStrictEqual(result, { caught: err });
});

test('runClassified: mapError never runs on the success path', () => {
  let mapErrorCalls = 0;
  runClassified(() => 'ok', () => { mapErrorCalls += 1; return 'unused'; });
  assert.strictEqual(mapErrorCalls, 0);
});

test('runClassifiedAsync: returns fn()\'s resolved value on success', async () => {
  const result = await runClassifiedAsync(async () => 'ok', () => 'unused');
  assert.strictEqual(result, 'ok');
});

test('runClassifiedAsync: returns mapError(err) when fn() rejects', async () => {
  const err = new Error('boom');
  const result = await runClassifiedAsync(
    async () => { throw err; },
    (caught) => ({ caught }),
  );
  assert.deepStrictEqual(result, { caught: err });
});

test('runClassifiedAsync: mapError never runs on the success path', async () => {
  let mapErrorCalls = 0;
  await runClassifiedAsync(async () => 'ok', () => { mapErrorCalls += 1; return 'unused'; });
  assert.strictEqual(mapErrorCalls, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/shared-primitives.test.js`
Expected: FAIL with "runClassified is not a function" (or a require error — `shared-primitives.js` does not yet export it)

- [ ] **Step 3: Implement `runClassified`/`runClassifiedAsync`**

Edit `plugin/bin/lib/shared-primitives.js` — add above the final `module.exports` line, and extend the header comment block to document the new export (append a third bullet, matching the existing two bullets' style):

```javascript
//   - runClassified / runClassifiedAsync: the try/execute/catch scaffold
//     shared by every hand-duplicated sync/async primitive pair in this repo
//     — `runGit`/`runGitAsync` (bin/lib/hooks/git-exec.js) and
//     `ghHealthCheck`/`ghHealthCheckAsync` (bin/lib/reconcile/preflight.js)
//     each previously retyped this shape once per twin. #1652: a
//     whole-branch pre-release review (pre-v6.110.0) found runGit's stderr
//     field had been added without updating runGitAsync to match, despite a
//     header comment claiming "identical return shape" — this extraction,
//     paired with each pair's own single buildSuccess/buildFailure shaping
//     functions (defined once, called from both twins), makes that class of
//     drift structurally impossible rather than merely documented against.
```

Then add the two functions:

```javascript
function runClassified(fn, mapError) {
  try {
    return fn();
  } catch (err) {
    return mapError(err);
  }
}

async function runClassifiedAsync(fn, mapError) {
  try {
    return await fn();
  } catch (err) {
    return mapError(err);
  }
}
```

Update the final line:

```javascript
module.exports = { GH_TIMEOUT_MS, LARGE_MAX_BUFFER_BYTES, escapeRegExp, runClassified, runClassifiedAsync };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/shared-primitives.test.js`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/shared-primitives.js tests/bin-lib/shared-primitives.test.js
git commit -m "Add runClassified/runClassifiedAsync shared try/catch scaffold (#1652)"
```

---

### Task 2: Refactor git-exec.js's runGit/runGitAsync onto the shared scaffold

**Files:**
- Modify: `plugin/bin/lib/hooks/git-exec.js`
- Test: `tests/hooks-git-exec.test.js` (existing — must pass unmodified)

**Interfaces:**
- Consumes: `runClassified(fn, mapError)`, `runClassifiedAsync(fn, mapError)` from `../shared-primitives` (Task 1).
- Produces: `runGit(args, cwd, opts)` / `runGitAsync(args, cwd, opts)` — same signatures and return shapes as before (`{ stdout, failure, stderr }`); no change visible to any caller.

- [ ] **Step 1: Run the existing suite to confirm it passes before touching anything**

Run: `node --test tests/hooks-git-exec.test.js`
Expected: PASS (all tests green on the current implementation — this is the baseline, not a red step; git-exec.js's existing behavior is not itself being changed)

- [ ] **Step 2: Refactor `runGit`/`runGitAsync` to share `buildSuccess`/`buildFailure` via the scaffold**

Edit `plugin/bin/lib/hooks/git-exec.js`. Add the import near the top (after the existing `const { promisify } = require('util');` block, before the `DEFAULT_TIMEOUT_MS` comment):

```javascript
const { runClassified, runClassifiedAsync } = require('../shared-primitives');
```

Replace the `runGit` and `runGitAsync` function bodies (lines 111-159 in the pre-refactor file — from the `function runGit(args, cwd, opts = {})` declaration through the closing `}` of `runGitAsync`) with:

```javascript
// Shared by both runGit and runGitAsync below — defined once so a future
// fix to the success/failure shape (e.g. the #1341 stderr addition) cannot
// land on one twin without the other picking it up automatically (#1652).
function buildSuccess(stdout) {
  return { stdout: stdout.trim(), failure: null, stderr: null };
}

function buildFailure(err) {
  // execFileSync/execFile populate err.stderr as a string when `encoding` is
  // set (as it is below), same as they populate err.stdout on success. A
  // timeout kill or a spawn failure (EAGAIN/ENOENT/...) may never have
  // produced any stderr at all — fall back to '' rather than surfacing
  // `undefined` through a field every caller now expects to be
  // string-or-null.
  const stderr = typeof err.stderr === 'string' ? err.stderr.trim() : '';
  return { stdout: null, failure: classify(err), stderr };
}

function runGit(args, cwd, opts = {}) {
  const timeout = resolveTimeout(opts);
  return runClassified(
    () => buildSuccess(cp.execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout,
      // Node defaults windowsHide to FALSE, which hands a child console
      // process a console of its OWN whenever the parent has none to
      // inherit. session-start.js's `reconcile-background` child is exactly
      // that case (`detached: true`), so without this flag every git query
      // the background pass makes flashes its own black console window on
      // Windows — one per invocation, for the whole pass, which reads to the
      // user as a runaway loop rather than routine janitorial work. Inert on
      // POSIX, where the option is ignored.
      windowsHide: true,
    })),
    buildFailure,
  );
}

// Async twin of runGit — a real (non-blocking) execFile, so a caller can run
// this concurrently with sibling async work instead of blocking the event
// loop (reconcile/index.js's FAST_CHECKS Promise.all, #872). Same contract
// as runGit (identical return shape via the shared buildSuccess/buildFailure
// above), just non-blocking — mirrors the execFile-based async pattern
// reconcile/pr-state.js's resolvePrStateAsync already established for `gh`
// calls, applied here to `git`.
//
// promisify(cp.execFile) is resolved fresh inside this function body, not
// hoisted to module scope — promisify captures its argument by reference at
// the point it's called, so hoisting would silently defeat a test's
// `cp.execFile = stub` monkeypatch (#872 follow-up — exactly this hoisted
// form shipped once and broke runGitAsync's own timeout test's ability to
// mock a slow child deterministically).
async function runGitAsync(args, cwd, opts = {}) {
  const timeout = resolveTimeout(opts);
  return runClassifiedAsync(
    async () => {
      const { stdout } = await promisify(cp.execFile)('git', ['-C', cwd, ...args], {
        encoding: 'utf8', timeout, windowsHide: true,
      });
      return buildSuccess(stdout);
    },
    buildFailure,
  );
}
```

Leave every other line of the file untouched (the module header comment, `resolveTimeout`, the `FAILURE`/`INDETERMINATE`/`isIndeterminate`/`classify` block, `repoSlugOf`, and the final `module.exports` line all stay exactly as they are — `runGit`/`runGitAsync`'s own inline comments move onto `buildSuccess`/`buildFailure`/the two refactored functions as shown above, not duplicated).

- [ ] **Step 3: Run the existing suite to verify it still passes**

Run: `node --test tests/hooks-git-exec.test.js`
Expected: PASS — same test count and names as Step 1's baseline, including the `windowsHide` test (which stubs `cp.execFileSync` and re-requires the module) and the async timeout test (which stubs `cp.execFile` and relies on call-time `promisify` resolution). If either of those two tests fails, the refactor broke call-time resolution — re-check that `cp.execFileSync(...)` and `promisify(cp.execFile)(...)` are still invoked from inside the closures passed to `runClassified`/`runClassifiedAsync`, not hoisted or passed as already-bound references.

- [ ] **Step 4: Commit**

```bash
git add plugin/bin/lib/hooks/git-exec.js
git commit -m "Refactor runGit/runGitAsync onto the shared runClassified scaffold (#1652)"
```

---

### Task 3: Refactor preflight.js's ghHealthCheck/ghHealthCheckAsync onto the shared scaffold

**Files:**
- Modify: `plugin/bin/lib/reconcile/preflight.js`
- Test: `tests/bin-lib/reconcile/preflight.test.js` (existing — must pass unmodified)

**Interfaces:**
- Consumes: `runClassified(fn, mapError)`, `runClassifiedAsync(fn, mapError)` from `../shared-primitives` (Task 1).
- Produces: `ghHealthCheck(opts)` / `ghHealthCheckAsync(opts)` — same signatures and return shapes as before (`{ ok, reason }`); no change visible to any caller (`reconcile/index.js`'s FAST_CHECKS dispatch calls both unchanged).

- [ ] **Step 1: Run the existing suite to confirm it passes before touching anything**

Run: `node --test tests/bin-lib/reconcile/preflight.test.js`
Expected: PASS (all tests green on the current implementation — baseline, not a red step)

- [ ] **Step 2: Refactor `ghHealthCheck`/`ghHealthCheckAsync` to share `buildSuccess`/`buildFailure` via the scaffold**

Edit `plugin/bin/lib/reconcile/preflight.js`. Add the import after the existing `const { classifyGhApiError } = require('../issues/claim-store');` line:

```javascript
const { runClassified, runClassifiedAsync } = require('../shared-primitives');
```

Replace the `ghHealthCheck` and `ghHealthCheckAsync` function bodies (the `function ghHealthCheck(opts = {})` declaration through the closing `}` of `ghHealthCheckAsync`) with:

```javascript
// Shared by both ghHealthCheck and ghHealthCheckAsync below — defined once
// so the two twins' success/failure shape cannot silently drift (#1652,
// mirrors git-exec.js's runGit/runGitAsync consolidation).
function buildSuccess() {
  return { ok: true, reason: null };
}

function buildFailure(e) {
  // Classification (ENOENT vs everything else) is shared with claim-store.js
  // and pr-state.js rather than reimplemented a third time here — only the
  // REASON VOCABULARY differs (this check reports 'github-unreachable', not
  // 'network-failure' — a different consumer, a different word for the same
  // classification) (review finding: 5 near-identical copies).
  const { failure } = classifyGhApiError(e);
  return failure === 'gh-absent' ? { ok: false, reason: 'gh-absent' } : { ok: false, reason: 'github-unreachable' };
}

// -> { ok: boolean, reason: null | 'gh-absent' | 'github-unreachable' }
// `rate_limit` is deliberately repo-agnostic and cheap — it answers "can we
// reach the GitHub API at all", not "does this repo's data look right".
function ghHealthCheck(opts = {}) {
  const timeoutMs = opts.timeoutMs || PREFLIGHT_TIMEOUT_MS;
  const runner = opts.runner || ((args) => defaultRunner(args, timeoutMs));
  return runClassified(
    () => { runner(['api', 'rate_limit', '-q', '.rate.remaining']); return buildSuccess(); },
    buildFailure,
  );
}

// Async twin of ghHealthCheck — a real (non-blocking) execFile, so
// reconcile/index.js's FAST_CHECKS dispatch can run this concurrently with
// the shared git fetch via Promise.all instead of paying for both serially
// (#872). Mirrors resolvePrStateAsync's (pr-state.js) established
// execFile-based async pattern: same buildSuccess/buildFailure as the sync
// version above — only the blocking-vs-non-blocking spawn differs.
async function ghHealthCheckAsync(opts = {}) {
  const timeoutMs = opts.timeoutMs || PREFLIGHT_TIMEOUT_MS;
  const runner = opts.runner || ((args) => defaultRunnerAsync(args, timeoutMs));
  return runClassifiedAsync(
    async () => { await runner(['api', 'rate_limit', '-q', '.rate.remaining']); return buildSuccess(); },
    buildFailure,
  );
}
```

Leave every other line of the file untouched (the module header comment, `defaultRunner`, `defaultRunnerAsync`, `PREFLIGHT_TIMEOUT_MS`, and the final `module.exports` line all stay exactly as they are).

- [ ] **Step 3: Run the existing suite to verify it still passes**

Run: `node --test tests/bin-lib/reconcile/preflight.test.js`
Expected: PASS — same test count and names as Step 1's baseline, including the event-loop concurrency test (`ghHealthCheckAsync: does not block the event loop`), which proves the refactor did not accidentally serialize the async path.

- [ ] **Step 4: Run reconcile/index.js's own FAST_CHECKS suite to verify the consumer is unaffected**

Run: `node --test tests/reconcile.test.js`
Expected: PASS — unchanged, since `reconcile/index.js` calls `require('./preflight').ghHealthCheckAsync()`/`ghHealthCheck()` by the same names with the same signatures.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/preflight.js
git commit -m "Refactor ghHealthCheck/ghHealthCheckAsync onto the shared runClassified scaffold (#1652)"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Deliverables asked to "either collapse FAST_CHECKS to async-native, or extract the shared wrapper shape." This plan takes the second, lower-risk option — collapsing FAST_CHECKS to async-native would require touching every synchronous caller of `runGit`/`ghHealthCheck`/`sharedFetch` outside the FAST_CHECKS Promise.all path (the sequential non-FAST_CHECKS branch in `reconcile/index.js`, plus every other hooks/ module that calls `runGit` synchronously), which is a much larger, higher-risk change than a `size:medium`/`ceremony:standard` record justifies. Acceptance Criteria's "no behavioral change to any existing caller" is best satisfied by the additive, non-invasive extraction.
- **`sharedFetch`/`sharedFetchAsync` scope decision:** the record's Current State names these as living in `preflight.js` alongside `ghHealthCheck`/`ghHealthCheckAsync`. They actually live in `plugin/bin/lib/reconcile/shared-fetch.js` (verified by reading the file — materialize.md's Named-location drift note). Read in full, they are not a hand-duplicated wrapper pair the way `runGit`/`runGitAsync` and `ghHealthCheck`/`ghHealthCheckAsync` are: `sharedFetch` handles two fetch shapes (mirror-only and `--prune`) while `sharedFetchAsync` handles only one (mirror-only), and each is a one-line delegation straight to `runGit`/`runGitAsync` with no independent try/catch/classify logic of its own to deduplicate. Left out of scope; noted here rather than silently dropped.
- **Placeholder scan:** no TBD/TODO/"add appropriate handling"-style text in any task above; every code block is complete, runnable content.
- **Type consistency:** `runClassified`/`runClassifiedAsync`'s signature (`fn, mapError`) is identical across Task 1's export and Tasks 2-3's two call sites. `buildSuccess`/`buildFailure` names are reused per-pair (once inside git-exec.js, once inside preflight.js) but never shared across the two files — each file keeps its own pair-local closures, consistent with the Architecture section above.
