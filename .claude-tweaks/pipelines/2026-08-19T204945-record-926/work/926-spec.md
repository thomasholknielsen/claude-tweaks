---
record: 926
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: infra
---
# 926: build/failure-recovery.md does not clearly cover Common Step 3 (simplify) dispatch failures

Origin: reflect full (batch scope) from the #888/#889 multi-spec run (flagged by the CLAUDE.md curation judge)
Defer-reason: tangential

## Current State

`plugin/skills/build/failure-recovery.md` is scoped to Superpowers execution-skill failures at `/build` Common Step 2. The 2026-08-18 platform-529 dispatch failure hit the code-simplifier dispatch at Common Step 3 instead; the file's "Anything else" row gives the right posture (log, retry, don't block) but does not clearly reach that call site, so a session handling a Step 3 dispatch failure has no named procedure to cite — the #888/#889 run improvised the correct handling (ledger item, retry after the incident cleared).

## Deliverables

- [ ] `failure-recovery.md` (or `/build` Common Step 3's own prose) states which recovery rows apply to component-skill dispatch failures outside Common Step 2, or Common Step 3 gains a one-line pointer to the applicable row.

## Acceptance Criteria

- [ ] A `/build` session whose Common Step 3 simplifier dispatch fails transiently can cite a named procedure (file + row) for log-retry-continue instead of improvising.

_Filed by `reflect` via specShapedBody._
