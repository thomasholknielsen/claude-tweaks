---
record: 33
origin: capture
risk: low
effort: low
ceremony: fast-lane
grants: []
surface: backend
---
# 33: /claude-tweaks:design has a pre-existing Component-vs-Utility categorization mismatch

Surface: backend

## Current State

`skills/help/reference-card.md:43` lists `/claude-tweaks:design-wrapper` (renamed from `/claude-tweaks:design` in v6.10.0) in its `## Utility` table (the table spans lines 32-53). `CLAUDE.md`'s skill-directory listing (`**Component:** reflect, simplify, deepen, journeys, visual-review, design-wrapper, visualize, assess-agent-autonomy`) and `README.md`'s section placement both file it under Component — `reference-card.md` is the one file out of the three that disagrees. `/claude-tweaks:design-wrapper` is never invoked directly by a human, only ever called by lifecycle skills (`/test`, `/review`, `/build`, `/specify`, `/flow`, `/visual-review`) — the same category as `/simplify`, `/deepen`, `/reflect`, `/assess-agent-autonomy`, all of which sit in `reference-card.md`'s own `## Component` table (lines 20-31).

## Deliverables

- [ ] Move the `/claude-tweaks:design-wrapper` row from `reference-card.md`'s `## Utility` table into its `## Component` table.

## Acceptance Criteria

1. `skills/help/reference-card.md`'s `## Component` table (currently lines 20-31) includes the `/claude-tweaks:design-wrapper` row, and the `## Utility` table no longer does.
2. `CLAUDE.md`, `README.md`, and `reference-card.md` all agree on the Component categorization for `/claude-tweaks:design-wrapper` — `grep -rn "design-wrapper" skills/help/reference-card.md` shows it appearing only in the Component table's row plus any prose mentions (e.g. the Impeccable companion-tool row), never in the Utility table.

## Technical Approach

Single-row move within one markdown file's table structure — no other file needs changes since `CLAUDE.md` and `README.md` already have it right. No renumbering or reflow needed beyond the row relocation itself.

### Key Files

- `skills/help/reference-card.md` — move the `/claude-tweaks:design-wrapper` row (line 43) from the `## Utility` table to the `## Component` table (lines 20-31)

## Gotchas

- Per this project's own recorded lesson (CLAUDE.md), a stale cross-skill categorization/relationship fact can recur in more than one non-adjacent place in the same file — `grep -n "design-wrapper" skills/help/reference-card.md` after the move to confirm no other table or list in the file still places it under Utility (the only other occurrence found at shaping time was the Impeccable companion-tool prose row at line 60, which is correctly file-agnostic and needs no change).

## Original request

/claude-tweaks:design has a pre-existing Component-vs-Utility categorization mismatch

**Related:** none

Context: found during the assess-agent-autonomy whole-branch review while checking a similar categorization question for the new skill. CLAUDE.md's skill-directory listing and README.md's section placement both file /claude-tweaks:design under Component, but skills/help/reference-card.md files it under the Utility table -- the one file out of the three that disagrees.

Scope: move the reference-card.md row into its Component table, matching the other two files and the semantic definition (never invoked directly by a human, only ever called by lifecycle skills -- same category as /simplify, /deepen, /reflect, /assess-agent-autonomy). Small, single-file, single-row move.
