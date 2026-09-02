---
record: 766
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 766: backlog overview: needsYou overlay ignores isParentIssue — parent still surfaces with /specify launcher

Defer-reason: tangential

## Current State

`funnelBuckets` (bin/lib/issues/backlog.js)'s needsYou overlay loop skips `f.bot.inProgress`, `f.stage === 'parked'`, and `f.notPlanned === true` before checking `needsDefinition`/`solutionUnjustified`, but does not skip `f.isParentIssue`. A decomposition parent carrying `needs:definition` or `solution:unjustified` therefore still appears in the `└─ needs you:` branch line and the `── Needs you ──` section, whose launcher line for a `kind: 'definition'` entry is `/claude-tweaks:specify #N` (skills/backlog/overview-mode.md's Needs-you section) — the same parent-pointed-at-/specify misroute #616 excluded from the buildable/scored stage buckets, reappearing on this one overlay surface. Flagged by #616's final whole-branch review as a residual gap in the same defect class, deliberately not folded into that fast-lane fix — the spec's Acceptance Criteria named the paste block only, not the needs-you overlay, and the overlay's skip-list is a separate, independently-reviewable surface. Latent today: zero overlap on the live open set as of 2026-08-17.

## Deliverables

- `funnelBuckets`'s needsYou overlay loop (bin/lib/issues/backlog.js) adds `f.isParentIssue` to its skip condition, alongside the existing bot-in-progress/parked/notPlanned checks.
- A discriminating test in tests/bin-lib/issues/backlog.test.js: a parent record carrying `needsDefinition: true` (or `solutionUnjustified: true`) does not appear in `needsYou`.
- Verify `skills/backlog/overview-mode.md`'s Needs-you section rendering rules need no separate change (the exclusion happens at the `funnelBuckets` source, same pattern as #616's own Shape-block verification) — confirm by inspection, don't assume.

## Acceptance Criteria

- A parent record (`facets.isParentIssue === true`) carrying `needsDefinition: true` or `solutionUnjustified: true` is excluded from `funnelBuckets`'s `needsYou` array.
- `node --test tests/bin-lib/issues/` passes, including a new discriminating test that fails on the pre-fix implementation.
- No `/claude-tweaks:specify #{N}` launcher line in the Needs-you section ever names a parent record.

_Filed by `capture` via specShapedBody._
