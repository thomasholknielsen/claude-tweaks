---
record: 849
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build]
---
# 849: Declined-learning fingerprint store shared by /feedback session evaluation and /wrap-up curation

Origin: agent-held deferral from the transcript-judge extraction design (docs/superpowers/specs/2026-08-17-transcript-judge-extraction-design.md), which scoped it out as separable infrastructure

Defer-reason: genuinely-larger

## Current State

`skills/feedback/session-evaluation.md`'s watermark payload declares `dismissedFingerprints` as "an empty array today, not an invented data source" — nothing tracks findings a human declined at `/feedback` Step 7, so a later evaluation can re-surface them for re-declining. `/wrap-up` has the same gap on its side: a reflection insight resolved "don't capture" (with a stated reason) leaves no durable trace, so an equivalent insight re-surfaces on a later run and must be re-declined by hand. Both pipelines already compute content fingerprints at filing time (`bin/lib/health-core/fingerprint.js`), but nothing records the declined ones.

## Deliverables

One shared, project-local declined-learning store (under `.claude-tweaks/`, degrade-open cache semantics like `bin/lib/feedback/watermark.js`) recording `{fingerprint, declinedAt, reason, source}` for findings/insights a human explicitly declined. `/feedback`'s Step 7 decline path writes to it, and its watermark write populates `dismissedFingerprints` from it instead of the hardcoded empty array. `/wrap-up`'s reflect insight resolution and curation-row dedup consult it before staging: a previously-declined match surfaces as an annotation ("previously declined {date}: {reason}") rather than a fresh bare proposal — annotated, never silently suppressed, so the human keeps the override.

## Acceptance Criteria

- Declining a finding at `/feedback` Step 7 records its fingerprint; the next bare `/feedback` run's offset clause carries it in `dismissedFingerprints` and the judge omits findings it covers.
- A wrap-up reflection insight matching a declined fingerprint renders with its prior-decline annotation instead of as a fresh proposal; approving it anyway clears the entry.
- Store module has unit tests covering write, read, corrupt-file degrade-open, and the annotation lookup.
- `docs/skill-graph.md` gains the new edges; no consumer restates the store's mechanics.

_Filed by `capture` via specShapedBody._
