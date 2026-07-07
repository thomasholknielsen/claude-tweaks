---
tier: 3
status: not-started
progress: 0
blocked-by: [5]
surface: backend
---

# 06: AskUserQuestion adoption — Lifecycle A (init, capture, challenge)

## Overview

Applies the canonical `AskUserQuestion` convention (established in Spec 05) to the `init`, `capture`, and `challenge` skills — the first three steps of the plugin's lifecycle pipeline. Each skill's own copy of the "Interaction style" directive gets the new wording, and every genuine inline decision, batch table, and `## Next Actions` block within these 5 files converts from plain-text numbered lists to `AskUserQuestion` calls.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Any other skill family (Lifecycle B/C, Component, Utility) — those are sibling specs 07-12, blocked on the same Spec 05 foundation but otherwise independent.
- Redefining the canonical directive wording or the Pattern A/B/C definitions — Spec 05 owns that; this spec only applies it verbatim.
- Redesigning `ledger/resolve-gate.md`'s per-item vocabulary or any batch-table site outside this spec's 5 files.
- Changing any `auto`-mode branch — every conversion below is scoped to the interactive-mode presentation only.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 5 | AskUserQuestion adoption — Foundation | not-started |

## Current State

- `skills/init/SKILL.md` — line 5: Interaction style directive (boilerplate). Lines 130-137: "Scope Selection Gate" 4-option inline decision. Lines 141-147: per-phase "Continue to Phase N+1?" 3-option inline decision template (rendered once per phase in Interactive mode, same template each time). Lines 372-383: `## Next Actions` — a signal-to-recommendation lookup table, not a flat list: the top row whose signal matches becomes the recommended option, plus two "Always (any state)" rows that render every time.
- `skills/init/docs-structure.md` — lines 199-216: "Present batch" — a Doc/Status/Assessment/Auto-detect/Action batch table followed by a 2-option terminal decision (`1. Apply all **(Recommended)**` / `2. Override specific items`). Lines 282-291 ("Update Mode") reference the same batch format, no separate site.
- `skills/init/profile-templates.md` — lines 58-65: Initial Mode "Does this profile look accurate?" 3-option inline decision. Lines 85-99: Update Mode Contract Drift batch table + 3-option terminal decision (`1. Apply all contract patches` / `2. Choose per-item` / `3. Skip`). Line 138: Update Mode Stale/Drifted/Gaps batch — currently an **open-ended** prompt ("Which items should I fix? All stale + drifted? Specific ones?") with no enumerated options in the template, presented after a second, separate batch table (per line 99's "Sequencing" note — Contract Drift batch first, Stale/Drifted/Gaps batch second). Lines 169-177: Phase 4 Skill Manifest 4-option inline decision.
- `skills/capture/SKILL.md` — line 5: Interaction style directive. Lines 102-110: Routing prompt, a 4-option inline decision where option 4 is conditionally omitted (only shown when a matching spec exists). Lines 131-138: `## Next Actions`, 4 pre-filled options, omitted entirely when `$PIPELINE_RUN_DIR` is set (Component-Skill Contract).
- `skills/challenge/SKILL.md` — line 5: Interaction style directive. No inline numbered decision inside the skill body (Listen/Reflect-back are open dialogue steps, not enumerated choices — verified by reading the full file). Lines 258-264: `## Next Actions`, 3 options, omitted when `$PIPELINE_RUN_DIR` is set.

## Deliverables

- [ ] Replace the Interaction style directive blockquote in `init/SKILL.md`, `capture/SKILL.md`, and `challenge/SKILL.md` (one line each) with Spec 05's canonical wording.
- [ ] Convert `init/SKILL.md`'s "Scope Selection Gate" (lines 130-137) to one `AskUserQuestion` call: 4 options (Auto/Interactive/Essentials/Done), "Auto" labeled `(Recommended)`.
- [ ] Convert `init/SKILL.md`'s per-phase "Continue to Phase N+1?" template (lines 141-147) to an `AskUserQuestion` call template: 3 options (Continue/Skip/Done), "Continue" labeled `(Recommended)`. Since this is a template re-rendered once per phase (not a single static site), document the conversion as a template the skill re-issues each time Option 2 (Interactive) is active.
- [ ] Convert `init/SKILL.md`'s `## Next Actions` (lines 372-383) to one `AskUserQuestion` call: resolve the signal-to-recommendation table to find the one matching recommended row, then present exactly 3 options — the resolved recommendation (labeled `(Recommended)`), `/claude-tweaks:specify {first feature topic}`, and `/claude-tweaks:tidy` (the two "Always" rows). The four signal rows are not exhaustive over every possible post-init state (e.g. Update Mode completing normally with zero drift and no INBOX writes matches none of them) — add a fallback row, `/claude-tweaks:help` labeled `(Recommended)`, used whenever no signal row matches, so the call always has a defined recommended option.
- [ ] Convert `init/docs-structure.md`'s "Present batch" (lines 199-216) per Pattern B: the Doc/Status/Assessment/Auto-detect/Action table stays as markdown; the terminal decision (`Apply all` / `Override specific items`) becomes one `AskUserQuestion` call with those 2 options.
- [ ] Convert `init/profile-templates.md`'s "Does this profile look accurate?" (lines 58-65) to one `AskUserQuestion` call: 3 options (Looks good/Needs corrections/Missing context).
- [ ] Convert `init/profile-templates.md`'s Contract Drift terminal decision (lines 96-97) to one `AskUserQuestion` call: 3 options (Apply all contract patches/Choose per-item/Skip).
- [ ] Convert `init/profile-templates.md`'s Stale/Drifted/Gaps prompt (line 138) from its current open-ended free-text question to an explicit `AskUserQuestion` call with 3 options: `Apply all recommended fixes **(Recommended)**`, `Override specific items`, `Skip — review later`. This is a genuine behavior addition (the template currently has no enumerated options here) — not a straight port, since there's nothing to port from; document this explicitly as a new-but-consistent option set matching the sibling "Apply all / override" pattern used two sections earlier in the same file.
- [ ] Convert `init/profile-templates.md`'s Phase 4 Skill Manifest prompt (lines 169-177) to one `AskUserQuestion` call: 4 options (All P1/All P1+P2/pick specific/None).
- [ ] Convert `capture/SKILL.md`'s Routing prompt (lines 102-110) to one `AskUserQuestion` call: 4 options, with option 4 ("Merge into spec {N}") included only when the Component-Skill Contract's visibility condition (line 112: a matching spec exists) is true — when false, the call has 3 options, not 4 with a placeholder.
- [ ] Convert `capture/SKILL.md`'s `## Next Actions` (lines 131-138) to one `AskUserQuestion` call: 4 options, "capture another idea" labeled `(Recommended)`. Preserve the existing Component-Skill Contract gating (omit entirely, i.e. skip the call, when `$PIPELINE_RUN_DIR` is set).
- [ ] Convert `challenge/SKILL.md`'s `## Next Actions` (lines 258-264) to one `AskUserQuestion` call: 3 options, "brainstorming" labeled `(Recommended)`. Preserve the same Component-Skill Contract gating.

## Acceptance Criteria

1. `grep -c "AskUserQuestion" skills/init/SKILL.md` returns at least 4 (directive + Scope Selection Gate + per-phase template + Next Actions).
2. `grep "present numbered options and wait\|reply with just a number"` returns no match in any of the 5 files (old directive language fully replaced).
3. `init/docs-structure.md`'s batch-table section still contains the literal markdown table header `| # | Doc | Status | Assessment | Auto-detect | Action |` (table display unchanged) but no longer contains the literal string `1. Apply all **(Recommended)**` as plain prose (it's now inside an `AskUserQuestion` call description, not a rendered numbered list).
4. `init/profile-templates.md` line ~138's prompt no longer reads as a bare question with no options — grepping for `AskUserQuestion` in the surrounding ~10 lines returns a match, and the file states exactly 3 options for it (Apply all / Override / Skip).
5. `capture/SKILL.md`'s Routing prompt documents the conditional 4th option using the same visibility rule already stated at line 112 (only when a matching spec exists) — the `AskUserQuestion` call construction is explicitly described as building 3 or 4 options depending on that check, not silently defaulting to 4.
6. `capture/SKILL.md` and `challenge/SKILL.md`'s Next Actions conversions both explicitly preserve the sentence "omit the block" / "omit this block" behavior when `$PIPELINE_RUN_DIR` is set — grepping either file for `PIPELINE_RUN_DIR` still returns the existing Component-Skill Contract paragraph, unmodified in meaning.
7. None of the 5 files' Anti-Patterns, Relationship to Other Skills, or Component-Skill Contract sections change in substance — only the Interaction style directive and the specific decision-point sections listed in Deliverables change.

