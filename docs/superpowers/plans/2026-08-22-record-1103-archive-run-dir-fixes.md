# Archive-Run-Dir Atomicity + Close-Run Ordering Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `archiveRunDir`'s non-atomic `git-mv-failed` mid-loop failure (can leave a partial move, contributing to a reported double-nested archive dir), and warn at `close-run` time when a run still holds un-archived git-tracked `work/` content, so an operator doesn't strand a run dir the normal reconcile pass may never revisit.

**Architecture:** Two independent, narrowly-scoped fixes in the reconcile/hooks bin layer. No new modules — both fixes extend existing functions (`archiveRunDir` in `archive-merged.js`, `closeRunState` in `close-run-state.js`) using patterns (`revertWorkMoves`, the `wrapupSeen`-style advisory field) already established in the same files.

**Tech Stack:** Node.js (CommonJS), `node --test`, the project's `runGit`/`fs` injectable-runner conventions.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1103/work/1103-spec.md`

## Global Constraints

- No new npm dependencies (this plugin ships zero runtime deps).
- Every code change needs a `node --test` regression test in the same style as neighboring tests in the touched file's test suite.
- `revertWorkMoves` (already implemented in `archive-merged.js`) must be reused for the git-mv-failed revert, not reimplemented.

## Scope note (read before Task 1)

The original record described two defects. Investigation during planning found:

1. **git-mv-failed non-atomicity** — confirmed still live by direct code read: `archiveRunDir`'s `workMoves` loop (`archive-merged.js`) returns `{ok:false, reason:'git-mv-failed'}` immediately on any `git mv` failure, with no revert of pairs already moved earlier in the same loop. Only the later `commit`-failure branch calls `revertWorkMoves`. This is a real, provable atomicity gap — fixed in Task 1.
2. **`close-run`-before-archive ordering hazard** — `iterRunDirsWithState` (`context.js`) does skip a run dir whose own run-state.json says `status: 'clean'`, and `archiveMerged`'s discovery loop is built directly on that iterator with a comment assuming a clean dir never needs archival. However, empirical testing during planning (closing two real run dirs via `close-run` before they were archived, then observing the live repo) showed both dirs *did* eventually get archived by some mechanism — the exact path was not conclusively identified (not `archiveMerged`'s documented no-worktree skip logic, which should have rejected them). Given this, and since the record's own Acceptance Criterion 1 explicitly accepts "the ordering requirement is documented at the close-run call site" as a valid resolution (not just a discovery-iterator fix), Task 2 takes the lower-risk path: warn explicitly at `close-run` time when the run still holds un-archived git-tracked `work/` content, so an operator sees the hazard instead of discovering it later. This avoids restructuring the discovery iterator and `archiveMerged`'s worktree-resolution logic, which turned out to be more entangled (and the actual current run-time behavior more forgiving) than the original report assumed.

## Task 1: Fix `archiveRunDir`'s git-mv-failed mid-loop atomicity

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js` (the `workMoves` loop inside `archiveRunDir`, currently around lines 194-215)
- Test: `tests/bin-lib/reconcile/archive-merged.test.js`

**Interfaces:**
- Consumes: `revertWorkMoves(root, workMoves)` — already defined in this file (returns `boolean` fullyReverted), `runGit(args, root)` — already imported.
- Produces: `archiveRunDir` now returns `{ ok: false, reason: 'git-mv-failed' }` only when NOTHING was moved before the failure, and `{ ok: false, reason: 'git-mv-failed-partial-revert' }` when a mid-loop failure's revert of already-moved pairs did not fully succeed. Callers that pattern-match on `result.reason` (e.g. `trackArchiveResult` in the same file) already treat any non-`'move-failed'` reason as "don't increment the failure-streak counter" per the existing `trackArchiveResult` tests — the new reason string needs no special-case there, but read `trackArchiveResult`'s test (`only tracks move-failed — a different failure reason never enters the counter`) before assuming this, and update it only if it turns out to assert an exhaustive list of known reasons.

- [ ] **Step 1: Read the current loop to confirm the exact lines to change**

```bash
grep -n "workMoves.length" -A 25 plugin/bin/lib/reconcile/archive-merged.js
```

Confirm the loop still matches this shape (adjust line numbers below if it has drifted):

```js
  if (workMoves.length) {
    for (const [src, dest] of workMoves) {
      const mv = runGit(['mv', src, dest], root);
      if (mv.failure) return { ok: false, reason: 'git-mv-failed' };
      movedEntries.push(path.relative(runDir, src));
    }
    const commit = runGit(['commit', '-m', `[reconcile] archive run ${runId}`], root);
    if (commit.failure) {
      const fullyReverted = revertWorkMoves(root, workMoves);
      return { ok: false, reason: fullyReverted ? 'commit-failed' : 'commit-failed-partial-revert' };
    }
  }
