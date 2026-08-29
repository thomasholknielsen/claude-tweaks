# Compute-Then-Exit Truncation Fix (release.js, review-coordination.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `process.exit(fn(...))` with `process.exitCode = fn(...);` in `plugin/bin/release.js` and `plugin/bin/review-coordination.js`, so a stdout/stderr write inside the last-called function can't be truncated by an immediate hard-stop.

**Architecture:** Both files already end with `process.exit(<fn>(<args>))` as their sole final module-level statement, where `<fn>` is a plain synchronous function that itself returns an integer exit code after any stdout/stderr writes. Node's `process.exitCode = N` sets the code the process will exit with once the event loop drains naturally (letting any pending stream writes flush first), instead of forcing an immediate exit. Since both call sites are already the module's very last statement, this is a direct one-line swap per file with no control-flow restructuring — no `return` to add, no enclosing function to change.

**Tech Stack:** Node.js (CommonJS), `node --test`.

**Spec:** `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1313/.claude-tweaks/pipelines/2026-08-27T043429-record-1313/work/1313-spec.md` (record #1313)

## Global Constraints

- Same mechanical pattern as #1176 — `process.exitCode = <value>;` instead of `process.exit(<value>)`.
- No additional control-flow changes: both `main()` (release.js) and `run()` (review-coordination.js) already return an integer as their last action in every branch, with no code after their own final write that assumes an immediate hard-stop (confirmed by reading both files in full — no `after error` cleanup happens post-exit, no unflushed-stream assumption exists anywhere else in either file).
- Both files exit with the same status code as before for a representative success and failure case (AC1) — the existing test suites already assert this by spawning each CLI as a real subprocess and reading its exit code, so no new exit-code test is needed; running them green after the change is the verification.
- `npm test` passes in full (AC2).

---

### Task 1: Swap `process.exit()` for `process.exitCode =` in `plugin/bin/release.js`

**Files:**
- Modify: `plugin/bin/release.js:132`
- Test (existing, no changes needed): `tests/bin-lib/release/status-cli.test.js`

**Interfaces:**
- Consumes: nothing new — `main(argv)` (defined earlier in this same file) already returns an integer exit code in every branch (`0`, `1`, or `2` via `status()`).
- Produces: nothing new — the module's exit-code contract to callers (`node plugin/bin/release.js ...`, spawned by tests and by `docs/skill-authoring.md`-documented CLI usage) is unchanged; only the *mechanism* setting that code changes.

- [ ] **Step 1: Confirm the current failing-once baseline (read-only, no code change yet)**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1313" && node --test tests/bin-lib/release/status-cli.test.js`
Expected: PASS (this is the pre-change baseline — establishes the tests are green before touching the file, so a post-change failure is attributable to this change)

- [ ] **Step 2: Make the swap**

In `plugin/bin/release.js`, change the file's last line from:

```javascript
process.exit(main(process.argv));
```

to:

```javascript
process.exitCode = main(process.argv);
```

- [ ] **Step 3: Run the existing CLI test to verify exit codes are unchanged**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1313" && node --test tests/bin-lib/release/status-cli.test.js`
Expected: PASS — this suite spawns `plugin/bin/release.js status ...` as a real subprocess via `execFileSync` and asserts exit 0 for a representative success case and exit 1/2 for failure cases (bad ref, usage error), so it directly covers AC1 for this file.

- [ ] **Step 4: Commit**

```bash
git add plugin/bin/release.js
git commit -m "Fix compute-then-exit truncation risk in release.js — refs #1313"
```

---

### Task 2: Swap `process.exit()` for `process.exitCode =` in `plugin/bin/review-coordination.js`

**Files:**
- Modify: `plugin/bin/review-coordination.js:106`
- Test (existing, no changes needed): `tests/bin-lib/review-coordination/cli.test.js`

**Interfaces:**
- Consumes: nothing new — `run(argv)` (defined earlier in this same file) already returns an integer exit code in every branch (`0` or `2`).
- Produces: nothing new — same exit-code contract, unchanged mechanism only.

- [ ] **Step 1: Confirm the current baseline (read-only, no code change yet)**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1313" && node --test tests/bin-lib/review-coordination/cli.test.js`
Expected: PASS (pre-change baseline)

- [ ] **Step 2: Make the swap**

In `plugin/bin/review-coordination.js`, change:

```javascript
if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}
```

to:

```javascript
if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}
```

- [ ] **Step 3: Run the existing CLI test to verify exit codes are unchanged**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1313" && node --test tests/bin-lib/review-coordination/cli.test.js`
Expected: PASS — this suite already spawns `plugin/bin/review-coordination.js` as a real subprocess for every command (`categorise-reproduction`, `detect-overlap`, `resolve-debate`, `resolve-refutation`) and asserts exit 0 for representative successes plus a dedicated test asserting exit 2 across five distinct malformed-invocation cases, so it directly covers AC1 for this file.

- [ ] **Step 4: Commit**

```bash
git add plugin/bin/review-coordination.js
git commit -m "Fix compute-then-exit truncation risk in review-coordination.js — refs #1313"
```

---

### Task 3: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1313" && npm test 2>&1 | tail -60`
Expected: PASS — full green run (AC2). Per this project's accepted-flake list, ignore `changelog-coverage` naming only 6.107.0/6.108.0 (#1527) and `pr-state.test.js`'s event-loop flake (re-verify in isolation if it appears) as pre-existing, unrelated to this diff.
