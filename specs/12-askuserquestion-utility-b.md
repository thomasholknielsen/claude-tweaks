---
tier: 3
status: not-started
progress: 0
blocked-by: [5]
surface: backend
---

# 12: AskUserQuestion adoption — Utility B (ledger, version, research, code-health, routine, harness-health)

## Overview

Converts the `AskUserQuestion` patterns in six Utility-tier skills to the canonical convention established in Spec 05: `ledger` (+ its `resolve-gate.md` sub-file), `version`, `research`, `code-health`, `routine`, and `harness-health`. Most of these are mechanical (directive text swap + `## Next Actions` conversion), but `ledger/resolve-gate.md` Phase 2 needs a genuine redesign — its 6-option per-item vocabulary exceeds `AskUserQuestion`'s 4-option-per-question cap and must become a two-step drill. `code-health` Step 10 and `harness-health` Step 8 also carry a batch-table-style per-finding routing decision that needs a concrete Pattern B treatment (currently described only in vague prose — "let the user route each").

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Any other skill family — init, capture, challenge, specify, build, test, stories, review, wrap-up, reflect, simplify, deepen, journeys, visual-review, design, help, tidy, flow, browse are covered by sibling specs 06-11.
- Redesigning or re-wording the canonical `AskUserQuestion` directive text itself — that's Spec 05's job; this spec only applies it.
- `routine/SKILL.md` Step 4 (resolving `environment_id`) and Step 5 (resolving the cron schedule) — both are open-ended value-resolution prompts ("offer it as the default, let the user override" / "ask ... or supply a different cron expression"), not a fixed enumerable set of options. Forcing these into `AskUserQuestion` would require inventing a candidate-list UI the current skill doesn't specify (e.g., where would a list of "other" cron expressions come from?) — out of scope. Only `routine/SKILL.md` Step 7's explicit binary "Review gate" (Create vs. Cancel) is in scope, since it is already framed as a fixed confirm/cancel decision.
- `bin/code-health.js`, `bin/harness-health.js`, or any other Node source under `bin/` — this spec touches only skill markdown content.
- Changing what data code-health/harness-health findings contain, their fingerprinting, or the `validate-findings` CLI contract — only the interactive-mode presentation of already-computed findings changes.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 5 | AskUserQuestion adoption — Foundation | not-started |

## Current State

- `skills/ledger/SKILL.md` line 5 — directive boilerplate. Lines 206-210 — `## Next Actions`, 3 options, option 1 marked `**(Recommended)**`.
- `skills/ledger/resolve-gate.md` lines 36-61 (Phase 2) — presents unresolved items in a markdown table, then a 6-option mutually-exclusive vocabulary (`1. Fix anyway`, `2. Defer to specs/DEFERRED.md`, `3. Send to specs/INBOX.md`, `4. Accept`, `5. Acknowledge`, `6. Drop`), reply format `{#}: {choice}` or `all: {choice}`. Line 61 states explicitly: "Do NOT pre-classify items, do NOT pick 'obviously correct' resolutions, do NOT auto-route to 'apply all' — every remaining item gets an explicit per-item user response. The user may reply `all: 2` (or `all: 3`) to bulk-route, but the request must come from them, not be the default offered."
- `skills/version/SKILL.md` line 5 — directive boilerplate. Lines 61-64 — `## Next Actions`, 2 options: option 1 conditionally recommended (`**(Recommended when version was the only thing you needed)**`), option 2 is a bare URL (release notes), not a command.
- `skills/research/SKILL.md` line 5 — directive boilerplate. Lines 40-52 (Mode Picker) — "If no `--mode=` flag is present, ask exactly this question," a 4-option inline decision (`quick`/`standard`/`deep`/`ultradeep`), `standard` marked `← recommended`. Lines 120-127 — `## Next Actions`, 4 options, option 1 conditionally recommended, option 4 conditionally offered ("only if current mode left obvious gaps").
- `skills/code-health/SKILL.md` line 5 — directive boilerplate. Step 10 (lines 255-257) — "In interactive mode, present findings as a batch table and let the user route each to: file issue / INBOX (`/capture`) / `/specify` directly / dismiss" — described in prose only, no concrete table or terminal-decision option set given. Lines 312-317 — `## Next Actions`, 4 options, option 1 conditionally recommended.
- `skills/routine/SKILL.md` line 5 — directive boilerplate. Step 7 "Review gate" (CREATE, line 96) and the equivalent in UPDATE (Step 5, line 125) — "Show the full assembled body before doing anything with it... This creates live, billed infrastructure with no delete API — always confirm explicitly here." No concrete option set given today (relies on free-form "confirm"). Lines 145-149 — `## Next Actions`, 3 options, option 1 marked `**(Recommended right after `create`.)**`.
- `skills/harness-health/SKILL.md` line 5 — directive boilerplate. Step 8 (lines 100-102) — "In interactive mode, present findings as a batch table and let the user route each to: apply now / file issue / dismiss" — same vague-prose pattern as code-health. Lines 118-122 — `## Next Actions`, 3 options, option 1 marked `**(Recommended after a first standalone run confirms the output looks right.)**`.

