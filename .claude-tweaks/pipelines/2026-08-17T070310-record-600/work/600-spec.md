---
record: 600
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
fingerprint: design-critique-dispatch:design-critique-dispatch-docs-skill-graph-edges-plugin-struc
blocked-by: [276, 530, 560, 598, 599]
surface: backend
---
# 600: Design critique dispatch docs — skill-graph edges, plugin-structure, help reference, Subagent Contract site list

Surface: backend

## Overview

Record the new relationships the design-critique dispatch introduces in the one place every cross-skill edge is stated — `docs/skill-graph.md` — and refresh the two reference surfaces that describe design-wrapper's roster (`docs/plugin-structure.md`, `skills/help/reference-card.md`). Per CLAUDE.md's cross-reference rule, an edge is stated **once**, in the skill graph, never restated inside a `SKILL.md`; this record is where those edges land, after the behavior they describe has shipped.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No behavioral change to any skill file — docs and reference tables only.
- No CLAUDE.md edit beyond one parenthetical — the always-loaded file is at its line budget and the Subagent Contract paragraph already covers "when adding a new dispatch site, follow the full pattern"; the design-critique dispatch is one more site, not a new rule.
- No terminal-track docs — #601 owns its own docs edges.
- No `docs/skill-graph.md` row *for* `critics.md` itself: the graph records **cross-skill** relationships; `critics.md` is a sub-file of design-wrapper read only by design-wrapper's own `review` mode, so there is no edge to state (same reason `native-routing.md` and `command-map.md` have no rows).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #598 | Review-mode Step 3.8 critic dispatch | edges describe it — build after it merges |
| #599 | Decisions pushback routing + polish three-way consumption | edges describe it — build after it merges |
| #530 | Routine indirection docs — skill-graph edges, help, plugin-structure, negative sweep | in progress on all three docs files — land after it |
| #276 | routine fleet status and off | in progress on `docs/skill-graph.md` and `skills/help/reference-card.md` — land after it |
| #560 | merge-verification: merge-site consumers gate on CI | in progress on `docs/skill-graph.md` — land after it |

