---
record: 989
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: infra
---
# 989: pr-early-run-lifecycle: two-call dispatch's build phase silently skipped draft-PR creation

Surface: infra

Origin: reflect light from record #861 (wrap-up Near-misses lens)
Defer-reason: needs-human-decision

## Current State

During `#861`'s dispatch-orchestrated two-call `/flow` run (`build,test` then `review,polish,wrap-up`, `PIPELINE_RUN_DIR` shared across both — `flow/steps-and-gates.md`'s "Intentional two-call consumer" section), the first call's `build` phase should have run `_shared/pr-early-run-lifecycle.md`'s run-start procedure (invoked from `build/worktree-setup.md` Step 6, "immediately after `build/SKILL.md` Spec Step 1's materialize commit, before Spec Step 2") — pushing the branch and opening a draft PR before any implementation work.

When the second call (`review,polish,wrap-up`) resumed the run, none of that had happened: the branch `worktree-record-861` had no upstream tracking ref (`git push` had never run), `gh pr list --head worktree-record-861 --state all` returned `[]`, and `run-state.json` did not exist at all in the run directory. Critically, `decisions.md` — the first call's own audit log — contained no entry at all for the PR-lifecycle step, success or failure. `pr-early-run-lifecycle.md`'s own "Skip / degrade behavior" table names several failure modes (push failure, `gh pr create` failure, `gh` absent, offline) and each one specifies a `decisions.md` log line — none of those lines were present either. So this wasn't a documented degrade; it was silent non-execution, or execution outside whatever code path actually gets exercised in the two-call dispatch handoff.

The second call worked around this by running `pr-early-run-lifecycle.md`'s Steps 1-4 manually before polish/wrap-up (pushed the branch, created draft PR #987, recorded it via `record-pr`), so record #861's own outcome wasn't blocked. But the underlying gap — first-call `build` in a two-call dispatch split not reliably reaching (or not logging) the run-start PR-lifecycle step — would recur on every `auto:merge`-eligible record dispatched this way, silently degrading every one of them to the same "no PR until review/wrap-up catches it" state, one call's worth of `pr-first` visibility lost each time.

## Deliverables

- Determine why `build/worktree-setup.md` Step 6 did not fire (or fired and failed without logging) for the `#861` run's `build,test` call — check whether the two-call dispatch's first Task invocation actually reaches Spec Step 1's materialize-commit point that Step 6 hooks off of, or whether something upstream of it (materialize commit ordering, a worktree-creation timing issue, a silently-swallowed exception) prevented it.
- Either fix the missed invocation, or — if the actual cause turns out to be a legitimate degrade condition not currently covered by `pr-early-run-lifecycle.md`'s degrade table — add the missing log line so the failure is visible in `decisions.md` rather than silent.
- Add a regression test (or extend an existing dispatch/build two-call test) asserting that after a `build,test`-only `/flow` call completes on a `pr-first` project, either `run-state.json` carries a `pr` object or `decisions.md` carries one of the documented degrade log lines — never neither.

## Acceptance Criteria

- A `build,test`-only two-call dispatch run against a `pr-first` project reliably produces either a draft PR + `run-state.json.pr`, or a logged, attributable degrade reason in `decisions.md` — no silent third outcome.
- `npm test` green.

## Technical Approach

Trace the two-call dispatch handoff (`dispatch`'s per-group Task calls, `flow/steps-and-gates.md`'s "Intentional two-call consumer") from the first call's Spec Step 1 materialize commit through `build/worktree-setup.md` Step 6's invocation of `_shared/pr-early-run-lifecycle.md`, comparing what actually executed against what the prose says should. Check both the ordinary success path and every branch in the degrade table for a missing log-write.

### Key Files

- `plugin/skills/build/worktree-setup.md` — Step 6
- `plugin/skills/_shared/pr-early-run-lifecycle.md` — run-start procedure and its degrade table
- `plugin/skills/flow/steps-and-gates.md` — "Intentional two-call consumer" section
- `plugin/skills/dispatch/*` — the two-call Task dispatch orchestration

## Gotchas

- The fix must not change the documented degrade behaviors' actual outcomes (offline, `gh` absent, etc.) — only close the gap where a real failure or a real success produced neither a `run-state.json.pr` entry nor a `decisions.md` log line.

## Original request

pr-early-run-lifecycle: two-call dispatch's build phase silently skipped draft-PR creation

Origin: reflect light from record #861 (wrap-up Near-misses lens)
Defer-reason: needs-human-decision

## Current State

During `#861`'s dispatch-orchestrated two-call `/flow` run (`build,test` then `review,polish,wrap-up`, `PIPELINE_RUN_DIR` shared across both — `flow/steps-and-gates.md`'s "Intentional two-call consumer" section), the first call's `build` phase should have run `_shared/pr-early-run-lifecycle.md`'s run-start procedure (invoked from `build/worktree-setup.md` Step 6, "immediately after `build/SKILL.md` Spec Step 1's materialize commit, before Spec Step 2") — pushing the branch and opening a draft PR before any implementation work.

When the second call (`review,polish,wrap-up`) resumed the run, none of that had happened: the branch `worktree-record-861` had no upstream tracking ref (`git push` had never run), `gh pr list --head worktree-record-861 --state all` returned `[]`, and `run-state.json` did not exist at all in the run directory. Critically, `decisions.md` — the first call's own audit log, which I re-derived findings from per this task's instruction to verify every claim against raw artifacts rather than trust the log — contained **no entry at all** for the PR-lifecycle step, success or failure. `pr-early-run-lifecycle.md`'s own "Skip / degrade behavior" table names several failure modes (push failure, `gh pr create` failure, `gh` absent, offline) and each one specifies a `decisions.md` log line — none of those lines were present either. So this wasn't a documented degrade; it was silent non-execution, or execution outside whatever code path actually gets exercised in the two-call dispatch handoff.

The second call worked around this by running `pr-early-run-lifecycle.md`'s Steps 1-4 manually before polish/wrap-up (pushed the branch, created draft PR #987, recorded it via `record-pr`), so this record's own outcome isn't blocked. But the underlying gap — first-call `build` in a two-call dispatch split not reliably reaching (or not logging) the run-start PR-lifecycle step — would recur on every `auto:merge`-eligible record dispatched this way, silently degrading every one of them to a same-symptom "no PR until review/wrap-up catches it" state, one call's worth of `pr-first` visibility lost each time (no draft PR to watch progress on during build/test).

## Deliverables

- Determine why `build/worktree-setup.md` Step 6 did not fire (or fired and failed without logging) for this run's `build,test` call — check whether the two-call dispatch's first Task invocation actually reaches Spec Step 1's materialize-commit point that Step 6 hooks off of, or whether something upstream of it (materialize commit ordering, a worktree-creation timing issue, a silently-swallowed exception) prevented it.
- Either fix the missed invocation, or — if the actual cause turns out to be a legitimate degrade condition not currently covered by `pr-early-run-lifecycle.md`'s degrade table — add the missing log line so the failure is visible in `decisions.md` rather than silent.
- Add a regression test (or extend an existing dispatch/build two-call test) asserting that after a `build,test`-only `/flow` call completes on a `pr-first` project, either `run-state.json` carries a `pr` object or `decisions.md` carries one of the documented degrade log lines — never neither.

## Acceptance Criteria

- A `build,test`-only two-call dispatch run against a `pr-first` project reliably produces either a draft PR + `run-state.json.pr`, or a logged, attributable degrade reason in `decisions.md` — no silent third outcome.
- `npm test` green.

_Filed by `wrap-up` (light-mode Near-misses lens) via specShapedBody._

