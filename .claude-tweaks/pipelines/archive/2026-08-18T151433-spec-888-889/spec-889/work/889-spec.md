---
record: 889
origin: capture
risk: medium
size: low
ceremony: standard
grants: []
surface: infra
---
# 889: assess-agent-autonomy grant-check/failure-check gathers are transport-blind — conservative fallback silently writes trust state

## Current State

`grant-check.md` Step 1 hardcodes `gh issue view` and `failure-check.md` Step 1 hardcodes `gh api`, while every caller maintains a `gh`-absent MCP transport path (`dispatch/mcp-transport.md`, `_shared/record-queue-fetch.md`, `_shared/github-write-transport.md`). Nothing in `skills/assess-agent-autonomy/` references the transport contract.

`SKILL.md`'s Error Handling converts any failed gather into the mode's conservative verdict. In a `gh`-absent sandbox that means: `failure-check` renders `CLASSIFICATION: correctness`, so dispatch's Settle **revokes `auto:merge` over a transport gap**; headless `grant-check` (backlog grant's gate 4) renders `RECOMMEND_BUILD/MERGE: false` for every candidate, forever — a structural no-op indistinguishable from principled caution. This is the silent-fallback-masks-bugs class: the conservative default turns a tooling absence into what looks like a content judgment, and it writes trust state.

`merge-check.md` Step 1 already handles its own resolution failure correctly — render `needs-human` with a RATIONALE naming the specific failure — a pattern the other two modes never inherited.

## Deliverables

- Amend `SKILL.md`'s Error Handling section to distinguish two cases: **could-not-gather** (transport/tooling failure — `gh` absent, fetch error) renders the mode's conservative verdict with a RATIONALE that names the specific gather failure verbatim (e.g. "gh unavailable — could not fetch record body; conservative default, not a content judgment"), never a content-judgment rationale; **gathered-but-inconclusive** keeps today's behavior. Cite `merge-check.md` Step 1's existing resolution-failure handling as the pattern being generalized.
- Update `grant-check.md` Step 1 and `failure-check.md` Step 1: when the calling context resolved the MCP transport (per the caller's own transport contract, e.g. `dispatch/mcp-transport.md`), route the gather through it instead of `gh`; when no transport is available at all, skip straight to the could-not-gather rendering above rather than attempting `gh` and misreporting.
- Ensure the caller-facing consequence is loggable as a tooling condition: the RATIONALE text carried into `decisions.md` lines (dispatch Settle, backlog grant/refine) names the gather failure, so a human auditing the log can tell "transport was down" from "the content warranted caution".
- Add an Anti-Patterns row to `SKILL.md` pinning the rule (rendering a conservative verdict with a content-style rationale when the gather itself failed).

## Acceptance Criteria

- A `gh`-absent or failed-fetch `grant-check`/`failure-check` run renders its conservative verdict with a RATIONALE naming the gather-failure class (transport absent / fetch error) — never a rationale that reads as content judgment.
- Both sub-files' Step 1 reference the caller's transport path for the `gh`-absent case; no mode silently assumes `gh`.
- Prose-conformance tests pin the Error Handling two-case distinction and the new Anti-Patterns row; `npm test` passes.

_Filed by `capture` via specShapedBody._
