---
record: 712
origin: capture
risk: low
size: medium
ceremony: fast-lane
grants: [build]
surface: infra
---
# 712: Cap wakeup parking per dispatch wave and forbid multi-sub-file cat batching — controller context-overhead rules

Origin: session evaluation of the #620-#625 /flow run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

A six-spec /flow run's controller made 72 `noop: true` ScheduleWakeup parks (9.8% of its API calls) at ~503K average context per call, though task-notifications were the actual resume signal in every case but two. Separately, batching two `_shared`/skill sub-files into one `cat a; cat b` call silently truncated 11 KB mid-result (the harness caps tool-result size), costing two re-reads — the drop is silent, so the controller believed it had read text it never saw.

## Deliverables

- [ ] `_shared/subagent-output-contract.md` (or the dispatch guidance in `flow/multi-spec.md`): name the task-notification as the primary resume signal; cap parking to one long-delay watchdog per dispatch wave, not one per dispatch
- [ ] A Don't (docs/donts.md) against batching two full skill sub-files into a single `cat` — combined size can exceed the tool-result cap and the truncation is silent

## Acceptance Criteria

1. `grep -n "task-notification" skills/_shared/subagent-output-contract.md` names it the primary resume signal.
2. `grep -n "cat" docs/donts.md` carries the batching rule with its one-clause why.

_Filed by `capture` via specShapedBody._
