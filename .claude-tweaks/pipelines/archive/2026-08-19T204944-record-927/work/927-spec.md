---
record: 927
origin: human
risk: low
size: medium
ceremony: fast-lane
grants: [build]
surface: infra
---
# 927: Extract assess-agent-autonomy's gather-resilience shape into a shared fragment

Origin: reflect hindsight from #889 (ledger item 12), routed to backlog at the multi-spec Review Console
Defer-reason: genuinely-larger

## Current State

#889 instantiated the same three-part gather-resilience shape (primary transport call → MCP fallback via `_shared/github-write-transport.md`'s `issue_read` mapping → "Neither available" could-not-gather short-circuit → "Or the fetch itself fails" could-not-gather short-circuit) independently in `plugin/skills/assess-agent-autonomy/grant-check.md` and `failure-check.md`, each ~20 lines of near-duplicate prose differing only in the rendered output lines (`RECOMMEND_BUILD`/`RECOMMEND_MERGE` vs `CLASSIFICATION`/`NOTIFY_NOW`) and the gather-target noun. `merge-check.md` already carries a shorter version of the same shape. Three live instances now exist within one skill, none citing a canonical statement of the pattern.

## Deliverables

- [ ] Extract the three-part shape into a shared fragment (e.g. `assess-agent-autonomy/_gather-resilience.md`, or `plugin/skills/_shared/` if other skills adopt it), parameterized by: the primary gather command, the MCP mapping citation, and the mode-specific Step 3 output lines.
- [ ] `grant-check.md`, `failure-check.md`, and `merge-check.md` cite the fragment instead of restating it; `tests/assess-agent-autonomy-transport-pin.test.js` updated to pin the citation shape.

## Acceptance Criteria

- [ ] The gather-resilience procedure is stated once; the three mode files each carry only their mode-specific parameters, and the existing transport pin tests still discriminate (revert-and-confirm-red on the fragment).

_Filed by `reflect` via specShapedBody._
