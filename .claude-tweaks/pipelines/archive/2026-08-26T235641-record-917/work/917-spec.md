---
record: 917
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 917: Calibration read-out: partial archive retention causes silent gaps in row telemetry

Surface: backend

**Related:** #901

## Current State

#901's `aggregate()` only synthesizes stub runs from TSV rows when the archive dir is entirely empty — a partially-pruned archive (older run dirs archived-then-deleted while `wrap-up-outcomes.tsv` persists) leaves matching TSV rows permanently and silently stuck at "no runs in window." Found during #901 Task 2 review (2026-08-18).

## Deliverables

Synthesize stub runs for any TSV `runId` missing an archived dir (not just the all-empty case), or document the retention-mismatch limit explicitly in the report legend — the build decides which of the two, since both close the gap.

## Acceptance Criteria

- A TSV row whose `runId` has no matching archived dir no longer silently drops out of the calibration read-out — either it is stub-synthesized like the all-empty case, or the report legend explicitly documents the retention-mismatch limit so the gap is visible rather than silent.
- The fix (or documented limit) covers a partially-pruned archive, not only the fully-empty case #901 already handles.

## Technical Approach

Extend `aggregate()`'s existing stub-synthesis path (currently gated on "archive dir entirely empty") to instead check per-`runId` whether an archived dir exists, synthesizing a stub for any row missing one — the same mechanism #901 already built, applied per-row instead of gated on the whole-archive state.

## Gotchas

- This is explicitly a partial-archive scenario, not the all-empty case #901 already fixed — don't conflate the two when tracing the existing gate condition.

## Original request

Calibration read-out: partial archive retention causes silent gaps in row telemetry

**Related:** #901

Context: #901's aggregate() only synthesizes stub runs from TSV rows when the archive dir is entirely empty — a partially-pruned archive (older run dirs archived-then-deleted while wrap-up-outcomes.tsv persists) leaves matching TSV rows permanently and silently stuck at "no runs in window."

Scope: Synthesize stub runs for any TSV runId missing an archived dir (not just the all-empty case), or document the retention-mismatch limit explicitly in the report legend. Found during #901 Task 2 review (2026-08-18).

