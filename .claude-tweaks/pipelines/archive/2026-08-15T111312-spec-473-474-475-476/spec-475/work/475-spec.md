---
record: 475
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: needs-definition-label-design:wu3-solution-unjustified
blocked-by: [473]
surface: backend
---
# 475: solution:unjustified — rename framing:baked + bounded auto-resolution

Surface: backend

## Overview

Rename `framing:baked` to `solution:unjustified` for clarity, and add a bounded, in-process evidence search to `/specify`'s existing `framing-check` step so the label only ever fires on the genuine residual — cases where an agent looked for justification and found none — rather than on every solution-baked verdict as it does today. Stays informational at grant time; no hard gate. Depends on #473 (same `_shared/work-record.md` Label taxonomy table / `_shared/label-bootstrap.md` `LABELS_JSON` this rename lands on top of).

See the parent decomposition (#471) and the GitHub issue body for full Deliverables/Acceptance Criteria/Gotchas — materialized here as the build-time spec for `/claude-tweaks:flow`'s record-mode pipeline.

<!-- work-fingerprint: needs-definition-label-design:wu3-solution-unjustified -->
