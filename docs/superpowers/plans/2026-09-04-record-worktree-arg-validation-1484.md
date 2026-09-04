# record-worktree Positional/--run Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #1484 — `record-worktree` (and, for consistency, `record-pr`/`close-run`) must never silently corrupt an unrelated run's `run-state.json` when `--run` is omitted or a `--`-prefixed flag typo (e.g. `--help`) lands in the worktree positional slot.

**Spec:** GitHub issue #1484 (materialized at `.claude-tweaks/pipelines/2026-09-04T181649-record-1484/work/1484-spec.md`).

## Assessment

All three Deliverables and all four Acceptance Criteria of #1484 are **already implemented and already covered by a pinned regression test** in the current `main` checkout, shipped under three later, broader issues that closed the same underlying hazard class:

1. **Reject any `--`-prefixed positional token** (Deliverable 1) — `plugin/bin/hooks.js`'s `record-worktree` branch: `else if (worktreeArg && worktreeArg.startsWith('-')) { ... 'unrecognized argument ${worktreeArg} — worktree not recorded' ... return 1; }` (comment cites #1124 explicitly as the record that hardened this).
2. **Require an explicit `--run`** (Deliverable 2) — same branch: `if (!explicit) { ... 'record-worktree requires --run — worktree not recorded' ... return 1; }`. `record-pr` and `close-run` share the identical `resolveRunArg(..., { unambiguousOnly: true, callerIdentity })` seam (#1012's unambiguous-only resolution — refuses on multiple/foreign candidates rather than guessing); `record-pr`'s positional PR-number argument is separately safe by construction (`Number(numberArg)` + `Number.isInteger` rejects any flag-shaped string as "not a valid PR number" rather than accepting it), and `close-run` takes no positional argument at all, so neither has record-worktree's specific flag-as-positional hazard to guard against.
3. **`--help`/`-h` handling** (Deliverable 3) — `main()`'s `#1143` verb-agnostic intercept, ahead of every dispatch branch: for the five mutating verbs (including `record-worktree`) any undeclared `--*` token or a bare `-h` prints usage and returns `0` *before* `resolveRunArg` or any lib call ever runs, so a stray `--help` can no longer reach the write path at all.

**Regression coverage (Acceptance Criteria 1-3):** `tests/hooks-dispatcher.test.js`, test `'record-worktree without --run is a true no-op against two concurrent run directories, and exits non-zero; --help is a separate, earlier no-op (#1143)'` (lines ~182-226) pins exactly this issue's reproduction shape — two live sibling run dirs, a bare `record-worktree <path>` call (no `--run`) asserted non-zero exit + byte-unchanged state on both dirs, a separate `record-worktree --help` call asserted exit 0 / usage text / no write, and a same-suite discrimination test (`'record-worktree accepts --run before or after the worktree positional'`) proving the fix doesn't regress the legitimate explicit-`--run` path. AC4 (`npm test` green) is verified in Task 1 below.

**Conclusion:** no production code change is required — #1484's own reproduction case is the exact case #1124/#1143/#1012 already closed, before this record ever reached dispatch. This plan has one verification task, not an implementation task, mirroring the precedent set by `docs/superpowers/plans/2026-09-01-claims-registry-undefined-write-guard.md` (#821 — a record whose defect had also already been fixed as a side effect of unrelated consolidation work).

---

### Task 1: Verify the full suite is green (AC4) and record the finding

**Files:** none modified — verification only.

- [x] **Step 1: Confirm the pinned regression test passes**

  Run: `node --test tests/hooks-dispatcher.test.js`
  Result: pass — the #1143/#1124 regression test above passes on current `main`.

- [x] **Step 2: Run the full suite**

  Run: `npm test`
  Result: see commit message / pipeline decisions log for the exact pass count.

- [x] **Step 3: Commit**

  Commit this plan (audit trail of the assessment) alongside the already-materialized `work/1484-spec.md`. No other files change.
