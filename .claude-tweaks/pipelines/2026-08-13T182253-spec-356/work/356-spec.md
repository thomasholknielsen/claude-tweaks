---
record: 356
origin: docs-health
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
fingerprint: docshealth-5df784aa
---
# 356: Doc staleness: decisions/0006-ceremony-tiering-owned-by-specify — Consequences

**Doc:** decisions/0006-ceremony-tiering-owned-by-specify | **Section:** Consequences | **Category:** staleness | **Misleads:** human engineer + coding agent | **Classification:** additive | **Confidence:** high

## Current State

grep confirms no skills/review-backlog directory exists in the current tree; CHANGELOG.md v6.18.0 (2026-07-26) states '/claude-tweaks:backlog replaces /triage and /review-backlog'. The ADR's Consequences section (line 25) makes a present-tense functional claim — '`/review-backlog`'s advisory `Suggested tier` column ... can read directly' — describing an ongoing capability, not a historical event (unlike the Context section's line 11, which narrates the historical user request and is correctly left alone). A reader or retrieval agent citing this ADR today would look for a skill and column name that no longer exist; the equivalent lives in skills/backlog/overview-mode.md's risk-value lens as a 'Tier' column instead. The doc already established the correction pattern for exactly this kind of drift with its 2026-08-08 note on effort:* -> size:*.

## Deliverables

**Current:**
```
**Note (2026-08-08):** the `effort:*` facet referenced below was renamed to `size:*` in spec #217 — this document's body is left as originally written to preserve the historical record.
```

**Proposed:**
```
**Note (2026-08-08):** the `effort:*` facet referenced below was renamed to `size:*` in spec #217 — this document's body is left as originally written to preserve the historical record.

**Note (2026-08-13):** `/review-backlog`, named below as the consumer of the ceremony tier, was retired and merged into `/claude-tweaks:backlog` in v6.18.0 (2026-07-26) — the equivalent is now `/backlog`'s risk-value-lens `Tier` column, not a `Suggested tier` column. This document's body is left as originally written to preserve the historical record.
```

## Acceptance Criteria

Add a dated note (matching this doc's existing Note (2026-08-08) precedent) recording that `/review-backlog`, named in the Consequences section as the current consumer of the ceremony tier, was retired and merged into `/claude-tweaks:backlog` in v6.18.0 (2026-07-26) per CHANGELOG.md, whose risk-value lens now exposes the equivalent as a `Tier` column (skills/backlog/overview-mode.md:66) rather than the named 'Suggested tier' column. Body text stays as originally written.

_Filed by `/claude-tweaks:docs-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._

<!-- work-fingerprint: docshealth-5df784aa -->
