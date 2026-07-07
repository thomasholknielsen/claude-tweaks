---
tier: 3
status: not-started
progress: 0
blocked-by: [5]
surface: backend
---

# 08: AskUserQuestion adoption — Lifecycle C (stories, review, wrap-up)

## Overview

Converts the AskUserQuestion patterns (inline decisions, batch-table terminal decisions, `## Next Actions` blocks) in the pipeline's tail-end lifecycle skills — `/claude-tweaks:stories`, `/claude-tweaks:review`, and `/claude-tweaks:wrap-up` — plus their sub-files that carry genuine decision content: `stories/coverage-report.md`, `review/step3-routing.md`, `review/review-summary-template.md`, `wrap-up/review-console.md`, and `wrap-up/skill-curation.md`. Depends on spec 05 (Foundation) for the canonical directive wording and the worked Pattern A/B/C definitions.

Two of this spec's sites are the design's grounding examples for Pattern B (batch-table hybrid): `review/step3-routing.md`'s 2-option findings-table decision, and `wrap-up/review-console.md`'s 3-option Review Console decision plus its separate per-item queue-write loop.

**Complexity:** Medium
**Estimated tasks:** 9

## Non-Goals

- Any other skill family — init/capture/challenge (spec 06), specify/build/test (spec 07), reflect/simplify/deepen (spec 09), journeys/visual-review/design (spec 10), help/tidy/flow/browse (spec 11), ledger/version/research/code-health/routine/harness-health (spec 12).
- Redesigning the canonical directive wording or Pattern A/B/C definitions — that's spec 05's job; this spec only applies them.
- `ledger/resolve-gate.md` — handled in spec 12 as bespoke design work (6-option per-item vocabulary exceeds the 4-option cap; does not fit Pattern B).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 5 | AskUserQuestion adoption — Foundation | not-started |

## Current State