```

- [ ] **Step 2: Write the failing test — git-mv fails on the SECOND pair of a multi-spec run, first pair must be reverted**

Add to `tests/bin-lib/reconcile/archive-merged.test.js`, near the existing `'archiveRunDir: git mv succeeds but git commit fails — reverts on disk and in the index, leaving the tree clean'` test (read that test first for the exact fixture-setup helpers it uses — `makeRunDir`/`makeMultiSpecRunDir` or equivalent; use the same fixture pattern rather than inventing a new one):

```js
test('archiveRunDir: git mv fails on the SECOND of two spec work/ pairs — first pair is reverted, nothing left partially moved', () => {
  const { root, runDir, cleanup } = makeMultiSpecRunDir(['1101', '1102']); // use this file's actual multi-spec fixture helper name — read the existing multi-spec test above for the real helper
  try {
    let mvCalls = 0;
    const originalRunGit = require('../../../plugin/bin/lib/hooks/git-exec').runGit; // adjust the require path to match this test file's existing import style
    // Prefer this file's own injectable-runner seam if one already exists for
    // runGit (check the top of the test file / archive-merged.js for a deps
    // parameter) rather than monkeypatching the module export directly —
    // use whichever pattern the existing 'git mv succeeds but commit fails'
    // test above already uses to simulate a git failure, mirror it exactly
    // instead of introducing a new mocking approach.

    const result = archiveRunDir(root, runDir); // with the injected failure wired to fail on the 2nd `git mv` call specifically

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'git-mv-failed');
    // The first spec's work/ must be back at its original path — not moved,
    // not staged.
    assert.ok(fs.existsSync(path.join(runDir, 'spec-1101', 'work')));
    assert.ok(!fs.existsSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive', path.basename(runDir), 'spec-1101', 'work')));
  } finally {
    cleanup();
  }
});

test('archiveRunDir: git mv fails on the first pair — no revert needed, reason is plain git-mv-failed (unchanged behavior)', () => {
  // Mirrors the existing single-pair-failure case to pin that Task 1's change
  // doesn't alter the already-correct first-pair-failure behavior.
});
```

**Note to implementer:** the exact mocking mechanism (how the existing test file simulates a `git mv` failure) must be read from the existing `'archiveRunDir: git mv succeeds but git commit fails'` test before writing this — do not guess at an injection seam; copy the established pattern.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js`
Expected: FAIL — the second-pair-failure test fails because the current code doesn't revert the first pair (it returns `git-mv-failed` immediately without checking `spec-1101/work`'s state, and that assertion should fail because the pre-fix code leaves it partially moved... or already correctly not-moved depending on git-exec's mock semantics). If the fixture reveals the *first*-pair-failure test also fails for an unrelated fixture-setup reason, fix the fixture before proceeding — both tests must fail for the RIGHT reason (missing revert logic), not a fixture bug.

- [ ] **Step 4: Implement the fix**

Replace the loop body in `archiveRunDir` (same file):

```js
  if (workMoves.length) {
    const succeededMoves = [];
    for (const [src, dest] of workMoves) {
      const mv = runGit(['mv', src, dest], root);
      if (mv.failure) {
        const fullyReverted = revertWorkMoves(root, succeededMoves);
        return { ok: false, reason: fullyReverted ? 'git-mv-failed' : 'git-mv-failed-partial-revert' };
      }
      succeededMoves.push([src, dest]);
      movedEntries.push(path.relative(runDir, src));
    }
    const commit = runGit(['commit', '-m', `[reconcile] archive run ${runId}`], root);
    if (commit.failure) {
      const fullyReverted = revertWorkMoves(root, workMoves);
      return { ok: false, reason: fullyReverted ? 'commit-failed' : 'commit-failed-partial-revert' };
    }
  }
```

