---
record: 919
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
surface: infra
---
# 919: dispatch Settle step has no decisions.md log line for failure-check CLASSIFICATION/RATIONALE

Origin: spec #889 final review
Defer-reason: pre-existing-outside-diff

## Current State

`plugin/skills/dispatch/settle-and-merge.md`'s Settle step 3 (lines 32-40) invokes `/claude-tweaks:assess-agent-autonomy failure-check` and acts on its `CLASSIFICATION` (revoking or preserving `auto:merge`), but writes no `decisions.md` log line for this specific decision. The file's only `decisions.md` write (line 234-235) belongs to a different step entirely (the Auto-merge gate's own verdict logging), not Settle's classify-and-act step.

This means `failure-check`'s RATIONALE — including the new could-not-gather case #889 added, which names the specific gather-failure class (transport absent / fetch error) rather than reading as a content judgment — has nowhere durable to land for this caller. `grant-check`'s two callers (`backlog/grant-mode.md:334`, `backlog/refine-mode.md:341`) already carry RATIONALE verbatim into their own batch table / decisions.md log line, but dispatch's Settle step has no equivalent, so #889's own Deliverables claim ("the caller-facing consequence is loggable as a tooling condition... dispatch Settle") isn't actually true for this one caller. Found and verified during #889's final whole-branch review — confirmed by direct read of `settle-and-merge.md` lines 32-40 (no `decisions.md` write) and 234-235 (a different step's write).

Pre-existing gap, not introduced by #889's diff, and `settle-and-merge.md` is outside #889's plan file list.

## Deliverables

- [ ] Add a `decisions.md` log line to `settle-and-merge.md`'s Settle step 3, after the `CLASSIFICATION`-based revoke/preserve action, carrying `CLASSIFICATION`, `NOTIFY_NOW`, and `RATIONALE` verbatim — matching the shape `grant-check`'s two callers already use for their own `RATIONALE` logging.
- [ ] Confirm the log line renders correctly for both a normal classification and a could-not-gather short-circuit (the RATIONALE differs in shape but not in field name).

## Acceptance Criteria

- [ ] A human auditing `decisions.md` after a Settle run can see the `CLASSIFICATION`/`NOTIFY_NOW`/`RATIONALE` that drove the `auto:merge` revoke/preserve decision, the same way they already can for `grant-check`'s callers.

_Filed by `review` via specShapedBody._