Native Blocked-by links on all five enforce this. **Pickup step, mandatory:** before writing any row, re-read the merged `skills/design-wrapper/modes/review.md` (actual step numbers — 3.8, 5.5 — and the `craft_critics`/`decisions_staged` field names), `skills/design-wrapper/modes/polish.md` (the three-way table's exact wording), and `bin/lib/policy-schema.js` (the exact key `design.critique` and its enum), and transcribe from those files — never from this record's snapshot of what #598/#599 planned. Every deliverable below that quotes a step number or field name is to be verified against the shipped file first.

## Current State

- `docs/skill-graph.md` — per-skill sections (`## design-wrapper`, `## flow`, `## review`, `## wrap-up`) each a `| Target | Relationship |` table; `_shared/design-craft.md` already has edge rows under `build`, `design-wrapper`, `flow`, and `visual-review` — the shape to mirror.
- `docs/plugin-structure.md` — per-skill sub-file table (the `_shared` row lists `design-craft.md` with a one-line description; the design-wrapper row lists its sub-files — `critics.md` was added there by #597 with its own one-line description).
- `skills/help/reference-card.md` — per-skill argument/mode reference; design-wrapper's row lists modes and their governing flags.
- `CLAUDE.md` Subagent Contract paragraph — enumerates dispatch sites ("Used by `/browse`, `/dispatch` … `/visual-review`"); design-wrapper's `review` mode Step 3.8 is now such a site.

## Deliverables

- [ ] `docs/skill-graph.md` `## design-wrapper` section: (a) new row, target `_shared/subagent-output-contract.md`: "`modes/review.md` Step 3.8 dispatches one contract subagent per triggered project-local craft critic (Template A + `Target` column, Standard profile, full contract — not the third-party exemption Step 3.7 uses)"; (b) extend the existing `_shared/design-craft.md` row with one clause: "`modes/review.md` Step 3.8 is a review-time critique consumer: it resolves critic skills via this contract's lookup and inlines the decisions layer so critics can answer conformance and pushback"; (c) new row, target `/flow`: "`review` mode Step 5.5 stages `decisions`-targeted critic findings to `{run-dir}/staged/design-decision-*.md` for the Wrap-Up Review Console when `$PIPELINE_RUN_DIR` is set"; (d) new row, target `bin/resolve-policy.js` (or however the file already names policy reads — mirror an existing resolver row): "`review` mode reads `design.critique` via the resolver to gate critic dispatch."
- [ ] `docs/skill-graph.md` `## flow` section: extend the existing `_shared/design-craft.md` row (polish-execution) with the clause: "the refinement-set dispatch prompt additionally inlines cached `craft-critic` code findings from review mode as known craft issues — context, never command selection."
- [ ] `docs/skill-graph.md` `## review` section: add/extend the design-wrapper row: "Step 6.5's Design Quality section renders `craft-critic` code findings in the table (`Source: critic:{provider}`) and `decisions` findings under a Decisions sub-heading with their `Remedy:` line; standalone runs render, in-run runs stage."
- [ ] `docs/skill-graph.md` `## wrap-up` section: if that section enumerates staged kinds the Review Console reads (fully or partially), add one row noting `staged/design-decision-*.md`; if it says "every file under `staged/`" generically with no enumeration, add nothing and say so in the commit message.
- [ ] `docs/plugin-structure.md`: the `_shared` row's `design-craft.md` description gains "…and the review-time critic roster in `skills/design-wrapper/critics.md` resolves through it".
- [ ] `skills/help/reference-card.md`: design-wrapper's `review` mode line notes it is governed by `design.critique` (`off|auto|full`).
- [ ] `CLAUDE.md` Subagent Contract paragraph "Used by …" list: add `/design-wrapper` (`review` mode Step 3.8 — craft critics) — one parenthetical, no new sentence. Verify the file stays within its 150-line budget (`wc -l CLAUDE.md`; `tests/claude-md-budget.test.js` pins it).

## Acceptance Criteria

1. `grep -c "critic" docs/skill-graph.md` ≥ 4, with at least one match in each of the `## design-wrapper`, `## flow`, and `## review` sections (verify by `sed -n` on the section ranges).
2. `grep -n "design.critique" docs/skill-graph.md skills/help/reference-card.md` returns ≥1 line in each.
3. `grep -n "critics.md" docs/plugin-structure.md` returns a row with a non-empty description.
4. `grep -n "design-wrapper" CLAUDE.md` shows it in the Subagent Contract "Used by" list, and `node --test tests/claude-md-budget.test.js` passes.
5. Every step number and field name quoted in the new rows matches the shipped files: `grep -n "Step 3.8" skills/design-wrapper/modes/review.md` and `grep -n "Step 5.5" skills/design-wrapper/modes/review.md` and `grep -n "design.critique" bin/lib/policy-schema.js` all return a line.
6. `npm test` passes (skill-graph and plugin-structure conformance tests are repo-wide).
7. `git diff --stat` touches only `docs/skill-graph.md`, `docs/plugin-structure.md`, `skills/help/reference-card.md`, `CLAUDE.md`.

## Technical Approach

Additive table rows and one-clause extensions of existing rows, mirroring the `_shared/design-craft.md` edge rows already present. No restructuring.

### Data / API Surface

None.

### Key Files

- `docs/skill-graph.md` — design-wrapper, flow, review (and possibly wrap-up) sections
- `docs/plugin-structure.md` — `_shared` row
- `skills/help/reference-card.md` — design-wrapper `review` mode line
- `CLAUDE.md` — one parenthetical in the Subagent Contract "Used by" list

### Package Dependencies

None.

## Gotchas

- State each edge once. If a relationship is already implied by an existing row, extend that row with a clause rather than adding a near-duplicate row — the file's whole reason to exist is de-duplication.
- Five records are Blocked-by prerequisites because they touch the same docs files concurrently; at pickup, `git log --oneline -5 -- docs/skill-graph.md` and rebase before editing.
- CLAUDE.md is always-loaded and budget-pinned; a parenthetical only. If the "Used by" sentence would wrap past the budget, shorten an existing entry's parenthetical rather than adding a line.
- Cardinality rule: never write "N dispatch sites" or "N critics" as a literal count anywhere in these docs — refer to the table.

<!-- work-fingerprint: design-critique-dispatch:design-critique-dispatch-docs-skill-graph-edges-plugin-struc -->
