---
record: 379
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: explore-mode:design-wrapper-explore-mode-entry-points-and-skill-graph-wir
blocked-by: [377, 378]
surface: backend
---
# 379: design-wrapper explore mode: entry points and skill-graph wiring

Surface: backend

## Overview

Wire the `explore` mode into the lifecycle: `/claude-tweaks:init` recommends it at the genesis moment, `/claude-tweaks:specify`'s Step 2.5b-ii offers the right tournament scope instead of (identity) or ahead of (layout) the current single-scaffold `live` exploration, the wrapper's own Next Actions cover the mode's two ok shapes, and every new relationship is recorded once in `docs/skill-graph.md`. After this record, the tournament is reachable at both moments that motivated the design: project genesis (before DESIGN.md is locked) and new-feature composition inside an established world.

**Complexity:** Medium
**Estimated tasks:** 5-7

## Non-Goals

- Any change to the mode file's procedures (#377/#378 own `modes/explore.md`).
- Auto-running `explore` from `/claude-tweaks:init` or from any auto-mode context — the mode is interactive-only; `/init` only *recommends*.
- Restating skill-graph edges inside any SKILL.md — edges live once in `docs/skill-graph.md` (CLAUDE.md cross-references rule).
- A `/help` diagram change — `explore` is a mode of an existing skill, not a new skill.
- Removing Step 2.5b-ii's existing `live` exploration — it remains, repositioned per branch (see Deliverables). On the identity branch, `live` is **intentionally not re-offered** after the tournament: the identity pick seeds DESIGN.md, and element-level tuning of a specific surface belongs to a later run's layout branch, which offers `live` on the tournament winner. State this intent in the identity branch's text so a future editor reads absence as a decision, not an omission.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #377 | design-wrapper explore mode: identity scope (genesis worlds tournament) | ready |
| #378 | design-wrapper explore mode: layout scope (established-world composition tournament) | ready |

Build order is enforced by the native blocked-by links; this record's acceptance criteria cannot run until both prerequisites have merged (its greps target content those records create).

## Current State

- `skills/specify/design-pre-steps.md` Step 2.5b-ii — the variant-exploration step: interactive-only, decomposition-mode-only, web-only (native surfaces skip), and gated on Step 2.5b's confirmed brief; offers one scaffold + `/claude-tweaks:design-wrapper live` via a 5-item procedure (generate scaffold → serve ephemerally → hand to live → stop server → record `Visual-reference:` for Step 3); item 5 is the existing `Visual-reference:` note-for-Step-3 mechanism.
- `skills/init/bootstrap/step-11-impeccable-design-integration.md` — `/init`'s design-integration step (writes the `design-integration` flag; the natural home for a genesis-moment recommendation).
- `skills/design-wrapper/SKILL.md` — `## When to Use` caller list, `## Next Actions` table + `AskUserQuestion` options (rendered only on direct user invocation), Component-Skill Contract (`--source <parent-skill>` for standalone callers with no `$PIPELINE_RUN_DIR`).
- `skills/design-wrapper/impeccable-plugin.md` — Layer 0's `hasDesign`/`designPath` signals: the canonical answer to "does this project have a DESIGN.md," which #377's scope resolution consumes (with a direct file-existence fallback when Layer 0 degraded).
- `skills/design-wrapper/command-map.md` — per-command categorization of every Impeccable command the wrapper knows.
- `docs/skill-graph.md` — the single home for inter-skill relationship edges.
- After #377/#378: `modes/explore.md` complete with both scopes; documented ok shapes — identity: `{scope: "identity", chosen_world, visual_reference: "<path>" | null, design_md: "seeded" | "declined"}`; layout: `{scope: "layout", chosen_world, visual_reference: "<path>" | "declined"}`.

## Deliverables

