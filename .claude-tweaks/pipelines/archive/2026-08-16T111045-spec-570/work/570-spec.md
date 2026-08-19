---
record: 570
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 570: tidy routing: reconcile-converge merged remote-branch deletes; add a routing row for Mark-as-specified

Surface: backend

## Current State

The 2026-08-16 standalone `/tidy` run staged two remote-branch deletions for branches already merged into the integration branch, plus a "Mark as specified" design-doc status stamp — all items the operator expected applied automatically. Two gaps cause the recurring staging:

1. **Remote-branch cleanup has no reconcile check.** `bin/lib/reconcile/archive-branches.js` deliberately scopes all mutations to the local checkout — its header states "never a pushed deletion" and defers origin-side cleanup to PR merges and tidy's remote-ref pruning. A merged-but-undeleted remote branch therefore has no mechanical disposition: tidy's Step 4.5 scan surfaces it and Step 6 stages the delete, run after run.

2. **"Mark as specified" has no routing row.** `skills/tidy/scan-procedures.md` Step 3 emits the recommendation (a design doc with no status whose derived specs exist), but `skills/tidy/step-6-auto.md`'s routing table has no row for it, so it default-stages — even though the adjacent Delete row auto-applies deletion of *already*-marked docs at every tier, and the stamp itself is a tracked-file edit that clears the reversibility floor.

`step-6-auto.md`'s own preamble names this situation a defect: "A recurring staged item is a missing routing rule … the fix is a routing row — or a reconcile check — that disposes of it mechanically."

## Deliverables

1. A new reconcile convergence check (archive-branches/reap family, `bin/lib/reconcile/`) that deletes remote branches proven merged into the integration branch. Same pure-decision-functions-with-I/O-at-the-edges pattern as `archive-branches.js`/`reap-merged.js`; evidence conditions (merged-in-substance via `git cherry` against the integration branch, plus PR-merged state via `pr-state.js`) documented in the module header, which owns them. Scope-guarded to plugin-owned branch namespaces and branches not attached to a live worktree; runs under `integration-model: pr-first` only, per `bin/lib/reconcile/index.js`'s existing guard. Registered in `index.js`.
2. A routing row in `skills/tidy/step-6-auto.md`'s recommendation table for the new check's findings — Reconcile-converged, reported under **Applied automatically**, mirroring the existing "Abandoned-branch archival + locked-worktree resolution" row (including the `local-merge` caveat reference and skip-sub-line reporting).
3. A routing row for the **Mark as specified** recommendation (Step 3's design-doc status stamp): auto-apply at `moderate`/`aggressive`, stage at `conservative` — a tracked-file edit, same reversibility class as the existing `local-files` Defer row.
4. An update to `archive-branches.js`'s header comment ("origin-side cleanup belongs to PR merges and tidy's remote-ref pruning"), which the new check partially supersedes.
5. Tests under `tests/bin-lib/` for the new check's pure decision functions.

## Acceptance Criteria

- [ ] A remote branch proven merged into the integration branch (plugin-owned namespace, no live worktree attached, carrying both a MERGED PR and cherry-equivalence — the stricter bar the build shipped; "no open PR" alone is insufficient for a pushed deletion) is deleted by reconcile's convergence pass and reported under **Applied automatically** — never staged.
- [ ] A candidate failing the evidence conditions (open PR, unmerged commits, transport failure, out-of-scope namespace) is skipped with a reason and never deleted.
- [ ] Under `integration-model: local-merge` the new check does not run (`index.js` guard) — existing behavior unchanged.
- [ ] The "Mark as specified" recommendation has an explicit routing row; at default `moderate` aggressiveness the stamp is applied automatically and logged to `decisions.md` per `_shared/auto-decision-log.md`, not staged.
- [ ] `npm test` passes, including new decision-function tests.

## Technical Approach

Follow the established reconcile pattern (`release-merged.js`, `archive-branches.js`): a pure `decide*` table with I/O at the edges, unit-testable without live git/gh. The remote deletion is an outward write; it is permitted as reconcile's own background-convergence write — the same posture exemption `release-merged.js`'s claims-blob write already uses — governed by the module header's evidence conditions, not the skill-side auto-mode tier table. The Mark-as-specified row is a doc edit in `step-6-auto.md` (and `step-6-interactive.md` if its structure requires a parallel entry) plus the stamp action itself as scan-procedures.md already describes it.

## Gotchas

- A pushed remote deletion is unrecoverable from the local side once origin GCs the ref — the evidence bar must be the strict merged-in-substance one (`git cherry`, the same reason `archive-branches.js` uses `-D` behind its decision table and never trusts `-d`), corroborated by PR state, not ancestry alone.
- Evidence must be computed against FRESH remote refs: the check runs `git fetch --prune origin` first and fails closed (whole check skipped) when the fetch fails — cached `refs/remotes/origin/*` can be stale, and an unleased `push --delete` judged on stale evidence destroys commits another machine pushed since. (Added at build time — the final whole-branch review reproduced the data-loss scenario; the fetch's `--prune` also stops already-deleted refs being re-examined every run.)
- A branch attached to a live worktree must remain out of scope — reuse `parseWorktreeList` liveness the way `archive-branches.js`'s `inScope` does.
- Do not route "Mark as specified" through reconcile — it is a local tracked-file edit; a tidy tier row is the correct mechanism, unlike the remote deletes, which are outward writes forbidden on tidy tiers at every aggressiveness level.
- The cleanly-merged local Delete row in step-6-auto.md predates the reconcile checks and stays tier-routed for `local-merge` parity — the new check must not absorb or break it.

## Original request

tidy routing: reconcile-converge merged remote-branch deletes; add a routing row for Mark-as-specified

**Related:** none

Context: 2026-08-16 run staged two already-merged remote-branch deletes and a doc status stamp the operator expected auto-applied. step-6-auto.md's own preamble says mechanical outward dispositions ride reconcile's convergence, and Step 3's Mark-as-specified outcome has no routing row, so it default-stages.

Scope: a reconcile check (archive-branches/reap family) deleting remote branches proven merged into the integration branch; a routing row for the Mark-as-specified recommendation.

