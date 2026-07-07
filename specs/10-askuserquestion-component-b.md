---
tier: 3
status: complete
progress: 100
blocked-by: [5]
surface: backend
---

# 10: AskUserQuestion adoption — Component skills, batch B

## Overview

Converts the plain-text numbered-option convention to `AskUserQuestion` across `/claude-tweaks:journeys`, `/claude-tweaks:visual-review` (SKILL.md + `browser-review.md` + `discover-mode.md`), and `/claude-tweaks:design` — the second of two Component-skill batches in the AskUserQuestion adoption initiative (batch A covers reflect/simplify/deepen in spec 09). Each skill's own duplicated copy of the Interaction style directive is replaced with the canonical wording from spec 05, and each skill's genuine inline decisions, batch-table terminal decisions, and `## Next Actions` blocks are converted per Patterns A/B/C.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Any other skill family (Lifecycle skills are specs 06-08; Component batch A — reflect, simplify, deepen — is spec 09; Utility skills are specs 11-12).
- Rewriting or redesigning the canonical directive text itself — that's spec 05's job; this spec only copies it verbatim into each of the 5 target files' own frontmatter blockquote.
- Introducing `AskUserQuestion`'s `preview` field anywhere. `/design` and `/visual-review` are the most plausible future home for a preview-field use (visual mockup/diff comparisons), per the original design doc's "Out of scope" section, but no site converted in this spec uses it — see Open Questions for the one site (`discover-mode.md` Phase 2) that doesn't fit `AskUserQuestion` at all and is explicitly left as prose.
- Resolving the pre-existing content drift between `visual-review/SKILL.md` Step 2 and `visual-review/browser-review.md`'s "Ensure the app is running" section (documented in Open Questions below) beyond flagging it — that's a behavioral judgment call for Step 6 Self-Review or the user, not a mechanical conversion decision.
- Changes to `_shared/dev-url-detection.md`, `_shared/browser-detection.md`, or any other `_shared/` file — those are spec 05's or other specs' scope.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 5 | AskUserQuestion adoption — Foundation | not-started |

## Current State

