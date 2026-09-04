---
record: 921
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
---
# 921: Multi-spec runs have no defined PR phase-checklist convention (cumulative vs. per-active-spec reset)

Origin: spec #889 build (Common Step 7 handoff)
Defer-reason: pre-existing-outside-diff

## Current State

`_shared/pr-early-run-lifecycle.md`'s Phase-checklist update section describes one PR body checklist (`- [ ] build/test/review/wrap-up`) that monotonically flips forward as a run's phases complete — designed for a single-spec run. `flow/multi-spec.md` never addresses what the checklist should do when a second (or later) spec's own build→test→review→wrap-up cycle restarts inside the same shared PR: does the checklist track "has ANY spec in this run reached this phase" (cumulative, never un-checks) or "what phase is the CURRENTLY ACTIVE spec at" (resets per spec)?

Discovered live during the #888/#889 multi-spec run: spec 888 completed review and wrap-up, but the PR checklist was never advanced past `[x] build [x] test` for those phases (an execution gap, not a design gap — but it exposed that there's no defined convention to follow). When spec 889 began its own build cycle, the checklist still showed spec 888's stale test/review/wrap-up state, and there was no rule to consult for whether to check all 4 boxes (misleadingly implying the whole run is done) or reset non-build boxes to unchecked (discarding spec 888's own completion record).

## Deliverables

- [ ] `flow/multi-spec.md` (or `_shared/pr-early-run-lifecycle.md`) states which interpretation applies for a multi-spec run's shared PR checklist, and why.
- [ ] If the "reset per active spec" interpretation is chosen, state explicitly that a later spec's phase-checklist update should reset the trailing phases to unchecked, not just add checks.
- [ ] If a per-spec-visible representation is preferred instead (e.g. `- [x] build (spec 888, 889)` style rows, or a separate sub-list per spec), describe that shape instead.

## Acceptance Criteria

- [ ] A maintainer reading a multi-spec run's PR checklist at any point mid-run can tell, without reading `decisions.md`, which specs have completed which phases — or the doc explicitly states the checklist is coarse/run-level only and phase-accurate state lives in `decisions.md`.

_Filed by `review` via specShapedBody._