`revertWorkMoves(root, [])` (the first-pair-failure case, `succeededMoves` still empty) is a safe no-op — its `for` loop simply doesn't execute, and it returns `fullyReverted: true` — so the first-pair-failure path's reason stays the plain `'git-mv-failed'` string, matching pre-fix behavior exactly (Step 2's second test pins this).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js`
Expected: PASS — all tests in the file, including the two new ones and every pre-existing test (the change must not alter the first-pair-failure or commit-failure paths' observable behavior).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — 0 failures. (If a failure count varies run-to-run under load, re-run only `tests/bin-lib/reconcile/archive-merged.test.js` in isolation per CLAUDE.md's flake-tolerance note before concluding anything is broken.)

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-merged.js tests/bin-lib/reconcile/archive-merged.test.js
git commit -m "Revert already-moved work/ pairs on a mid-loop git-mv failure in archiveRunDir (#1103)"
```

## Task 2: Warn at close-run time when the run still holds un-archived git-tracked work/

**Files:**
- Modify: `plugin/bin/lib/hooks/close-run-state.js` (`closeRunState`)
- Modify: `plugin/bin/hooks.js` (the `close-run` CLI handler, currently around lines 308-340)
- Test: create `tests/bin-lib/hooks/close-run-state.test.js` (no existing dedicated test file for this module — confirmed via `grep -rl closeRunState tests/` returning nothing)

**Interfaces:**
- Consumes: `ctxLib.readRunState(runDir)` (already used), a new check for a git-tracked `work/` subdirectory under `runDir`.
- Produces: `closeRunState` now returns an additional boolean field `notYetArchived` in its `{status:'closed', ...}` return shape — `true` when `runDir` still has an on-disk `work/` entry (single-spec) or any `spec-*/work/` entry (multi-spec) at the time of closing. The CLI handler prints an additional warning line when this field is `true`.

- [ ] **Step 1: Write the failing test for `closeRunState`'s new field**

Create `tests/bin-lib/hooks/close-run-state.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { closeRunState } = require('../../../plugin/bin/lib/hooks/close-run-state');

function makeTmpRunDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'close-run-state-test-'));
  return dir;
}