- `skills/journeys/SKILL.md` line 5 — Interaction style directive (boilerplate, identical to every other skill's copy). Lines 169-179 — `## Next Actions` block, rendered only when invoked directly (not by a parent skill per the Component-Skill Contract at lines 181-183): 3 numbered options (`/claude-tweaks:stories` Recommended, `/claude-tweaks:visual-review journey:{name}`, `/claude-tweaks:test {spec}`).
- `skills/visual-review/SKILL.md` line 5 — directive boilerplate. Lines 122-129 — Step 2 "Dev URL Resolution," **Interactive mode** block: a literal 3-option numbered list (start dev server / try different URL / wait) shown only when `dev-url-detection.md`'s Step 3 yields no reachable `APP_URL`. Lines 180-191 — `## Next Actions` block: 4 numbered options (`/claude-tweaks:review {spec} full` Recommended, `/claude-tweaks:visual-review journey:{name}`, `/claude-tweaks:stories`, `/claude-tweaks:capture {idea}`), rendered only when invoked directly (Component-Skill Contract at lines 193-195).
- `skills/visual-review/browser-review.md` lines 39-49 — "Ensure the app is running" section: a literal 2-option numbered list (try different URL / wait for user to start server), explicitly stating "Do NOT attempt to start the dev server yourself." Lines 406-424 — Step 6 "Report & Route" → "Findings & Ideas" batch table (`# | Finding | Type | Source | Severity/Impact | Recommended`) followed by a 2-option terminal decision (`1. Apply all recommendations **(Recommended)**` / `2. Override specific items`). Lines 460-469 — a mode-specific "Next Actions" table (signal → option) that "supplements the canonical handoff in SKILL.md `## Next Actions`" rather than rendering as its own separate block.
- `skills/visual-review/discover-mode.md` lines 41-65 — Phase 2 "Journey Candidates": presents a dynamically-sized (N, unbounded) list of candidate journeys and states "Proceeding to walk all {N} journeys in the browser. Say 'skip {numbers}' to exclude any" — the skill does not wait for a reply before proceeding; exclusion is an opt-out via free text, not a blocking choice. Lines 118-134 — "Journey Discovery Report" (Journeys Created / Pages Not Covered / Gaps Identified) — an always-rendered summary template, not a decision site, and NOT part of the Pattern B conversion below (an earlier draft of this spec incorrectly cited this range as "the table that stays markdown"). Lines 140-144 — the real Phase 5 `| # | Gap | Recommended |` batch table. Lines 146-147 — its 2-option terminal decision, the same shape as `browser-review.md`'s. Lines 154-159 — "Next Actions (discover mode)": a 2-option block that explicitly "render[s] ... in place of the canonical SKILL.md `## Next Actions`" when reporting discover-mode results.
- `skills/design/SKILL.md` line 5 — directive boilerplate. Lines 179-203 — `## Next Actions` block: a "Return → Recommended follow-up" lookup table (12 rows, keyed by the wrapper's return shape) followed by "Standard numbered options to present (pick by return shape from the table above, mark one **(Recommended)**)" — 4 numbered options, rendered only when invoked directly by a user (Component-Skill Contract at lines 205-207).

## Deliverables

- [x] `skills/journeys/SKILL.md`: replace line 5's directive with the canonical text from spec 05. Convert the `## Next Actions` block (lines 169-179) to one `AskUserQuestion` call.
- [x] `skills/visual-review/SKILL.md`: replace line 5's directive with the canonical text from spec 05. Convert the Step 2 interactive-mode 3-option list (lines 124-129) to one `AskUserQuestion` call. Convert the `## Next Actions` block (lines 180-191) to one `AskUserQuestion` call.
- [x] `skills/visual-review/browser-review.md`: convert the "Ensure the app is running" 2-option list (lines 43-47) to one `AskUserQuestion` call. Convert the Step 6 batch-table terminal decision (lines 422-424) to one `AskUserQuestion` call (the table itself, lines 411-421, stays as markdown per Pattern B). Convert its own "Next Actions" table (lines 462-469) to its own independent `AskUserQuestion` call, resolved dynamically from that table's signal column exactly as `design/SKILL.md`'s Return-shape table resolves — this call renders *instead of* SKILL.md's canonical Next Actions call when this file's conditions (full review mode / code-review status / pending fixes / standalone) apply, not alongside it. Keep the existing sentence stating it "supplements the canonical handoff" but clarify in-place that "supplements" means *substitutes when more specific*, not *merges option sets* — the table's own options (including `/claude-tweaks:wrap-up {N}`, which is not one of SKILL.md's 4) are the ones that render.
- [x] `skills/visual-review/discover-mode.md`: convert the Phase 5 batch-table terminal decision (lines 146-147) to one `AskUserQuestion` call (the table, lines 140-144, stays as markdown). The unrelated "Journey Discovery Report" template (lines 118-134) is untouched — it is not part of this conversion. Convert "Next Actions (discover mode)" (lines 154-159) to one `AskUserQuestion` call. Leave Phase 2's candidate-journey list (lines 41-65) as prose — add a one-line note explaining why (see Gotchas).
- [x] `skills/design/SKILL.md`: replace line 5's directive with the canonical text from spec 05. Convert the `## Next Actions` block (lines 179-203) to one `AskUserQuestion` call whose options are selected dynamically from the Return-shape lookup table, same dynamic-selection shape as `build/SKILL.md`'s signal-to-option lookup (see spec 05's browser-detection worked example for the single-call convention).

## Acceptance Criteria

1. Grepping `skills/journeys/SKILL.md`, `skills/visual-review/SKILL.md`, and `skills/design/SKILL.md` for the literal string "reply with just a number" returns no match after the change.
2. `skills/journeys/SKILL.md`'s `## Next Actions` section instructs calling `AskUserQuestion` with 3 options carrying the same label text as the current numbered list (stories / visual-review journey / test), one labeled with `(Recommended)`, and states the block is omitted entirely when `$PIPELINE_RUN_DIR` is set (Component-Skill Contract unchanged).
3. `skills/visual-review/SKILL.md`'s Step 2 section instructs calling `AskUserQuestion` with exactly 3 options (start dev server / try different URL / wait) when triggered, preserving the existing constraint that starting the server requires this explicit interactive choice (not auto-authorized, unlike auto mode's ephemeral-server behavior described in the same step).
4. `skills/visual-review/SKILL.md`'s `## Next Actions` section instructs calling `AskUserQuestion` with 4 options matching the current list, first labeled `(Recommended)`.
5. `skills/visual-review/browser-review.md`'s "Ensure the app is running" section instructs calling `AskUserQuestion` with exactly 2 options (try different URL / wait), and the prose "Do NOT attempt to start the dev server yourself" is preserved.
6. `skills/visual-review/browser-review.md`'s Step 6 section still renders the `# | Finding | Type | Source | Severity/Impact | Recommended` table as markdown, followed by an instruction to call `AskUserQuestion` with 2 options (apply all recommended / override specific items) instead of the current plain-text `1. / 2.` list.
7. `skills/visual-review/discover-mode.md`'s Phase 5 section still renders its `| # | Gap | Recommended |` batch table (lines 140-144) as markdown, unchanged, followed by an `AskUserQuestion` call with the same 2 options as criterion 6; the separate "Journey Discovery Report" template (lines 118-134) is untouched, confirming it was never part of this conversion.
8. `skills/visual-review/discover-mode.md`'s "Next Actions (discover mode)" section instructs calling `AskUserQuestion` with 2 options matching the current list.
9. `skills/visual-review/browser-review.md`'s "Next Actions" section instructs its own `AskUserQuestion` call, resolved dynamically from its signal table (mirroring `design/SKILL.md`'s Return-shape resolution), including an option whose description is `/claude-tweaks:wrap-up {N}` when "Coming from full review mode" is the operative signal — confirming this call's option set is independent of, not filtered from, SKILL.md's 4 static options.
10. `skills/visual-review/discover-mode.md`'s Phase 2 section is unchanged in mechanism (still prose, still auto-proceeds, still uses the "say skip {numbers}" free-text opt-out) — grepping for `AskUserQuestion` within Phase 2's text block returns no match, confirming it was deliberately left alone.
11. `skills/design/SKILL.md`'s `## Next Actions` section instructs calling `AskUserQuestion` with options resolved dynamically from the Return-shape table, preserving all 12 rows of that lookup table as the option-resolution logic (the table itself is not removed — only the "Standard numbered options to present" list below it becomes an `AskUserQuestion` call).