## Deliverables

- [ ] `skills/ledger/SKILL.md` — replace the directive boilerplate (line 5) with Spec 05's canonical text. Convert `## Next Actions` (lines 206-210) to instruct one `AskUserQuestion` call with 3 options, matching the existing labels/recommendation.
- [ ] `skills/ledger/resolve-gate.md` Phase 2 — replace the flat 6-option list with the two-step drill in Technical Approach below. Preserve Phase 1 and Phase 3 unchanged; preserve the "no default bulk-apply, every item gets an explicit per-item response, bulk-routing must be user-initiated" invariant exactly. State explicitly that the full multi-row unresolved-items table renders once, upfront, before the per-item `AskUserQuestion` drill begins (matching today's behavior) — the drill does not re-render the table per item. Add an inline guardrail note directly in the rewritten Phase 2 text (not just this spec) stating that no step of the drill may gain a 4th "apply to all" option, so the invariant is documented where a future editor of `resolve-gate.md` will actually see it, independent of this spec's lifespan.
- [ ] `skills/version/SKILL.md` — replace directive boilerplate. Convert `## Next Actions` to one `AskUserQuestion` call, 2 options, option 1 labeled with a flat `(Recommended)` suffix (drop the conditional parenthetical — this skill has no other context to condition on).
- [ ] `skills/research/SKILL.md` — replace directive boilerplate. Convert the Mode Picker (lines 40-52) to one `AskUserQuestion` call, 4 options, `standard` marked `(Recommended)`. Convert `## Next Actions` to one `AskUserQuestion` call, 4 options. Two options carry a conditional recommendation today, not just option 4: option 1 ("Promote findings into INBOX") is marked `**(Recommended when topic was exploratory)**`, and option 4 ("Re-run in deeper mode") only appears `**only if current mode left obvious gaps**`. Verified against the actual file — there is no default/fallback recommendation stated for the non-exploratory case; today, when the topic wasn't exploratory, none of the 4 options carries a Recommended marker at all. Preserve that exactly: option 1's `(Recommended)` label is conditional on exploratory-topic being true; when false, the call has 4 options and none is marked Recommended (the `AskUserQuestion` tool doesn't require one — see its own description: "If you recommend a specific option..." is conditional phrasing, not mandatory). Option 4's condition still gates whether it's *included* in the call at all, independent of the Recommended-marker question.
- [ ] `skills/code-health/SKILL.md` Step 10 — replace the vague "let the user route each" prose with the concrete two-tier design in Technical Approach below (batch table + terminal `AskUserQuestion`, then per-finding `AskUserQuestion` only when "Route individually" is chosen). Convert `## Next Actions` to one `AskUserQuestion` call, 4 options.
- [ ] `skills/routine/SKILL.md` — replace directive boilerplate. Convert the Review gate (CREATE Step 7 and UPDATE Step 5) to one `AskUserQuestion` call, 2 options (`Create`/`Update` vs. `Cancel`), neither marked Recommended (see Gotchas — this is a consequential, hard-to-reverse action; the tool should not nudge). Convert `## Next Actions` to one `AskUserQuestion` call, 3 options.
- [ ] `skills/harness-health/SKILL.md` Step 8 — replace the vague "let the user route each" prose with the concrete two-tier design in Technical Approach below (same shape as code-health, 3 terminal options instead of 4). Convert `## Next Actions` to one `AskUserQuestion` call, 3 options.

## Acceptance Criteria

1. `skills/ledger/SKILL.md`, `skills/version/SKILL.md`, `skills/research/SKILL.md`, `skills/code-health/SKILL.md`, `skills/routine/SKILL.md`, `skills/harness-health/SKILL.md` — each file's directive blockquote (currently at line 5 in each) is byte-identical to Spec 05's canonical Interaction style directive text.
2. `skills/ledger/resolve-gate.md` — grepping for the literal string `1. Fix anyway — address it now even though it expands scope` (the old flat list) returns no match. The file's Phase 2 section describes exactly two `AskUserQuestion` steps per item as specified in Technical Approach, and does NOT contain any option whose label or description means "apply this choice to all remaining items" (verifies the no-default-bulk-apply invariant survives).
3. `skills/ledger/resolve-gate.md` — the words "every remaining item gets an explicit per-item response" (or equivalent) and "the request must come from them" (or equivalent, describing user-initiated bulk override via free text) both still appear somewhere in Phase 2 after the rewrite.
4. `skills/research/SKILL.md` — grepping for the literal string `? Mode for "<topic>":` (the old plain-text Mode Picker header) returns no match. The Mode Picker section instructs an `AskUserQuestion` call with exactly 4 options and `standard` labeled `(Recommended)`.
5. `skills/code-health/SKILL.md` Step 10 and `skills/harness-health/SKILL.md` Step 8 — each names a concrete two-call sequence: one `AskUserQuestion` call with options "Apply all recommended" and "Route individually," followed by a conditional per-finding `AskUserQuestion` call (4 options for code-health: File issue / INBOX / /specify directly / Dismiss; 3 options for harness-health: Apply now / File issue / Dismiss) that only fires when "Route individually" was chosen.
6. Every file in this spec's `## Next Actions` section, after conversion, instructs exactly one `AskUserQuestion` call whose option count matches the number of numbered items in that file's current Next Actions list (ledger: 3, version: 2, research: 4, code-health: 4, routine: 3, harness-health: 3), with the previously `(Recommended)`-marked option retaining that marking (conditional recommendation language collapsed to a flat `(Recommended)` where the condition was effectively always true in context, per Deliverable 3 above for `version`).
7. `skills/routine/SKILL.md`'s Review gate description (both CREATE Step 7 and UPDATE Step 5) instructs an `AskUserQuestion` call with exactly 2 options and explicitly states neither option carries a `(Recommended)` marking.
8. None of the 7 files' `**Auto mode:**`-labeled sections (where present) are modified by this spec.

## Technical Approach

No data model or API surface — documentation/skill-content only.

### `ledger/resolve-gate.md` Phase 2 — two-step drill (replaces the flat 6-option list)

For each unresolved item, present it (same table format as today), then call `AskUserQuestion` with:
- Step 1 (always) — 3 options:
  - `label`: `"Fix anyway"`, `description`: `"Address it now even though it expands scope"`
  - `label`: `"Route to a doc"`, `description`: `"Defer to specs/DEFERRED.md or capture to specs/INBOX.md"`
  - `label`: `"Close out"`, `description`: `"Accept, acknowledge, or drop it"`
  - None marked `(Recommended)` — Phase 1 already fixed everything fixable; every remaining item is a genuine judgment call with no safe default.
- Step 2a (only if "Route to a doc" was chosen) — 2 options:
  - `label`: `"Defer"`, `description`: `"To specs/DEFERRED.md — has a trigger condition for when to revisit"`
  - `label`: `"Send to INBOX"`, `description`: `"To specs/INBOX.md — captured for later evaluation, no specific trigger yet"`
- Step 2b (only if "Close out" was chosen) — 3 options:
  - `label`: `"Accept"`, `description`: `"Intentional, with stated reason"`
  - `label`: `"Acknowledge"`, `description`: `"Ops item requiring action outside the codebase"`
  - `label`: `"Drop"`, `description`: `"No longer relevant"`

Preserve the user-initiated bulk override exactly, and consistently at every step of the drill — not just Step 1: if the user answers Step 1 **or** Step 2a/2b via `Other` with a bulk instruction (e.g., Step 1 `Other`: "apply Route to a doc + Defer to all remaining items"; Step 2b `Other`, after answering Step 1 individually per item: "Drop the rest"), apply it to all remaining like-classified items and skip individual calls for those — do not pre-offer this as a button at any step, at any level of the drill. This is the direct replacement for the old `all: {choice}` free-text convention, generalized to both steps.

**Guardrail note to write directly into `resolve-gate.md`'s rewritten Phase 2** (not just here): "No step of this drill may gain a 4th/'apply to all' option, even though the option cap would allow it — bulk routing is user-initiated via `Other` only, never a presented default. See Anti-Patterns: 'Bulk-resolving open items without per-item user input.'"

### `code-health/SKILL.md` Step 10 and `harness-health/SKILL.md` Step 8 — two-tier finding routing

Both follow the same shape (Pattern B, generalized from the review/wrap-up sites in Spec 05's Decision Rationale):

1. Render all findings as a markdown batch table (`# | Title | Criterion/Category | Severity | Confidence | Recommended`), recommendation pre-filled per severity/confidence:
   - **code-health:** high severity + high confidence → "File issue"; below `--min-risk` or low confidence → "INBOX"; everything else (e.g. medium severity + high confidence) → "File issue" (the same default as the high-severity case — file issue is the safe default whenever a finding clears the confidence bar but isn't low-risk enough for INBOX).
   - **harness-health:** additive + high-confidence + high-reversibility → "Apply now" per Step 7's own existing auto-apply policy; everything else → "File issue".
2. One `AskUserQuestion` call, 2 options: `"Apply all recommended"` (marked `(Recommended)`) and `"Route individually"`.
3. If "Route individually": one `AskUserQuestion` call per finding.
   - code-health: 4 options — `"File issue"`, `"INBOX"` (description: "capture via /capture for later triage"), `"/specify directly"` (description: "promote straight to a spec, skipping the issue"), `"Dismiss"`.
   - harness-health: 3 options — `"Apply now"`, `"File issue"`, `"Dismiss"` (description: "run `mark declined` so it doesn't reappear").

### `research/SKILL.md` Mode Picker (Pattern A)

Replace the plain-text block with: call `AskUserQuestion`, `header: "Research mode"`, 4 options — `label: "Quick"` / `description: "~2-5 min, 5+ sources"`; `label: "Standard (Recommended)"` / `description: "~5-10 min, 10+ sources"`; `label: "Deep"` / `description: "~10-20 min, 15+ sources"`; `label: "Ultradeep"` / `description: "~20-45 min, red-team pass + multi-persona critique"`.

### `routine/SKILL.md` Review gate (Pattern A)

Replace the free-form "confirm explicitly" instruction with: call `AskUserQuestion`, `header: "Confirm routine"`, 2 options — `label: "Create"` (or `"Update"` in the UPDATE flow) / `description: "Proceed with the assembled RemoteTrigger body shown above"`; `label: "Cancel"` / `description: "Do not create/update anything"`. Neither option carries `(Recommended)`.

### Key Files

- `skills/ledger/SKILL.md`
- `skills/ledger/resolve-gate.md`
- `skills/version/SKILL.md`
- `skills/research/SKILL.md`
- `skills/code-health/SKILL.md`
- `skills/routine/SKILL.md`
- `skills/harness-health/SKILL.md`

### Package Dependencies

None.

## Gotchas

- `ledger/resolve-gate.md`'s "no default bulk-apply" invariant is the single most important thing to preserve in this spec — it exists specifically to stop an agent from silently steamrolling unresolved work (see the file's own Anti-Patterns: "Bulk-resolving open items without per-item user input"). Do not add a 4th "apply to all" option at any step of the two-step drill, even though it would technically fit the option cap.
- `routine/SKILL.md`'s Review gate is explicitly about "live, billed infrastructure with no delete API" — do not mark either option `(Recommended)`. This is the one inline decision in this whole 8-spec initiative where the tool's convention (mark a recommended default) is deliberately not followed, because there is no safe default for a hard-to-reverse action.
- `code-health` and `harness-health`'s Step 10 / Step 8 prose today is genuinely underspecified ("let the user route each") — this spec is not just reformatting existing concrete text into `AskUserQuestion` syntax, it is also the first time these two steps get a concrete design. Do not treat this as "just swap the presentation" — write the full two-tier procedure into the file.
- `research/SKILL.md`'s Next Actions option 4 ("Re-run in deeper mode") is conditionally offered only when "current mode left obvious gaps" — this condition gates whether the option is included in the `AskUserQuestion` call at all (an option that isn't relevant this run should not appear as a greyed-out or caveat-laden choice), not a disclaimer rendered inside the option text.

## Manual Steps

None — pure documentation/skill-content edit, verifiable via `npm test` and manual dogfood of `/claude-tweaks:ledger resolve`, `/claude-tweaks:research`, `/claude-tweaks:routine create <skill>`.
