---
record: 716
origin: capture
risk: low
size: low
ceremony: standard
grants: [build]
---
# 716: auto-mode-contract: the closing Next Actions call is a navigation affordance, not silenced by consoleAutoResolve

Origin: session evaluation of the #620-#625 /flow run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

The Interaction style directive injected with every skill invocation mandates ending with `## Next Actions` via `AskUserQuestion`; `_shared/auto-mode-contract.md`’s "no new mid-flow stops in auto" plus `unattended`’s `consoleAutoResolve` reads as suppressing all terminal prompts. In a full unattended /flow run, both terminal turns ended in prose with zero AskUserQuestion calls — the user composed the next command (`merge PR #634`) unprompted. The contract genuinely supports both readings. Related: #714 and #715.

## Deliverables

- [ ] `_shared/auto-mode-contract.md`: state explicitly that the closing `## Next Actions` call is OUTSIDE `consoleAutoResolve`’s zero-click scope (a navigation affordance, not an approval gate) — add to the not-silenced list
- [ ] The terminal Next Actions’ Recommended option is the natural next command (e.g. the merge, when green — closing the loop with #715)

## Acceptance Criteria

1. `grep -n "Next Actions" skills/_shared/auto-mode-contract.md` shows it on the not-silenced list.
2. The next unattended /flow run’s final turn ends with an AskUserQuestion whose Recommended option is the actual next command.

_Filed by `capture` via specShapedBody._