test('closeRunState: notYetArchived is true when the run dir still has a top-level work/ subdirectory', () => {
  const dir = makeTmpRunDir();
  try {
    fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'work', '42-spec.md'), '# 42\n');
    const r = closeRunState(dir, { explicit: true, sessionId: 's1' });
    assert.strictEqual(r.status, 'closed');
    assert.strictEqual(r.notYetArchived, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: notYetArchived is true when a multi-spec spec-N/work/ subdirectory exists', () => {
  const dir = makeTmpRunDir();
  try {
    fs.mkdirSync(path.join(dir, 'spec-42', 'work'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec-42', 'work', '42-spec.md'), '# 42\n');
    const r = closeRunState(dir, { explicit: true, sessionId: 's1' });
    assert.strictEqual(r.notYetArchived, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: notYetArchived is false when no work/ subdirectory exists anywhere under the run dir', () => {
  const dir = makeTmpRunDir();
  try {
    fs.writeFileSync(path.join(dir, 'decisions.md'), '# decisions\n');
    const r = closeRunState(dir, { explicit: true, sessionId: 's1' });
    assert.strictEqual(r.notYetArchived, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: refused-foreign case never reaches the notYetArchived check', () => {
  const dir = makeTmpRunDir();
  try {
    fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify({ sessionId: 'other-session' }));
    const r = closeRunState(dir, { explicit: false, sessionId: 'this-session' });
    assert.strictEqual(r.status, 'refused-foreign');
    assert.strictEqual('notYetArchived' in r, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/hooks/close-run-state.test.js`
Expected: FAIL — `r.notYetArchived` is `undefined`, not `true`/`false`, since `closeRunState` doesn't compute this field yet.

- [ ] **Step 3: Implement the fix**

Modify `plugin/bin/lib/hooks/close-run-state.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const ctxLib = require('./context');

// A run dir still holds un-archived git-tracked work/ content if either the
// top-level work/ (single-spec layout) or any spec-*/work/ (multi-spec
// layout, materialize.md's Multi-record layout) exists on disk. Closing such
// a run before it's archived is the ordering hazard #1103 reports — this
// check surfaces it as an advisory field rather than blocking the close (the
// escape-hatch use case — closing a stuck/foreign run manually — must still
// work even when work/ hasn't landed).
function hasUnarchivedWork(runDir) {
  if (fs.existsSync(path.join(runDir, 'work'))) return true;
  let entries;
  try {
    entries = fs.readdirSync(runDir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((e) => e.isDirectory() && e.name.startsWith('spec-') && fs.existsSync(path.join(runDir, e.name, 'work')));
}

function closeRunState(runDir, { explicit = false, sessionId = null } = {}) {
  const prev = ctxLib.readRunState(runDir);
  const foreignOwner = !!(prev && typeof prev.sessionId === 'string' && prev.sessionId && sessionId && prev.sessionId !== sessionId);
  if (foreignOwner && !explicit) {
    return { status: 'refused-foreign' };
  }

  const wrapupSeen = !!(ctxLib.scanWrapupEvents(runDir) || {}).wrapup;
  if (!wrapupSeen) {
    ctxLib.appendEvent(runDir, 'close-without-wrapup', {});
  }

  const notYetArchived = hasUnarchivedWork(runDir);
  const writeOk = !!ctxLib.writeRunState(runDir, { status: 'clean', worktree: null });
  return { status: 'closed', foreignOwner, wrapupSeen, writeOk, notYetArchived };
}

module.exports = { closeRunState, hasUnarchivedWork };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/hooks/close-run-state.test.js`
Expected: PASS — all four tests.

- [ ] **Step 5: Write the failing test for the CLI warning line**

Find this repo's existing pattern for testing `hooks.js close-run`'s printed output — read `tests/hooks-dispatcher.test.js` or `tests/archive-run-verb.test.js` first (both already grep-matched `close-run`) to copy the exact invocation shape (likely `execFileSync('node', ['plugin/bin/hooks.js', 'close-run', '--run', dir], {...})` or an injectable-runner test harness specific to this repo). Add a test asserting the new warning line appears in stdout when `work/` exists, and does NOT appear when it doesn't — mirror the existing `wrapupSeen`-triggered warning test in the same file if one exists (search for `'no recorded wrap-up invocation'` in the test suite first).

- [ ] **Step 6: Run to verify it fails, then implement the CLI-side print**

In `plugin/bin/hooks.js`'s `close-run` handler (~line 308-340), add after the existing `wrapupSeen` warning block:

```js
      if (r.notYetArchived) {
        process.stdout.write(
          `claude-tweaks: run ${path.basename(runDir)} still holds un-archived git-tracked work/ content — ` +
          'closing it now makes it invisible to the normal reconcile archival pass (a known ordering hazard, #1103). ' +
          `Archive it first: node "${pluginRoot()}/bin/hooks.js" archive-run --run "${runDir}"\n`,
        );
      }
```

Check whether `pluginRoot()` (or an equivalent already-in-scope helper) exists in this file for composing the plugin-root-relative command text — grep `pluginRoot` in `hooks.js` first; if the helper has a different name, use that name instead, and if none exists, use the literal `${CLAUDE_PLUGIN_ROOT}` env-var form other warning messages in this codebase use (grep existing `hooks.js` warning strings for the established convention) rather than inventing a new one.

- [ ] **Step 7: Run the CLI test to verify it passes**

Run: `node --test <the test file from Step 5>`
Expected: PASS.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS — 0 failures.

- [ ] **Step 9: Commit**

```bash
git add plugin/bin/lib/hooks/close-run-state.js plugin/bin/hooks.js tests/bin-lib/hooks/close-run-state.test.js <the CLI test file from Step 5>
git commit -m "Warn at close-run time when a run still holds un-archived work/ content (#1103)"
```

## Self-check before handoff

- Both tasks are independently testable and independently committable — Task 1 does not depend on Task 2 or vice versa.
- No placeholder steps — every code block above is the actual diff, not a description of one.
- `hasUnarchivedWork` is exported from `close-run-state.js` alongside `closeRunState` in case a future caller (e.g. `teardown-run`, which `close-run-state.js`'s own header comment says shares this module) wants the same check.
