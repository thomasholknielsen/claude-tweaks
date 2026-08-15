---
record: 474
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: needs-definition-label-design:wu2-gate-redirect-help
blocked-by: [473]
surface: backend
---
# 474: needs:definition — hard gate, /specify redirect, /help visibility

Surface: backend

## Overview

Wire `needs:definition` into the three consumers that make it a real hard gate rather than a fact nobody enforces: `grant-check` and the headless `/backlog grant` machine lane both refuse unconditionally on presence; `/specify` structurally cannot shape a flagged record in place, redirecting instead to `/superpowers:brainstorming` and closing the origin record once decomposition produces its replacement; `/help` surfaces flagged backlog-bucket records so a human knows one is waiting. Depends on #473 for the label's existence and for `facets.needsDefinition`.

See the parent decomposition (#471) and the GitHub issue body for full Deliverables/Acceptance Criteria/Gotchas — materialized here as the build-time spec for `/claude-tweaks:flow`'s record-mode pipeline.

<!-- work-fingerprint: needs-definition-label-design:wu2-gate-redirect-help -->
