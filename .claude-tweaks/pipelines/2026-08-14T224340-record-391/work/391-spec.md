---
record: 391
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---

# 391: Delete audit residue: stale docs/plans ledgers, closed integration review, plan data dump

Surface: backend

## Current State

Three residue groups found by the 2026-08-14 bloat audit: (1) 8 stale wrap-up ledgers under `docs/plans/` dated 2026-08-09→08-14, plus `2026-08-09-262-sweep-classification.md` (178 lines) and a 2026-07-08 brief that is not a ledger — `skills/wrap-up/cleanup-procedures.md` says ledgers are deleted at wrap-up, so these evidence a leaking cleanup path; (2) `docs/github-issues-integration-review.md` (~90 lines / 15KB), a dated, closed 2026-07-11 audit of the pre-unification issue system, referenced only by `docs/REGISTRY.md:18`, `docs/getting-started.md:108`, and the diagram below; (3) `docs/diagrams/github-issues-lifecycle.html` (692 lines / 41KB) — linked from getting-started as an architecture overview but read by no skill (`/visualize` reserves `docs/diagrams/record-graph.html` only).

## Deliverables

- Delete the stale `docs/plans/` ledgers, the sweep-classification file, and the 2026-07-08 brief — after verifying none is referenced by a non-terminal run under `.claude-tweaks/pipelines/`.
- Delete `docs/github-issues-integration-review.md` and `docs/diagrams/github-issues-lifecycle.html` together, with the 3 link edits (the `REGISTRY.md` row, `getting-started.md:108`, the diagram cross-link).
- Record the leak observation as a comment on this issue: which wrap-up runs left these 8 ledgers behind, so a future record can target the cleanup path if a real defect is confirmed.

## Acceptance Criteria

- `ls docs/plans/*-ledger.md` returns nothing — the cleanup contract's own stated invariant.
- No file under `docs/` references either deleted doc (grep output shown).
- `REGISTRY.md` and `getting-started.md` contain no dead links.

## Technical Approach

Pure deletions plus 3 link edits, one commit. Check `.claude-tweaks/pipelines/` run states before deleting any ledger — an interrupted run's ledger is live state, not residue (three non-terminal runs existed at audit time).

## Gotchas

- `docs/plans/` vs `docs/superpowers/plans/` near-collision — match exact paths; #390 owns the other directory.
- `getting-started.md` is adopter-facing; replace the architecture-overview link with a sentence of prose or drop the paragraph — don't leave a stub.

## Original request

Delete audit residue: stale docs/plans ledgers, closed integration review, plan data dump

**Related:** none

Context: Bloat audit: 8 stale wrap-up ledgers under docs/plans/ (the cleanup contract says these are deleted at wrap-up — the leak itself is worth a note), docs/github-issues-integration-review.md is a closed 2026-07-11 audit of a pre-unification system, and 2026-07-20-fix-review-findings-data.json is a 155KB machine-generated dump.

Scope: delete all three groups; 3 link edits (REGISTRY, getting-started, diagram cross-link); decide whether the orphaned github-issues-lifecycle.html goes too.
