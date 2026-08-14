# design-wrapper explore mode — entry points and skill-graph wiring (#379)

> **For agentic workers:** execution strategy is owned by `/claude-tweaks:build` — ignore this block.

**Spec:** `.claude-tweaks/pipelines/2026-08-14T065616-spec-377-378-379/spec-379/work/379-spec.md` (record #379)

**Goal:** wire `explore` into the lifecycle — `/specify` Step 2.5b-ii scope-resolved pre-check (both branches, literal question copy in the spec), `/init` Step 11 genesis recommendation, wrapper When-to-Use bullets + Next-Actions rows, `command-map.md` `document --seed` categorization, `docs/skill-graph.md` edges. Markdown-instruction edits only; no new files.

**Verified current state (2026-08-14, this worktree, post-#377/#378):**
- `skills/specify/design-pre-steps.md` Step 2.5b-ii (lines 41-63): guard sentence at line 43 ("Runs only when Step 2.5b's shape pre-step actually produced a confirmed brief..."); native-surface skip paragraph at line 45; the offer `AskUserQuestion` at 49-53; the 5-item procedure at 57-63 (item 5 = the `Visual-reference:` note-for-Step-3 mechanism).
- `skills/init/bootstrap/step-11-impeccable-design-integration.md`: "For option 1 only — generate design context files" block ends at line 42 (writes PRODUCT.md + DESIGN.md); re-run behavior at line 66. The genesis-recommendation gate: design integration enabled + frontend + no `DESIGN.md` — the natural insertion is after the kill-switch-flag block, as recommendation text in the step's summary/next-actions output.
- `skills/design-wrapper/SKILL.md` (38,015 B — must stay under 40,960): `## When to Use` bullets end with the explore standalone bullet; `## Next Actions` table (return → follow-up) + options list below it; Component-Skill Contract documents `--source <parent-skill>`.
- `skills/design-wrapper/command-map.md` line 41: `| document | Never (in flow) | Manual standalone only |` — contradicts explore Lock-in's interactive `document --seed` invocation unless the Notes cell is extended (the spec's "resolve the contradiction" branch).
- `docs/skill-graph.md`: per-skill sections with per-related-skill rows; canonical + "Reciprocal of..." pattern (e.g. `## design-wrapper`'s `/demo` row at line 137). The `/specify` section's `/design-wrapper` row (line 338) already covers shape + live + metadata lines — extend it for the 2.5b-ii explore pre-check rather than adding a duplicate row. Check whether an `## init` section exists; add the `/init` ⇢ explore recommendation edge in the style the file already uses for recommendation-only links.
- **AC 9 reconciliation (done at planning):** shipped `modes/explore.md` shapes — identity ok carries `design_md: "seeded" | "declined"` + `visual_reference: "<path>" | null`; layout ok carries `visual_reference: "<path>"` always (the spec's `| "declined"` sentinel was dropped in #378 as unreachable — decline is a skip; deviation staged). #379's branches consume `design_md: "seeded"` and pick-time `visual_reference` paths only, and route every `{skipped}` to fall-through — fully compatible. Build against the SHIPPED shapes.

## Pinned semantics (implementers do not re-litigate)

- The spec's Deliverables carry the LITERAL question/option copy for both branches — use it verbatim.
- Scope resolved once on the /specify side (Layer 0 `hasDesign` per `impeccable-plugin.md`; degraded fallback = direct `DESIGN.md` existence check) and passed via `--scope`; both invocations carry `--source specify`; the layout invocation carries the `<surface-topic>` composed from the brief (surface name + content requirements per the shipped layout Input contract).
- Identity branch replaces the single-scaffold offer; on pick (`design_md: "seeded"`) note `visual_reference` for item 5's mechanism; `live` intentionally NOT re-offered — state the intent in the branch text.
- Layout branch offers the tournament ahead of `live`; option 2 = today's single-scaffold behavior; on pick, offer `live` on the winner via item 1's steps 2-4 with `SCAFFOLD_URL` = the returned `visual_reference` (step 1 generation skipped), then item 5 records the same path.
- Both branches: interactive-only, decomposition-mode-only, web-only, inside the confirmed-brief guard; any `{skipped}` falls through to today's behavior.
- `/init`: recommendation text only, gated on enabled + frontend + no `DESIGN.md`; never a Skill-tool invocation.
- Wrapper SKILL.md: two When-to-Use caller bullets (describe *when*, not graph edges); two Next-Actions rows (direct-invocation rendering rule only). Keep total size under 40,960 B — verify with `wc -c` after editing.
- `command-map.md`: extend the `document` row's Notes cell to name the explore Lock-in `--seed` usage (interactive, after an explicit pick, never in flow) — categorization stays out-of-flow.
- Skill-graph: extend `/specify`'s existing `/design-wrapper` row; add design-wrapper-section reciprocals per file convention; `/init` edge marked recommendation-only (⇢).

## Task 1: `skills/specify/design-pre-steps.md` — Step 2.5b-ii pre-check

Both branches per pinned semantics; guard/native-skip/mode statements retain meaning (AC 1-3).

**Verify:** `grep -n -- "--scope" skills/specify/design-pre-steps.md` shows both invocations; `grep -c "claude-tweaks:design-wrapper explore" skills/specify/design-pre-steps.md` ≥ 2; read the step's control flow for AC 2.

## Task 2: init step-11 + wrapper SKILL.md + command-map + skill-graph

Four small edits per pinned semantics (AC 4-8).

**Verify:** the spec's AC 4/5/6/7/8 greps; `wc -c skills/design-wrapper/SKILL.md` < 40960.

## Final Verification (central)

1. `npm test` — zero failures.
2. Full AC walk 1-10 (AC 9 already reconciled above; AC 10 = the suite).