- [ ] `skills/specify/design-pre-steps.md` Step 2.5b-ii: a pre-check on the existing offer, inside the confirmed-brief guard. Resolve the scope **once, on the /specify side, using the same signal the mode uses** (Layer 0 `hasDesign` per `impeccable-plugin.md`, direct DESIGN.md existence check as the degraded fallback) and **pass it explicitly** — the invocation carries `--scope`, so the mode's own auto-resolution never runs on this path and the two sides cannot disagree.
  - **Absent (identity branch):** replace the single-scaffold offer with the identity tournament. Call `AskUserQuestion` with `question`: `"No design identity is locked yet (no DESIGN.md). Want to explore competing visual identities for {primary surface} in the browser before decomposition?"`, `header`: `"Design identity"`, options: 1 — `label`: `"Yes — run the worlds tournament (Recommended)"`, `description`: `"/claude-tweaks:design-wrapper explore --scope identity --source specify — compare rendered identities, lock the pick into DESIGN.md"`; 2 — `label`: `"Skip"`, `description`: `"Proceed to decomposition; the current single-scaffold exploration is also skipped this run"`. On a pick (`design_md: "seeded"`), note the returned `visual_reference` path for Step 3's `Visual-reference:` line via item 5's existing mechanism.
  - **Present (layout branch):** offer the layout tournament ahead of `live`. Call `AskUserQuestion` with `question`: `"Want to compare rendered layout variants of {primary surface} (identity held fixed) before I build it for real?"`, `header`: `"Layout variants"`, options: 1 — `label`: `"Yes — run the layout tournament (Recommended)"`, `description`: `"/claude-tweaks:design-wrapper explore {surface-topic} --scope layout --source specify — pick a composition, then optionally tune it with live"`; 2 — `label`: `"Skip to single-scaffold live"`, `description`: `"Today's behavior: one scaffold + /claude-tweaks:design-wrapper live"`. The invocation passes the `<surface-topic>` argument composed from the brief (surface name + content requirements, per #378's input contract). On a pick, offer `live` on the winner by reusing item 1's steps 2-4 with `SCAFFOLD_URL` pointed at the returned `visual_reference` path — step 1's scaffold generation is skipped; then item 5 records that same path.
  - Both branches stay interactive-only, decomposition-mode-only, web-only, and inside the confirmed-brief guard, exactly as the step is today. Any `{skipped}` return from `explore` falls through to today's single-scaffold behavior — a skip never removes the existing path.
- [ ] `skills/init/bootstrap/step-11-impeccable-design-integration.md`: when design integration is enabled on a web-frontend project with no `DESIGN.md`, the step's summary/next-actions output recommends `/claude-tweaks:design-wrapper explore` as the genesis move — recommendation text only, never an invocation.
- [ ] `skills/design-wrapper/SKILL.md`: `## When to Use` gains the two caller bullets (`/claude-tweaks:specify` invokes `explore` from Step 2.5b-ii's pre-check; `/claude-tweaks:init` recommends it at Step 11); `## Next Actions` table + options gain the two ok-shape rows, **scoped to direct standalone invocation only** (the table's existing rendering rule; `/specify` consumes the return shape itself) — identity pick (`design_md: "seeded"`) → `/claude-tweaks:specify` (direction locked; brainstorm/specify against it); layout pick (`visual_reference` set) → `/claude-tweaks:specify` (winner carried as `Visual-reference:`).
- [ ] `skills/design-wrapper/command-map.md`: verify `document` has a categorization row covering the `--seed` usage. Absent → add one; present and consistent with the mode file → leave as-is; present with a value that contradicts the mode file's usage (e.g. categorized `never`) → resolve the contradiction in this record rather than shipping both. Whatever categorization inspection lands on is encoded, not left open.
- [ ] `docs/skill-graph.md`: the new edges — `/specify` → design-wrapper `explore` (Step 2.5b-ii pre-check), `/init` ⇢ design-wrapper `explore` (recommendation only) — following the file's existing edge style for upstream/`Impeccable` references.

## Acceptance Criteria

1. `grep -n "explore" skills/specify/design-pre-steps.md` shows the pre-check in Step 2.5b-ii with both branches, and the step retains its interactive-only, decomposition-mode-only, and native-surface-skip statements unmodified in meaning.
2. The pre-check text sits inside Step 2.5b-ii's confirmed-brief guard — the guard sentence ("Runs only when Step 2.5b's shape pre-step actually produced a confirmed brief") still precedes it and no new path reaches the tournament from auto mode or shaping mode (verify by reading the step's control flow, not just by grep).
3. Both `explore` invocations in `design-pre-steps.md` pass `--scope` and `--source specify` explicitly, and the layout invocation passes a `<surface-topic>` argument — `grep -n "\-\-scope" skills/specify/design-pre-steps.md` shows both.
4. Every skill reference inside actionable instruction text added by this record uses the fully-qualified form — `grep -n "/claude-tweaks:design-wrapper explore" skills/specify/design-pre-steps.md skills/init/bootstrap/step-11-impeccable-design-integration.md` returns at least one match per file.
5. `skills/init/bootstrap/step-11-impeccable-design-integration.md` contains the recommendation gated on no-`DESIGN.md`, and contains no `Skill` tool invocation of the mode.
6. `grep -n "explore" docs/skill-graph.md` shows the `/specify` and `/init` edges.
7. `skills/design-wrapper/SKILL.md`'s Next Actions covers both ok shapes (rows resolvable for `design_md: "seeded"` and for a returned `visual_reference`), and the rows are reachable only via the direct-invocation rendering rule.
8. `grep -in "seed" skills/design-wrapper/command-map.md` shows the `document`/`--seed` categorization row this record verified or added.
9. **Return-shape re-verification:** before building, re-read the shipped `modes/explore.md` return-shapes block and confirm it matches the shapes this record's branches consume (`design_md`, `visual_reference`); on mismatch, stop and reconcile with #377/#378's implementers rather than building against the assumed shapes.
10. `npm test` passes.

## Technical Approach

All edits are markdown-instruction edits in existing files; no new files. The 2.5b-ii pre-check branches before the current offer text and reuses item 5's existing `Visual-reference:` note-for-Step-3 mechanism rather than inventing a second write path; the layout branch's `live`-on-winner reuses item 1's serve/live/cleanup steps with generation skipped. The explore invocations pass `--source specify` (standalone `/specify` has no `$PIPELINE_RUN_DIR`; same pattern as `/visual-review`'s `--source` usage documented in the wrapper's Component-Skill Contract).

### Data / API Surface

No new shapes. Consumes #377/#378's documented return shapes (re-verified per AC 9); writes nothing new — `Visual-reference:` persistence rides Step 2.5b-ii item 5's existing mechanism.

### Key Files

- `skills/specify/design-pre-steps.md` — Step 2.5b-ii pre-check (both branches, literal question copy above)
- `skills/init/bootstrap/step-11-impeccable-design-integration.md` — genesis recommendation
- `skills/design-wrapper/SKILL.md` — When to Use bullets, Next Actions rows
- `skills/design-wrapper/command-map.md` — `document --seed` categorization verify/add
- `docs/skill-graph.md` — edges

## Gotchas

- Scope is resolved once on the `/specify` side and passed via `--scope` — never let the mode re-derive it on this path; two independent reads of the same filesystem fact is exactly the disagreement window this design closes. Standalone invocation keeps the mode's own auto-resolution.
- `explore` skips must fall through gracefully: on `{skipped}` (Impeccable absent, off-pin, kill-switch, native), Step 2.5b-ii continues with today's behavior — a skip never removes the existing single-scaffold path.
- The wrapper's Next Actions table renders only on direct user invocation (Component-Skill Contract) — when `/specify` is the caller, it consumes the return shape itself; don't add caller-facing behavior to the Next Actions rows.
- `/init` recommends, never invokes: `explore` needs a human in a browser, and `/init` may run in cloud/routine contexts where none exists.
- Edges once, in `docs/skill-graph.md` only — adding a "called by /specify" line to the wrapper's SKILL.md reintroduces the bidirectional-drift defect the graph file exists to prevent (When to Use bullets describe *when*, not graph edges; follow the existing bullets' style).
- Describe list sizes by reference, not literal counts, in every touched table (CLAUDE.md cardinality rule).

## Decision Rationale

See #376 (parent) Decision Rationale.

<!-- work-fingerprint: explore-mode:design-wrapper-explore-mode-entry-points-and-skill-graph-wir -->
