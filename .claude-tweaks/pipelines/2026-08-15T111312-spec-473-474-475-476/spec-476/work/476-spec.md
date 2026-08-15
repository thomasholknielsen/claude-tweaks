---
record: 476
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: needs-definition-label-design:wu4-backlog-attention
blocked-by: [473, 475]
surface: backend
---
# 476: /backlog attention — human-owed discovery surface

Surface: backend

## Overview

Add `/backlog attention`, a fourth, read-only `/backlog` mode that unifies discovery of every open record carrying `needs:definition` or `solution:unjustified` into one ranked list with a per-row, type-differentiated recommended action. Depends on #473 (the `needs:definition` label) and #475 (the `solution:unjustified` rename — the label doesn't exist under that name until #475 lands).

See the parent decomposition (#471) and the GitHub issue body for full Deliverables/Acceptance Criteria/Gotchas — materialized here as the build-time spec for `/claude-tweaks:flow`'s record-mode pipeline.

<!-- work-fingerprint: needs-definition-label-design:wu4-backlog-attention -->
