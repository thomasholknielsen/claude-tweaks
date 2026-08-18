---
record: 396
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---

# 396: Trim oversized per-invocation bodies: design-wrapper, demo, browse, challenge

Surface: backend

## Current State

Four skills carry avoidable per-invocation weight (2026-08-14 audit): `design-wrapper/SKILL.md` 38.8KB (40KB ceiling) — its detection layers (~lines 91–169) and output contract (~210–240) duplicate `_shared/design-wrapper-handling.md`, the file that exists to be that contract; `demo/SKILL.md` 37.8KB — Step 1's three entry paths (~lines 45–201, 35% of the body) are extraction candidates and "The design contract this was built against" (~221–263) duplicates `_shared/design-contract.md`; `browse/SKILL.md` ~lines 105–145 are a 41-line verbatim copy of `_shared/subagent-output-contract.md`'s Template A/B, which line 111 also cites by name; `challenge/SKILL.md` lines 71–117 (47 of 147) are seven debiasing lenses that framing-check does not use (its own line 73 says so) — loaded on every `/specify` record shaping.

## Deliverables

- design-wrapper: replace genuinely-duplicated detection/output-contract text with references to `_shared/design-wrapper-handling.md`; target roughly −40% body.
- demo: extract Step 1's entry paths to a sub-file; replace the design-contract section with a reference to `_shared/design-contract.md`.
- browse: remove the inline Template A/B copy in favor of the existing citation — subject to the Gotcha below.
- challenge: move the seven lenses to `skills/challenge/lenses.md`, loaded only by `--lens` mode.

## Acceptance Criteria

- All four SKILL.mds land under ~30KB with no procedure step lost — every moved block reachable from its mode/step pointer.
- No second copy of any moved/deduped block survives (grep shown — [IL-93] class).
- `/specify`'s framing-check path loads challenge without the lenses; `--lens` mode still resolves all seven.
- `docs/skill-graph.md` and `docs/plugin-structure.md` sub-file tables updated.

## Technical Approach

One skill per commit, each independently verifiable; read `docs/skill-authoring.md` first. For design-wrapper, diff the candidate blocks against `_shared/design-wrapper-handling.md` before deleting — confirm duplication vs. deliberate divergence per block, don't trust the audit's line ranges wholesale.

## Gotchas

- browse's inline templates may be operative, not decorative: the subagent contract requires output templates inlined verbatim in dispatch prompts (agents can't follow file references). Verify whether browse's dispatch procedure treats the inline block as the template source; if so, restructure to "read `_shared` file, then inline into the prompt" rather than deleting.
- demo and design-wrapper have the same near-ceiling class as #333's flow/dispatch scope — coordinate; flow and dispatch belong to #333, not here.
- design-wrapper has zero eval scenarios — no safety net beyond the grep/diff checks; be conservative about content that looks duplicated but carries local qualifiers.

## Original request

Trim oversized per-invocation bodies: design-wrapper, demo, browse, challenge

**Related:** #333, #204

Context: Bloat audit: design-wrapper (38.8KB) and demo (37.8KB) sit just under the 40KB ceiling; browse carries a 41-line verbatim copy of the subagent output contract it also cites by name; 47 of challenge's 147 lines are static lenses no mode in the file uses.

Scope: dedupe design-wrapper's detection/output-contract vs _shared/design-wrapper-handling.md; extract demo's Step 1 entry paths + design-contract section; delete browse's inline copy; move challenge's lenses to a lazy sub-file.