## Technical Approach

Pattern reference (from spec 05 / the now-deleted design doc):
- **Pattern A** (inline decisions) applies to: `visual-review/SKILL.md` Step 2, `visual-review/browser-review.md`'s "Ensure the app is running."
- **Pattern B** (batch table stays markdown; terminal decision becomes one `AskUserQuestion` call) applies to: `browser-review.md` Step 6, `discover-mode.md` Phase 5.
- **Pattern C** (Next Actions) applies to: `journeys/SKILL.md`, `visual-review/SKILL.md`, `discover-mode.md`, `design/SKILL.md`.

### Worked example — `visual-review/SKILL.md` Step 2 (Pattern A)

Before:
```
The app doesn't seem to be running at {url}. Should I:
1. Start the dev server on a free port and continue
2. Try a different URL
3. Wait while you start the dev server
```
After — the section's prose instructs calling `AskUserQuestion` with `header: "Dev server"`, three options: `label: "Start dev server"` / `description: "start it on a free port and continue"`; `label: "Try different URL"` / `description: "provide a different URL to check"`; `label: "Wait"` / `description: "wait while you start the dev server yourself"`. No option is marked `(Recommended)` — the current text has no explicit recommendation among the three, so none is added.

### Worked example — `browser-review.md` Step 6 (Pattern B)

The `# | Finding | Type | Source | Severity/Impact | Recommended` table (lines 411-421) is unchanged, rendered as markdown exactly as today. Only the two lines immediately below it —
```
1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```
— become an instruction to call `AskUserQuestion` with two options: `label: "Apply all (Recommended)"` / `description: "Apply all recommendations"`; `label: "Override specific items"` / `description: "tell me which #s to change"`.

### Worked example — `design/SKILL.md` Next Actions (Pattern C, dynamic selection)

The Return-shape lookup table (12 rows) is unchanged. The "Standard numbered options to present" list below it becomes: call `AskUserQuestion` with the 1-4 options selected by matching the caller's actual return shape against the lookup table, each option's `label` a short summary (e.g., "Re-verify"), each `description` the full command (e.g., "`/claude-tweaks:test {spec}` — re-verify"), the contextually-recommended one suffixed `(Recommended)`.

### Key Files

- `skills/journeys/SKILL.md` — directive (line 5), `## Next Actions` (lines 169-179)
- `skills/visual-review/SKILL.md` — directive (line 5), Step 2 interactive-mode list (lines 124-129), `## Next Actions` (lines 180-191)
- `skills/visual-review/browser-review.md` — "Ensure the app is running" (lines 43-47), Step 6 terminal decision (lines 422-424), Next Actions note (near line 460)
- `skills/visual-review/discover-mode.md` — Phase 5 table (lines 140-144) and terminal decision (lines 146-147); "Next Actions (discover mode)" (lines 154-159); Phase 2 (lines 41-65) and the unrelated "Journey Discovery Report" template (lines 118-134) explicitly NOT touched
- `skills/design/SKILL.md` — directive (line 5), `## Next Actions` (lines 179-203)