## Technical Approach

Documentation/skill-content change only — no data model or API surface.

### Key Files

- `skills/init/SKILL.md` — directive line, Scope Selection Gate, per-phase template, Next Actions
- `skills/init/docs-structure.md` — batch-table terminal decision
- `skills/init/profile-templates.md` — 4 decision sites (Stack Profile confirm, Contract Drift, Stale/Drifted/Gaps, Skill Manifest)
- `skills/capture/SKILL.md` — directive line, Routing prompt, Next Actions
- `skills/challenge/SKILL.md` — directive line, Next Actions

### Package Dependencies

None.

## Gotchas

- `init/SKILL.md`'s per-phase "Continue?" prompt (Deliverable 3) is a template, re-issued once per phase during Option 2 (Interactive) — do not collapse it into a single static `AskUserQuestion` call; the conversion changes the *rendering mechanism* for each occurrence, not the number of occurrences.
- `init/SKILL.md`'s Next Actions (Deliverable 4) requires resolving the signal-to-recommendation table to ONE recommended row before building the `AskUserQuestion` call — do not present all signal rows as options; only the first matching row (top-to-bottom) plus the two "Always" rows. The four signal rows don't cover every possible state; when none match, use the fallback row (`/claude-tweaks:help`, labeled Recommended) rather than leaving the call without a defined recommended option.
- `init/profile-templates.md` line 138 (Deliverable 8) has no existing numbered options to port — this is the one site in this spec's scope where the conversion adds a new fixed option set rather than reformatting an existing one. Keep the added vocabulary consistent with the sibling Contract Drift decision two sections earlier in the same file (`Apply all` / per-item override / `Skip`) rather than inventing new phrasing.
- `capture/SKILL.md`'s Routing prompt option 4 visibility (Deliverable 10) is conditional — read the existing "Option 4 visibility" callout at line 112 before writing the `AskUserQuestion` construction logic; don't always include a 4th option with a placeholder value.
- Per Spec 05, `AskUserQuestion` is never used in `auto` mode. `init/SKILL.md`'s Scope Selection Gate is explicitly called out (line 128) as "Not silenced by auto" — it still always renders in interactive mode; this spec only changes how it renders, not when.

## Manual Steps

None — pure documentation/skill-content edit.
