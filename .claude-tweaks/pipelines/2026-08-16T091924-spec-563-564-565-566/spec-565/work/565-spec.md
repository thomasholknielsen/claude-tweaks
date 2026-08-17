---
record: 565
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 565: backlog overview menu: dedicated options for the fallback ladder's grant rung and the empty-backlog terminal case

**Related:** #512

Surface: backend

## Current State

`skills/backlog/SKILL.md`'s `## Next Actions` block, `**After `overview`:**` (main tip, PR #523, commit `fb373180`, ~line 74), documents the menu's `(Recommended)`-MUST rule and resolves it through overview-mode.md's 3-level precedence (Step 4's "Precedence (3-level)" list, `skills/backlog/overview-mode.md` ~line 360): needs-you first, then the top executable Dispatch entry, then — when the Dispatch block has no executable entry — "the existing fallback ladder (grant → specify → refine, ties by id; `Next: backlog is empty` terminal case)".

The current option list under that block only covers two of the three ladder rungs:

- Option 3 — `"Refine the labels"` → covers the **refine** rung
- Option 4 — `"Shape the top priority record"` → covers the **specify** rung
- No option covers the **grant** rung, and no option (or explicit non-question fallback) covers the `Next: backlog is empty` terminal case.

Line 74 carries a live parenthetical flagging exactly this: `(Known gap: at the fallback ladder's grant rung and the `backlog is empty` terminal case, no dedicated menu option exists yet — tracked as a follow-up record; the options below don't change until that lands.)` — this record is that follow-up.

The block also already has a documented escape hatch for the analogous single-option case (~line 82): "If situational filtering leaves only one option ... state or execute it directly instead of calling `AskUserQuestion`" — a natural pattern to extend to the zero-option case.

## Deliverables

Edit `skills/backlog/SKILL.md`'s `**After `overview`:**` `## Next Actions` block only:

1. Add a new dedicated option for the fallback ladder's **grant** rung — rendered only when that rung is what the report's `Next:` line names (i.e. no needs-you, no executable Dispatch entry, and the top candidate is a `ready`-but-ungranted record):
   - `label`: `"Grant the top ready record"`
   - `description`: `"/claude-tweaks:backlog grant — mechanically sweep the top-ranked ready-but-ungranted record's gate chain (headless; no per-record confirmation)"`
   - omitted whenever the grant rung isn't what `Next:` names
   Insert it after the existing "Shape the top priority record" option and renumber the trailing named-lens option accordingly (currently Option 5 → becomes Option 6); numbering is prose-only, not a stored id, so renumbering carries no other cost.
2. Extend the existing single-option collapse rule (~line 82) to also cover the **zero-option** case — the true `Next: backlog is empty` terminal (no needs-you, no executable Dispatch entry, nothing to grant, shape, or refine): skip the `AskUserQuestion` call entirely and state the terminal message directly instead of rendering an empty or single-forced-option menu.
3. Remove the now-resolved `(Known gap: ...)` parenthetical from line 74's precedence description.
4. No changes to `skills/backlog/overview-mode.md` — its Step 4 precedence/ladder text and the `(Recommended)`-MUST rule are already correct; only the SKILL.md menu enumeration was incomplete.

## Acceptance Criteria

- `skills/backlog/SKILL.md`'s "After `overview`" Next Actions block has a menu option matching the fallback ladder's grant rung, correctly omitted when that rung doesn't apply.
- The same block has an explicit zero-option path for the `backlog is empty` terminal case that skips `AskUserQuestion` and states the terminal message directly, mirroring the existing single-option escape hatch.
- The `(Known gap: ...)` parenthetical is removed since the gap it names is now closed.
- Any existing test that pins the overview Next Actions option list/count (grep `tests/` for the skill file path or `"After overview"`/`Next Actions` fixtures before writing, per this project's argument-hint/reference-card drift precedent) is updated to match the new option and the zero-option branch; if none exists, no new test is required — this is prose-only, LLM-rendered menu content, not code under `bin/`.
- `overview-mode.md` is unchanged — the ladder's actual computation (which rung applies) is unaffected; this is a menu-rendering fix only.

## Technical Approach

Single-file prose edit to `skills/backlog/SKILL.md`, in the block starting `**After `overview`:**` (~lines 74-82 at commit `fb373180`). Insert the new grant-rung option between the existing "Shape the top priority record" (specify rung) and the named-lens option, using the same `label`/`description`/omission-condition shape as the sibling options in that block. Extend the single-option collapse sentence immediately below the option list to name the zero-option case alongside the existing one-option case, with its own terminal message (e.g. `Backlog is empty — nothing to build, grant, shape, or refine.`) rather than inventing a new mechanism. Drop the "(Known gap: ...)" clause from the precedence sentence once the fix lands, since the block it warns about no longer under-covers the ladder.

## Gotchas

- Local checkouts of this repo can lag `origin/main` (observed live while shaping this record: this checkout's `main` was one commit — `fb373180`, PR #523, the funnel-header/precedence work this record's option list depends on — behind `origin/main`, `git fetch` + fast-forward required before the block's actual current line numbers/content could be trusted). Whoever builds this should re-verify current line numbers against a freshly-fetched `main` rather than trusting this record's cited line numbers verbatim.
- The grant-rung option's action (`/claude-tweaks:backlog grant`) is a headless sweep, not a per-record grant — it mirrors the mode's own documented headless-unit shape (`SKILL.md`'s `grant` mode section) rather than inventing a per-record grant flow inside the `overview` menu.
- Renumbering the named-lens option (Option 5 → Option 6) is cosmetic; don't treat it as a behavior change worth flagging separately in review.

## Original request

backlog overview menu: dedicated options for the fallback ladder's grant rung and the empty-backlog terminal case

## Overview

The backlog overview menu's `(Recommended)`-MUST rule says the option matching the report's closing `Next:` line carries the recommendation at every precedence level — but at the fallback ladder's grant rung (action: `/claude-tweaks:backlog grant`) and the literal `Next: backlog is empty` terminal case, no dedicated menu option exists to match. Pre-existing from #515; #516 strengthened the MUST and noted the gap in `skills/backlog/SKILL.md` ("Known gap" parenthetical).

## Suggested shape

A product/design decision on menu shape: either add a grant-rung option (and an empty-backlog option or an explicit MUST carve-out for the terminal case), or relax the MUST at those two rungs. Flagged by #516's final review as follow-up-record material rather than an in-branch fix.

**Origin:** ledger resolve gate, run 2026-08-16T010024-spec-513-514-515-516 (item 4, #516's final review Minor 16), auto-routed per ledgerRouteRemainder and approved at the consolidated Review Console.

**Files:** skills/backlog/SKILL.md, skills/backlog/overview-mode.md
