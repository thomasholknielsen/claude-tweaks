---
record: 18
origin: human
risk: low
effort: low
grants: [build, merge]
surface: backend
---
# 18: Widen grouping.js label recognition to by:* origin labels

## Current State
bin/lib/issues/grouping.js's extractKeyFiles keys on bare pre-migration labels (`code-health`, `harness-health`) — post-6.0 records carry `by:*` origin labels, so health-filed records degrade to singleton grouping, weakening /dispatch's group-claim collision guard.
## Deliverables
extractKeyFiles recognizes both the bare legacy names AND by:code-health / by:harness-health / by:journey-health; +1 test per form.
## Acceptance Criteria
A record labelled by:code-health with an Anchor line yields key files; the legacy bare-label form still works; node --test bin/lib/issues/tests/grouping.test.js passes.
