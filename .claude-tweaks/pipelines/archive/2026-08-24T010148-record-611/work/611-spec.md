---
record: 611
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 611: specify decomposition-mode.md (30 KB) exceeds the Bash output ceiling — split at the Step 4/5 boundary and pin sub-file sizes

Surface: backend

**Related:** none

## Current State

Loading `decomposition-mode.md` (30 KB) cost 4 tool calls (cat → persisted-output; cat of the persisted file re-truncated identically; then 2 Read slices). `record-creation.md` (29.5 KB) and `spec-template.md` needed 3 slices each. Session-evaluation finding, Context overhead lens; `/specify`'s three always-loaded files total ~79 KB — each lazy-loaded sub-file exceeding the Bash output ceiling costs multiple extra tool calls just to read it once.

## Deliverables

- Split `decomposition-mode.md` at the Step 4/5 boundary (Steps 1-4 in one file, Steps 5-9 in another) so no lazy-loaded sub-file exceeds ~20 KB — keep step numbering unchanged across the split.
- Add a per-sub-file byte pin to the skill-conformance suite beside the existing `SKILL.md` ceiling check, so a future addition regresses loudly instead of silently re-crossing the Bash output ceiling.
- Note the persisted-output re-truncation (the second `cat` truncating identically to the first) as a harness defect in the record's own trail — it is not this record's fix.

## Acceptance Criteria

- `decomposition-mode.md` no longer exists as a single 30 KB file; its Steps 1-4 and Steps 5-9 live in two sub-files, each readable in one `Read`/`cat` call.
- Every cross-reference naming a step by number in `SKILL.md` or elsewhere still resolves correctly after the split.
- The skill-conformance suite fails if either new sub-file (or any other `/specify` lazy-loaded sub-file) exceeds ~20 KB.

## Technical Approach

Split at the Step 4/5 seam identified as natural in the record's own context — Steps 1-4 (through Step 2.5's design pre-steps and Step 3's record creation) in one file, Steps 5-9 (red-team through completion) in the other. `SKILL.md`'s existing "Read `decomposition-mode.md` ... Steps 1 through 9" pointer needs updating to name both files. Step numbering itself stays unchanged so no other cross-reference in the repo needs touching.

## Gotchas

- Keep step numbering identical across the split — cross-references naming a step by number elsewhere in the repo must keep resolving without a sweep.
- The persisted-output re-truncation observed while loading this file is a harness defect, not something this record's split can fix — note it, don't attempt to work around it.

## Original request

specify decomposition-mode.md (30 KB) exceeds the Bash output ceiling — split at the Step 4/5 boundary and pin sub-file sizes

**Related:** none

Context: Loading decomposition-mode.md cost 4 tool calls (cat → persisted-output; cat of the persisted file re-truncated identically; then 2 Read slices). record-creation.md (29.5 KB) and spec-template.md needed 3 slices each. Session-evaluation finding, Context overhead lens; /specify's three always-loaded files total ~79 KB.

Scope: split decomposition-mode.md so no lazy-loaded sub-file exceeds ~20 KB (Steps 1–4 / Steps 5–9 is the natural seam), keep step numbering, add a per-sub-file byte pin to the skill-conformance suite beside the SKILL.md ceiling check. The persisted-output re-truncation is a harness defect — note it, not ours to fix.

