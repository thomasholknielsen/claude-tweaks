---
record: 644
origin: human
risk: medium
size: medium
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 644: hooks.js reconcile: reaps the calling session's own cwd worktree; silently re-skips move-failed run dirs and removal-failed worktrees indefinitely; report never surfaces the residue

Surface: backend

## Current State

`bin/lib/reconcile` (invoked via `bin/hooks.js reconcile`, and in-process by `session-start.js`) runs several convergence checks — `reapMerged` (`bin/lib/reconcile/reap-merged.js`) reaps worktrees whose branch's PR has merged, and `archiveMerged` (`bin/lib/reconcile/archive-merged.js`) archives finished run directories.

`reapMerged` skips a worktree only when `isWorktreeLocked` reports it in-use (reused from `worktree-reap.js`) — there is no separate check for whether the worktree contains the calling session's own `process.cwd()`. When a session merges its own run's PR from inside that run's worktree and then calls `reconcile`, the lock check does not catch this case and the worktree gets removed out from under the live session: the next Bash call fails on the deleted cwd, and a subsequent `ExitWorktree` call becomes a no-op.

`archiveMerged`'s per-file rename loop and `archiveOrphanedMint` both return `{ ok: false, reason: 'move-failed' }` on a `fs.renameSync`/`fs.mkdirSync` failure, and `reapMerged` returns `{ action: 'skip', reason: 'removal-failed' }` when `git worktree remove` fails — but neither path persists any record of *how many times* a given path has failed. A path that fails once is retried identically, indefinitely, with no per-path counter and no escalation after N consecutive failures — confirmed by grepping `bin/lib/reconcile` for `consecutive`/`failureCount`/`escalat*`, which finds nothing.

`/flow`'s closing report has no code path that reads reconcile's output and prints a one-line summary of stuck/declined items — a search of `skills/flow/*.md` for "reconcile" finds only unrelated references (dependency ordering prose, PR-first cleanup notes), never a report line. Residue (stuck run dirs, failed removals, a declined mirror fast-forward) is visible today only by reading the raw JSON `reconcile` returns.

Observed in one real run: the reconciler reaped the calling session's own cwd worktree; 15 run dirs were stuck at `move-failed` (oldest 7 days); 1 worktree was stuck at `removal-failed`, re-skipped on every subsequent call with the identical reason and no escalation; a mirror fast-forward was declined (`dirty`) and had to be completed by hand.

## Deliverables

1. **Never reap the calling session's own cwd worktree.** In `reapMerged` (`bin/lib/reconcile/reap-merged.js`), add an explicit check — alongside the existing `isWorktreeLocked` skip — that a candidate worktree containing `process.cwd()` (or the `cwd` passed to `reapMerged`) is always skipped, regardless of PR state. Use a new skip reason (e.g. `'own-cwd'`) distinct from `'in-use'` so the two cases stay distinguishable in `skipped[]`.
2. **Persist a per-path failure counter and escalate after N consecutive failures.** Track consecutive failures for `move-failed` (`archiveMerged`/`archiveOrphanedMint`) and `removal-failed` (`reapMerged`) per path, across reconcile invocations (in-process calls from `session-start.js` and CLI calls via `bin/hooks.js reconcile` both need to observe the same counter — persist it somewhere both readers/writers reach, e.g. alongside the run dir or worktree state already tracked by the reconcile module, not an in-memory-only counter that resets every process). After N consecutive failures on the same path (pick and document a concrete N — 3 is a reasonable default absent a stronger signal), escalate: file or update a backlog work record (or, if a `/tidy` finding channel already exists for this class of residue, route through that instead) naming the stuck path and the last-seen errno/reason, rather than silently re-skipping forever.
3. **Print a one-line reconcile residue summary in `/flow`'s closing report.** Wherever `/flow`'s closing report is composed (a `skills/flow/*.md` file — confirm the exact insertion point during implementation; none of the files currently grepped for "reconcile" own this report), add a line summarizing reconcile's last-run output in the shape the issue's proposed fix names: `reconcile: {archived} archived, {stuck} stuck (oldest {age}), mirror ff {declined-or-ok}` — sourced from the same JSON `reconcile()` already returns (`{ mirror, worktrees, claims, runs, branches, remoteBranches, console, skipped }`), not a new data source.