- `skills/stories/SKILL.md` line 5 — directive; lines 408-416 — `## Next Actions` block (4 possible options: `/test qa` recommended, `tag=smoke`, `affected`, `journey={name}`, rendered conditionally per context signal). Line 417 is a separate `## Component-Skill Contract` heading — not part of the Next Actions block; do not fold it into this conversion.
- `skills/stories/coverage-report.md` lines 40-64 — "Journey Link Suggestions (update mode only)" section: a batch table of suggested `journey:` field additions, followed by a 3-option interactive decision (`1. Apply all suggestions **(Recommended)**` / `2. Override specific items` / `3. Skip all`).
- `skills/review/SKILL.md` line 5 — directive only; no inline decision or batch table in this file's own body (Step 3 Routing and Next Actions both delegate to sibling files).
- `skills/review/step3-routing.md` lines 70-86 — "Interactive mode (per-batch user input)" section: findings batch table (`# | Finding | Severity | Category | Affected | Recommended`) followed by a 2-option decision (`1. Apply all recommendations **(Recommended)**` / `2. Override specific items`).
- `skills/review/review-summary-template.md` lines 98-113 — the `### Next Actions` block `/claude-tweaks:review`'s Step 7 summary actually renders: a signal-driven table with 2 possible options under `PASS` (wrap-up recommended, plus a conditional visual-review option) and 2 under `BLOCKED` (build recommended, plus a conditional re-verify option).
- `skills/wrap-up/SKILL.md` line 5 — directive; lines 189-205 — Step 8.5 "Ops acknowledgment" 2-option decision (`1. I've read every item — acknowledge all` / `2. I have questions about specific items — show details`) explicitly written with **neither option marked Recommended** ("require explicit confirmation rather than offering a `(Recommended)` shortcut"); lines 279-290 — Step 9 "Conditional batch decision" (cleanup + config items table, 2-option: `1. Apply all **(Recommended)**` / `2. Override specific items`); lines 343-354 — `## Next Actions` table (up to 3 options: `/flow {N}` recommended, `/build {N}`, `/help`).
- `skills/wrap-up/review-console.md` lines 122-124 — the Review Console's 3-option terminal decision (`1. Approve all **(Recommended)**` / `2. Override specific items` / `3. Stop and re-engage`); lines 129-137 — the separate per-item queue-write loop (`Apply? (yes / no / edit)` for each `Q#` item), explicitly forbidden from bulk approval ("Queue writes are per-item only. Never group them under 'Approve all'").
- `skills/wrap-up/skill-curation.md` lines 65-82 — "Interactive mode" batch decision table (skill/config change rows, 2-option: `1. Apply all **(Recommended)**` / `2. Override specific items`).
- Canonical directive text and Pattern A/B/C definitions: `specs/05-askuserquestion-foundation.md` (this spec's Prerequisite).

## Deliverables

- [ ] `stories/SKILL.md`: replace line 5's directive with the canonical text from spec 05. Convert the `## Next Actions` block (lines 408-416 — not 417, which is the start of the separate Component-Skill Contract section) to one `AskUserQuestion` call per Pattern C — each of the up to 4 conditionally-rendered options becomes an option (label = short summary, description = full pre-filled command), the `/test qa` option's label suffixed `(Recommended)`. Per spec 05's Pattern C fallback rule, if none of the 3 conditional options apply (no smoke stories, no update-mode regen, no journeys), the call still has the always-present `/test qa` option alone with nothing to compare against — in that single-option case, skip `AskUserQuestion` and state the `/test qa` command directly.
- [ ] `stories/coverage-report.md`: convert the "Journey Link Suggestions" terminal decision (lines 61-63) to one `AskUserQuestion` call per Pattern B — 3 options (`Apply all suggestions` suffixed `(Recommended)`, `Override specific items`, `Skip all`). The batch table itself (lines 53-59) stays as markdown.
- [ ] `review/SKILL.md`: replace line 5's directive with the canonical text from spec 05. No other change in this file (Next Actions and Step 3 Routing live in sibling files).
- [ ] `review/step3-routing.md`: convert the terminal decision (lines 84-85) to one `AskUserQuestion` call per Pattern B — 2 options (`Apply all recommendations` suffixed `(Recommended)`, `Override specific items`). The findings batch table (lines 77-82) stays as markdown. This is the canonical Pattern B worked example other specs may reference.
- [ ] `review/review-summary-template.md`: convert the `### Next Actions` block (lines 100-113) to one `AskUserQuestion` call per Pattern C for each verdict branch (PASS and BLOCKED render independently — only one branch's call is ever emitted per actual review run). PASS: wrap-up option labeled `(Recommended)`, plus the conditional visual-review option when its signal holds. BLOCKED: build option labeled `(Recommended)`, plus the conditional test re-verify option when its signal holds.
- [ ] `wrap-up/SKILL.md`: replace line 5's directive with the canonical text from spec 05. Convert Step 8.5's Ops acknowledgment decision (lines 200-201) to one `AskUserQuestion` call with 2 options — **neither option's label carries `(Recommended)`**, preserving the source text's explicit intent to not bias the user toward bulk acknowledgment. Convert Step 9's Conditional batch decision (lines 286-287) to one `AskUserQuestion` call per Pattern B — 2 options (`Apply all` suffixed `(Recommended)`, `Override specific items`). Convert the `## Next Actions` table (lines 349-353) to one `AskUserQuestion` call per Pattern C.
- [ ] `wrap-up/review-console.md`: convert the terminal decision (lines 122-124) to one `AskUserQuestion` call per Pattern B — 3 options (`Approve all` suffixed `(Recommended)`, `Override specific items`, `Stop and re-engage`). Convert the per-item queue-write loop (lines 132-136) to one small `AskUserQuestion` call per `Q#` item — 3 options (`Apply`, `Skip`, `Edit`), none marked Recommended, issued once per queue item, never bulk-approvable (preserve the "Queue writes are per-item only" invariant exactly — no option or wording that could be read as a bulk-apply-all-queue-writes shortcut).
- [ ] `wrap-up/skill-curation.md`: convert the "Interactive mode" terminal decision (lines 76-77) to one `AskUserQuestion` call per Pattern B — 2 options (`Apply all` suffixed `(Recommended)`, `Override specific items`). The skill-updates batch table (lines 70-74) stays as markdown.

## Acceptance Criteria

1. `stories/SKILL.md`, `review/SKILL.md`, `wrap-up/SKILL.md` each contain the string `AskUserQuestion` in their Interaction style directive line, and no longer contain "reply with just a number."
2. `stories/SKILL.md`'s Next Actions section instructs an `AskUserQuestion` call; grepping the file for the literal string `1. \`/claude-tweaks:test qa\`` (the old plain-text list's first line) returns no match.
3. `stories/coverage-report.md`'s Journey Link Suggestions section instructs an `AskUserQuestion` call with exactly 3 options; grepping for the literal string `1. Apply all suggestions` returns no match.
4. `review/step3-routing.md`'s Interactive mode section instructs an `AskUserQuestion` call with exactly 2 options; grepping for the literal string `1. Apply all recommendations` returns no match; the findings batch table's markdown (the `| # | Finding | Severity | Category | Affected | Recommended |` header row) is unchanged.
5. `review/review-summary-template.md`'s Next Actions block instructs an `AskUserQuestion` call for each of the PASS and BLOCKED branches; grepping the file for the literal string `` `/claude-tweaks:wrap-up {N}` — capture learnings and clean up **(Recommended)** `` (the old plain-text PASS row) returns no match.
6. `wrap-up/SKILL.md`'s Step 8.5 Ops acknowledgment section instructs an `AskUserQuestion` call where neither option's label contains the substring `Recommended` — grepping the converted section for `(Recommended)` returns no match.
7. `wrap-up/SKILL.md`'s Step 9 Conditional batch decision and `## Next Actions` sections each instruct an `AskUserQuestion` call; grepping the file for the literal strings `1. Apply all **(Recommended)**` (Step 9) and the old Next Actions numbered list return no match.
8. `wrap-up/review-console.md`'s terminal decision instructs an `AskUserQuestion` call with exactly 3 options; the Queue writes section instructs one small `AskUserQuestion` call per `Q#` item with exactly 3 options (Apply/Skip/Edit) and explicitly states these calls are never combined into the terminal decision's "Approve all" — grepping the file for a phrase asserting queue writes remain per-item (e.g., retains "per-item" or equivalent wording) confirms the invariant text survives the edit.
9. `wrap-up/skill-curation.md`'s Interactive mode section instructs an `AskUserQuestion` call with exactly 2 options; grepping for the literal string `1. Apply all **(Recommended)**` in this file returns no match (the old prose is fully replaced, not left alongside the new instruction).

## Technical Approach

No data model or API surface — documentation/skill-content change only.

### `stories/SKILL.md` Next Actions (Pattern C)

`AskUserQuestion` call, `header: "Next step"`:
- Option 1 — `label: "Validate all (Recommended)"`, `description: "/claude-tweaks:test qa — validate all {N} stories against the running app"`
- Option 2 (when smoke stories exist) — `label: "Smoke pass"`, `description: "/claude-tweaks:test qa tag=smoke — quick pass on {N} smoke stories first"`
- Option 3 (when update mode regenerated stories) — `label: "Affected only"`, `description: "/claude-tweaks:test qa affected — validate only changed stories"`
- Option 4 (when journeys exist) — `label: "By journey"`, `description: "/claude-tweaks:test qa journey={name} — validate {N} stories for the {name} journey"`

### `stories/coverage-report.md` Journey Link Suggestions (Pattern B)

Table (lines 53-59) unchanged. Terminal decision — `AskUserQuestion` call, `header: "Journey links"`:
- Option 1 — `label: "Apply all (Recommended)"`, `description: "Add the suggested journey: field to every listed story"`
- Option 2 — `label: "Override specific items"`, `description: "Tell me which #s to skip"`
- Option 3 — `label: "Skip all"`, `description: "I'll link journeys manually"`

### `review/step3-routing.md` Interactive mode (Pattern B — canonical worked example)

Table (lines 77-82) unchanged. Terminal decision — `AskUserQuestion` call, `header: "Findings"`:
- Option 1 — `label: "Apply all (Recommended)"`, `description: "Apply all recommended fixes"`
- Option 2 — `label: "Override specific items"`, `description: "Tell me which #s to change"`

### `review/review-summary-template.md` Next Actions (Pattern C)

`AskUserQuestion` call, `header: "Next step"` — rendered once, using whichever branch matches the run's actual verdict:

**PASS branch:**
- Option 1 — `label: "Wrap up (Recommended)"`, `description: "/claude-tweaks:wrap-up {N} — capture learnings and clean up"`
- Option 2 (when visual not done + journeys affected/UI changed + browser available) — `label: "Visual review"`, `description: "/claude-tweaks:visual-review journey:{name} — walk affected journey before wrapping up"` (or the `{url}` variant per the source table)

**BLOCKED branch:**
- Option 1 — `label: "Fix gaps (Recommended)"`, `description: "/claude-tweaks:build {N} — fix gaps listed above"`
- Option 2 (when test failures present) — `label: "Re-verify"`, `description: "/claude-tweaks:test — re-verify after fixes"`

### `wrap-up/SKILL.md` Step 8.5 Ops acknowledgment (Pattern A, deliberately unbiased)

`AskUserQuestion` call, `header: "Ops items"` — **neither option's label carries `(Recommended)`**:
- Option 1 — `label: "Acknowledge all"`, `description: "I've read every item"`
- Option 2 — `label: "Show details"`, `description: "I have questions about specific items"`

### `wrap-up/SKILL.md` Step 9 Conditional batch decision (Pattern B)

Table (lines 280-284) unchanged. Terminal decision — `AskUserQuestion` call, `header: "Apply changes"`:
- Option 1 — `label: "Apply all (Recommended)"`, `description: "Apply all cleanup and configuration items"`
- Option 2 — `label: "Override specific items"`, `description: "Tell me which #s to change"`

### `wrap-up/SKILL.md` Next Actions (Pattern C)

`AskUserQuestion` call, `header: "Next step"`:
- Option 1 (when a next spec exists) — `label: "Full pipeline (Recommended)"`, `description: "/claude-tweaks:flow {N} — full pipeline on spec {N}: \"{title}\""`
- Option 2 (when specs are newly unblocked) — `label: "Build {N}"`, `description: "/claude-tweaks:build {N} — spec {N} \"{title}\" now unblocked"`
- Option 3 (always) — `label: "Pipeline status"`, `description: "/claude-tweaks:help — full pipeline status"`

### `wrap-up/review-console.md` terminal decision (Pattern B — canonical worked example)

Tables (Sections 1-6) unchanged. Terminal decision — `AskUserQuestion` call, `header: "Review Console"`:
- Option 1 — `label: "Approve all (Recommended)"`, `description: "Apply pending items, accept auto-applied, apply skill + config updates, execute cleanup (items 1-{N})"`
- Option 2 — `label: "Override specific items"`, `description: "Reply with #s to skip/modify (e.g., \"skip 5, modify 7, revert 1\")"`
- Option 3 — `label: "Stop and re-engage"`, `description: "Pause the pipeline; resume after manual review"`

### `wrap-up/review-console.md` queue-write loop (Pattern B, per-item, never bulk)

One `AskUserQuestion` call per `Q#` item, issued after the terminal decision (options 1 or 2), `header: "Queue write {Q#}"`:
- Option 1 — `label: "Apply"`, `description: "Write to {destination}: \"{content}\""`
- Option 2 — `label: "Skip"`, `description: "Drop this proposal"`
- Option 3 — `label: "Edit"`, `description: "Modify before writing"`

None of these three options carries `(Recommended)` — the source text requires explicit per-item attention, and these calls are never combined into a single multi-question `AskUserQuestion` call across multiple `Q#` items (that would functionally reintroduce bulk approval by letting the user answer several at once without individually attending to each).

### `wrap-up/skill-curation.md` Interactive mode (Pattern B)

Table (lines 70-74) unchanged. Terminal decision — `AskUserQuestion` call, `header: "Skill updates"`:
- Option 1 — `label: "Apply all (Recommended)"`, `description: "Apply all skill and config updates"`
- Option 2 — `label: "Override specific items"`, `description: "Tell me which #s to change"`

### Key Files

- `skills/stories/SKILL.md`
- `skills/stories/coverage-report.md`
- `skills/review/SKILL.md`
- `skills/review/step3-routing.md`
- `skills/review/review-summary-template.md`
- `skills/wrap-up/SKILL.md`
- `skills/wrap-up/review-console.md`
- `skills/wrap-up/skill-curation.md`

### Package Dependencies

None.

## Gotchas

- `wrap-up/SKILL.md`'s Ops acknowledgment and `review-console.md`'s queue-write loop are the two sites in this spec that deliberately omit a `(Recommended)` marker — the source prose explicitly states why (avoiding bias toward bulk action on items requiring individual judgment or that legally/operationally require per-item attention). Do not "fix" this by adding a Recommended marker for consistency with other sites — the inconsistency is intentional and load-bearing.
- `review-console.md`'s queue-write loop must remain genuinely per-item. Do not batch multiple `Q#` items into one `AskUserQuestion` call's multiple questions (the tool allows up to 4 questions per call) — that would let a user answer several queue writes in one interaction without individually confirming each, defeating the "never bulk-approve INBOX/DEFERRED writes" rule in `_shared/auto-mode-contract.md`.
- `review/SKILL.md`'s own Next Actions section is a pointer, not the actual rendering — the real Next Actions content lives in `review-summary-template.md` (both files are in this spec's scope; don't convert `review/SKILL.md` and consider review's Next Actions done without also touching the template).

## Manual Steps

None — pure documentation/skill-content edit. Note: none of this repo's `tests/` files reference `stories/`, `review/`, or `wrap-up/` (confirmed via grep) — the Acceptance Criteria above are verified by direct grep/inspection and manual dogfood of the affected commands, not by `npm test`.