### How `visual-review/SKILL.md`'s canonical Next Actions and `browser-review.md`'s mode-specific table relate (corrected during self-review)

**Correction:** an earlier draft of this section incorrectly claimed `browser-review.md`'s table only re-marks which of SKILL.md's 4 static options is `(Recommended)`. Verified against the actual file (`skills/visual-review/browser-review.md` lines 459-469): its table's first row recommends `/claude-tweaks:wrap-up {N}` — a command that is **not** one of SKILL.md's 4 static options at all. The two are not one shared option set.

The real relationship, per `visual-review/SKILL.md` line 191 ("Mode-specific Next Actions exist in `discover-mode.md`... and `browser-review.md`... for situations where the standalone block doesn't fit the mode's deliverable"): `browser-review.md`'s table is its **own independent Pattern C conversion** — its own `AskUserQuestion` call with its own up-to-4 options (wrap-up / review / "fix now items exist" / capture, resolved from its own signal table exactly as `design/SKILL.md` resolves its Return-shape table). It renders **instead of** SKILL.md's canonical 4-option call when browser-review.md's own conditions (full review mode, code-review status, pending fixes, standalone) are the operative context — the same relationship `discover-mode.md`'s "Next Actions (discover mode)" block already has with the canonical block (explicitly "in place of," not merged). Only one of the three Next Actions sites (canonical, browser-review, discover-mode) ever renders for a given invocation.

### Package Dependencies

None.

## Gotchas

- `discover-mode.md` Phase 2's candidate-journey list does not fit `AskUserQuestion` at all: the list is dynamically sized (N candidates, no fixed 2-4 cap) and the skill auto-proceeds without waiting for a reply — the "say skip {numbers}" mechanism is a free-text opt-out on an already-in-progress action, not a blocking choice. `AskUserQuestion` models a blocking choice with a fixed option set; forcing this into it would either truncate candidates past 4 or change the auto-proceed behavior to a blocking one, both of which change what the skill does today. Leave this site as prose — do not convert it.
- `visual-review/SKILL.md` Step 2's 3-option list and `browser-review.md`'s "Ensure the app is running" 2-option list describe overlapping but inconsistent behavior: SKILL.md's Step 2 offers to start the dev server as one of the three choices (and cross-references `dev-url-detection.md`'s auto-mode ephemeral-server logic), while `browser-review.md`'s older text explicitly says "Do NOT attempt to start the dev server yourself — the user knows their setup best." This spec converts each site's existing list faithfully as-is (per Acceptance Criteria 3 and 5) without resolving the inconsistency — flag it as an Open Question below so red-team/self-review decides whether `browser-review.md`'s text is stale and should be updated to match SKILL.md's newer 3-option behavior, or whether the two files intentionally describe different call sites.
- `browser-review.md`'s "Next Actions" subsection (near line 460) IS its own independent `AskUserQuestion` call — corrected during self-review. An earlier draft claimed it only informed which of SKILL.md's 4 static options gets `(Recommended)`; that's false — its first row recommends `/claude-tweaks:wrap-up {N}`, which isn't one of SKILL.md's 4 options. Only one of SKILL.md's canonical call, `browser-review.md`'s call, or `discover-mode.md`'s call ever renders per invocation (mode-selected, not merged) — do not implement this as one shared option pool.
- `design/SKILL.md`'s Next Actions is invoked by six different caller skills in six different modes — the dynamic option-selection logic (Return-shape table → 1-4 options) must be preserved exactly; do not collapse it to a fixed option set.

## Open Questions

| Persona | Finding | Suggested Resolution |
|---------|---------|---------------------|
| Skeptical Reviewer | `visual-review/SKILL.md` Step 2 (3 options, offers to start the dev server) and `browser-review.md`'s "Ensure the app is running" (2 options, explicitly forbids starting the server) describe the same "app not responding" moment inconsistently. Converting both faithfully preserves the inconsistency rather than fixing it. | Decide during Step 6 Self-Review (or defer to the user) whether `browser-review.md`'s section is stale prose superseded by SKILL.md's Step 2 and should be deleted/updated, or whether it's a genuinely distinct call path. Not resolved by this spec. |

## Manual Steps

None.