## Acceptance Criteria

- A unit test against `reapMerged`/`decideReap` proves: a worktree whose real path equals (or contains) the passed `cwd` is skipped with a distinct reason even when its PR is merged and it is not locked by `isWorktreeLocked`.
- A unit test proves: after N consecutive `move-failed` (or `removal-failed`) results for the same path across repeated calls, the module escalates (files/updates a work record, or whatever the implementation lands on) exactly once — not on every call thereafter — and stops re-triggering the escalation on every subsequent still-failing call.
- A unit test proves: on the (N-1)th consecutive failure, no escalation fires yet; on success, the counter resets to zero.
- `/flow`'s closing report, when reconcile ran during the session, includes a one-line summary matching the shape above with real numbers substituted (archived count, stuck count + oldest age, mirror ff outcome) — verified by a test on the report-composition code path, not just eyeballing a manual run.
- Existing reconcile test suites (`tests/bin-lib/reconcile/` or wherever they live) still pass unmodified apart from additions for the above.

## Technical Approach

Start from `bin/lib/reconcile/reap-merged.js`'s `decideReap`/`reapMerged` for the cwd-guard fix (item 1) — it's a pure decision function already structured for exactly this kind of additional check. For the failure counter (item 2), look for an existing per-run or per-worktree state file the reconcile module already reads/writes (e.g. near `run-state.json` or wherever `archive-merged.js` already persists state) before introducing a new one — reuse over new-file sprawl. For the closing-report line (item 3), locate the actual composition point for `/flow`'s closing report (search beyond the files already checked in Current State) before writing to it.

## Gotchas

- The escalation mechanism (item 2) must not create duplicate work records on every reconcile call once a path has crossed the N-failure threshold — idempotency (e.g. checking for an existing open record/finding for the same path before filing a new one) is part of "escalate," not an afterthought.
- The per-path counter must survive across process invocations (CLI `bin/hooks.js reconcile` vs. in-process `session-start.js` calls) — an in-memory-only counter would silently never reach N in normal usage, since each invocation is a fresh process.
- Confirm during implementation whether `/flow`'s closing report is generated by a skill markdown template, a script, or both — Current State's search of `skills/flow/*.md` found no existing owner for this report, so the insertion point needs to be located fresh rather than assumed.

## Original request

hooks.js reconcile: reaps the calling session's own cwd worktree; silently re-skips move-failed run dirs and removal-failed worktrees indefinitely; report never surfaces the residue

**Summary:** The post-merge reconciler removed the worktree the calling session was standing in (next command: "Working directory … was deleted; shell cwd recovered", then `ExitWorktree` no-op), and its census shows 15 run dirs stuck at `move-failed` (oldest 7 days) and 1 worktree at `removal-failed` re-skipped on every call with no escalation; the mirror fast-forward was declined (`dirty`) and had to be done by hand.

**Kind:** Defect

**Affected component:** `bin/lib/reconcile` (via `bin/hooks.js reconcile`); `/flow` closing report

**Objective:** Recovery quality

**Measurement:** 15 run dirs `move-failed` (oldest 2026-08-09); 1 worktree `removal-failed`; 1 mirror ff declined; 10 orphaned run ledgers in `docs/plans/`; 2 errors from self-reaping the live cwd.

**Repro steps:**
1. From inside a run's worktree, merge its PR, then run `node bin/hooks.js reconcile`.
2. Observe the worktree containing `process.cwd()` reaped; the next Bash call fails on the deleted cwd.
3. Run reconcile again a day later; observe the same `move-failed`/`removal-failed` paths skipped with identical reasons.

**Expected vs. actual:**
Expected: the caller's cwd worktree returns `action: deferred-to-caller`; repeated failures on one path escalate (a tidy finding or a backlog record naming the path and errno); the closing report prints a one-line residue summary.
Actual: self-reap, indefinite silent skip, residue invisible unless the operator reads the JSON.

**Proposed fix:** (1) never reap the worktree containing `process.cwd()`; (2) persist a per-path failure counter and escalate after N consecutive failures; (3) `/flow`'s closing report prints `reconcile: 1 archived, 15 stuck (oldest 7d), mirror ff declined — dirty`.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
