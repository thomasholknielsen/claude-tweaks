---
record: 664
origin: human
risk: medium
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 664: pr-state tie-break: a newer OPEN PR should outrank an older MERGED PR as a do-not-touch signal for destructive consumers

Surface: backend

## Current State

`bin/lib/reconcile/pr-state.js`'s `resolvePrState()` joins a branch name to the PR(s) covering it and tie-breaks to a single governing state (lines 36-44): when multiple PRs exist for the same branch, a `MERGED` PR always wins, on the theory that merge is terminal. That's correct for the three read-mostly consumers (`reap-merged.js`, `archive-merged.js`, `release-merged.js`).

`prune-remote.js` is the fourth consumer, and it's destructive — it deletes a pushed remote branch. Its own tie-break, `decideRemotePrune()`, already treats an `OPEN` `prState` as a hard skip (`reason: 'pr-open'`), so the bug is entirely upstream: if `resolvePrState()` hands it a `MERGED` PR object when a newer `OPEN` PR also exists for that branch, `decideRemotePrune()` never sees the OPEN one and proceeds toward deletion.

This happens when a branch is reused after its first PR merged — new work pushed and a new OPEN PR opened (e.g. from another machine or session) — before `prune-remote` runs. `resolvePrState()` still reports the branch as MERGED. Today the only thing standing between that false signal and a deletion is `prune-remote.js`'s separate cherry-equivalence check (`isCherryEquivalent`, added in `b49ecc43`) — if the reused branch's new commits happen to be cherry-equivalent to something already in the integration branch, or that check has any gap, the branch is deleted while an OPEN PR still references it. Origin: `/review`'s final whole-branch review of #570, recommendation 4.

## Deliverables

- Give `resolvePrState()` a way for a destructive caller to make a newer OPEN PR outrank an older MERGED PR in its tie-break, without changing behavior for the three read-mostly consumers.
- Wire `prune-remote.js` to use that stronger tie-break.

Two implementation shapes both satisfy this — pick whichever proves simpler once in context:
- (a) an options parameter on `resolvePrState()` (e.g. `{ preferOpen: true }`) that flips the tie-break only when the caller opts in; `prune-remote.js` passes it, the other three consumers don't.
- (b) leave `resolvePrState()`'s default tie-break untouched and add an explicit `gh pr list --head {branch} --state open` re-check directly in `prune-remote.js`, run alongside (not replacing) the existing cherry-equivalence guard, before the delete/push.

## Acceptance Criteria

- Reproduce the #570 review scenario as a test: a branch with both a MERGED PR and a newer OPEN PR. Prove `prune-remote` no longer proceeds toward deletion for that branch (`decideRemotePrune` receives/derives the OPEN PR, not the MERGED one, and returns `pr-open`).
- `reap-merged.js`, `archive-merged.js`, `release-merged.js` keep today's behavior unchanged — a MERGED PR still wins their tie-break in the same branch/multi-PR shape. Add or extend a test proving this explicitly, not just by omission.
- Existing `resolvePrState`/`decideRemotePrune`/`prune-remote` tests (`tests/bin-lib/reconcile/prune-remote.test.js`) continue to pass unmodified except where they exercise the changed tie-break directly.
- `npm test` passes.

## Technical Approach

Touches `bin/lib/reconcile/pr-state.js` (`resolvePrState`) and `bin/lib/reconcile/prune-remote.js`. `prune-remote.js` already takes an injectable `resolvePr` override (`const resolve = resolvePr || resolvePrState;`, line 54) — the existing test suite's fake-runner pattern in `tests/bin-lib/reconcile/prune-remote.test.js` is the model to extend for the new MERGED+OPEN-together case, whichever of the two Deliverables shapes gets picked. `decideRemotePrune()` itself needs no change under shape (a): it already returns `pr-open` correctly once it's given the OPEN PR.

## Gotchas

- This is a targeted fix for the one destructive consumer, not a `resolvePrState`-wide policy flip — `reap-merged.js`/`archive-merged.js`/`release-merged.js` must keep preferring MERGED.
- The cherry-equivalence check already provides partial protection today; this record closes the residual gap, it isn't reporting `prune-remote` as currently unguarded.
- Check whether #570's PR or review thread left concrete reproduction notes/fixtures for the tie-break scenario before writing a fresh one from scratch.

## Original request

pr-state tie-break: a newer OPEN PR should outrank an older MERGED PR as a do-not-touch signal for destructive consumers

Origin: /review final whole-branch review of #570, recommendation 4

bin/lib/reconcile/pr-state.js resolvePrState returns any MERGED PR in preference to a newer OPEN one (merge is terminal). For read-mostly consumers that is right, but for remote-prune — a pushed deletion — a branch reused after its first PR merged (new work + new OPEN PR from another machine) presents MERGED to the decision table; only the fetch-fresh cherry-equivalence check (added in b49ecc43) protects it. A newer OPEN PR is a stronger do-not-delete signal than an older MERGED one is a safe-to-delete signal.

Scope: consider a per-consumer tie-break option in resolvePrState (e.g. preferOpen for destructive consumers), or an explicit OPEN-PR re-check in prune-remote before the push. Include the #570 review reproduction notes.

