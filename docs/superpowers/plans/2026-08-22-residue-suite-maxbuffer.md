# Residue Suite maxBuffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `residue.js`'s `suiteRun()` from misreporting a passing-but-large test suite (>1 MiB of TAP output) as a failed `suite` finding, by giving its `execFileSync('npm', ['test'], …)` call a generous explicit `maxBuffer` and by having the probe layer distinguish a genuine buffer-overflow (`ENOBUFS`) from an actual non-zero test exit code.

**Architecture:** Two small, coupled changes. `plugin/bin/residue.js`'s `suiteRun()` closure gets an explicit `maxBuffer: 64 * 1024 * 1024` (64 MiB) on the `execFileSync` call, plus a new catch-branch that recognizes `err.code === 'ENOBUFS'` and returns a distinguishable result shape (`{ code: null, stdout: '', bufferOverflowed: true }`) — the same pattern the existing `timedOut` branch already uses. `plugin/bin/lib/residue/probes/suite.js`'s `probeSuite()` gets one new early-return branch that checks `result.bufferOverflowed` before the `result.code === 0` check and reports `ran: false, reason: 'test output exceeded capture buffer', findings: []` — never a fabricated `suite` finding. This mirrors the existing `timedOut` early-return exactly, one line above it.

**Tech Stack:** Node's built-in `node:test` + `node:assert`, plain functions — no new dependencies. Empirically verified in this checkout (2026-08-22): a `>1 MiB` `npm test` TAP output makes `execFileSync` throw an error with `err.code === 'ENOBUFS'`, `err.status === 7` (a leftover `spawnSync` status field, not a real process exit code), `err.killed === undefined`, and `err.stdout` truncated to ~1,048,090 bytes. Under `suiteRun()`'s *current* (unpatched) code, this falls through the `err.killed` check (false) into the `typeof err.status === 'number'` branch, producing `{ code: 7, stdout: <truncated> }` — which `probeSuite` then reports as a fabricated `test suite exit 7` finding. This confirms the bug exactly as described in the spec.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T111227-record-1160/work/1160-spec.md` (record #1160, materialized)

## Global Constraints

- No new dependencies, no new files beyond the one new/extended test file below.
- `probeSuite`'s existing behavior for a genuine non-zero exit code (real `not ok` lines, `result.code` a real exit code) must be completely unchanged — only the new `ENOBUFS` path is added.
- `npm test` must pass in full at the end (Acceptance Criteria 3).

---

### Task 1: maxBuffer fix + ENOBUFS classification, with regression test

**Files:**
- Modify: `plugin/bin/residue.js:89-97` (the `suiteRun` closure inside `main()`)
- Modify: `plugin/bin/lib/residue/probes/suite.js:15-18` (the `probeSuite` early-return chain)
- Modify: `tests/bin-lib/residue/probes-observed.test.js` (add the regression test alongside the existing `probeSuite` tests in that file — lines 8-42 already test `probeSuite` with a stubbed `run`)

**Interfaces:**
- Consumes: nothing new — `probeSuite({ scope, run })`'s existing signature is unchanged; `run()` still returns either `null`, `{ code, stdout, timedOut: true }`, or `{ code, stdout }`. This task adds one more legal shape: `{ code: null, stdout: '', bufferOverflowed: true }`.
- Produces: `probeSuite` now also returns `{ ran: false, reason: 'test output exceeded capture buffer', findings: [] }` when `run()` returns a result with `bufferOverflowed: true` — nothing downstream of this task depends on it (residue.js's own caller already treats every `ran: false` result uniformly).

- [ ] **Step 1: Write the failing test for `probeSuite`'s new branch**

Add to `tests/bin-lib/residue/probes-observed.test.js`, immediately after the existing `'a timed-out suite does not run, rather than reporting green'` test (currently ending at line 42):

```javascript
test('a buffer-overflowed suite run does not run, rather than reporting a fabricated failure', () => {
  const r = probeSuite({ scope: SCOPE, run: () => ({ code: null, stdout: '', bufferOverflowed: true }) });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
  assert.match(r.reason, /capture buffer/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bin-lib/residue/probes-observed.test.js`
Expected: FAIL — `r.ran` is `true` (the stub result falls through to the `result.code === 0` check, which is false since `code` is `null`, and then into the fabricated-finding branch), not `false`.

- [ ] **Step 3: Implement the `probeSuite` branch**

In `plugin/bin/lib/residue/probes/suite.js`, add one line immediately after the existing `timedOut` check (currently line 17), before the `result.code === 0` check:

```javascript
  if (result.timedOut) return { ran: false, reason: 'test command timed out', findings: [] };
  if (result.bufferOverflowed) return { ran: false, reason: 'test output exceeded capture buffer', findings: [] };
  if (result.code === 0) return { ran: true, reason: null, findings: [] };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/bin-lib/residue/probes-observed.test.js`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Fix `residue.js`'s `suiteRun` — explicit maxBuffer + ENOBUFS classification**

In `plugin/bin/residue.js`, replace the current `suiteRun` closure (lines 89-97):

```javascript
  const suiteRun = () => {
    try {
      return { code: 0, stdout: execFileSync('npm', ['test'], { cwd, encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'ignore'] }) };
    } catch (err) {
      if (err && err.killed) return { code: null, stdout: '', timedOut: true };
      if (err && typeof err.status === 'number') return { code: err.status, stdout: String(err.stdout || '') };
      return null;
    }
  };
```

with:

```javascript
  const suiteRun = () => {
    try {
      return { code: 0, stdout: execFileSync('npm', ['test'], { cwd, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }) };
    } catch (err) {
      if (err && err.killed) return { code: null, stdout: '', timedOut: true };
      if (err && err.code === 'ENOBUFS') return { code: null, stdout: '', bufferOverflowed: true };
      if (err && typeof err.status === 'number') return { code: err.status, stdout: String(err.stdout || '') };
      return null;
    }
  };
```

Two changes: an explicit `maxBuffer: 64 * 1024 * 1024` (64 MiB — generous enough that this repo's current ~1 MiB TAP output, and years of growth beyond it, never overflows) on the `execFileSync` call, so the ENOBUFS path in practice should no longer trigger for this repo's own suite size at all; and a new catch-branch, checked before the generic `typeof err.status === 'number'` branch (since the empirically-observed `ENOBUFS` error also carries a numeric `err.status`, so ordering matters — the more specific check must come first), that recognizes the buffer-overflow signature and returns the new `bufferOverflowed` shape Task 1 Step 3 taught `probeSuite` to read. This keeps the fix defense-in-depth: the `maxBuffer` bump is the actual fix for this repo's current suite size, and the `ENOBUFS` classification is the correctness fix for any suite (this repo's future growth, or any other project's) that still exceeds even the new 64 MiB ceiling.

- [ ] **Step 6: Manually re-verify the empirical repro no longer reproduces**

Run (from the worktree root):

```bash
node -e "
const { execFileSync } = require('child_process');
try {
  execFileSync('npm', ['test'], { cwd: process.cwd(), encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
  console.log('no error — suite ran to completion under the new maxBuffer');
} catch (err) {
  console.log('code=', err.code, 'status=', err.status);
}
"
```

Expected: `no error — suite ran to completion under the new maxBuffer` (confirms Acceptance Criteria 1 directly — the same repro from the spec's Current State section no longer throws `ENOBUFS`).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS in full (Acceptance Criteria 3) — this also exercises `residue.js`'s existing CLI tests (`tests/bin-lib/residue/cli.test.js`) and every other `probeSuite`/`suite.js` test unchanged.

- [ ] **Step 8: Commit**

```bash
git add plugin/bin/residue.js plugin/bin/lib/residue/probes/suite.js tests/bin-lib/residue/probes-observed.test.js
git commit -m "Fix residue.js suiteRun() ENOBUFS false-failure on large passing suites (refs #1160)"
```
