---
record: 377
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: explore-mode:design-wrapper-explore-mode-identity-scope-genesis-worlds-to
surface: backend
---
# 377: design-wrapper explore mode: identity scope (genesis worlds tournament)

Surface: backend

## Overview

Create the `explore` mode in `/claude-tweaks:design-wrapper` and implement its `identity` scope: the genesis worlds tournament. At a project's genesis moment — `PRODUCT.md` exists, no `DESIGN.md` locked — the mode deals competing visual identities via upstream's own machinery, renders the presented directions as skins over one shared scaffold of the primary surface, lets the user compare them in the browser, and locks the pick by routing through upstream's `document --seed` so upstream writes `DESIGN.md`, never the wrapper.

Division of labor (load-bearing): **upstream deals, this mode derives and renders.** `concept-seed.mjs` assigns and deals; its output is a single prose instruction block (`renderConceptSeed`) that tells the *calling agent* how to derive grounded directions, fuse dealt challengers, and weigh them — it does not emit per-world card payloads. This mode is that calling agent: it follows the deal's instructions, then synthesizes the clean-room inputs its render builders need. The dealing catalog, exclusion rules, and canon semantics stay upstream's; the wrapper never maintains a parallel catalog and never filters a deal.

**Complexity:** Medium
**Estimated tasks:** 6-8

## Non-Goals

- The `layout` scope (established-world composition tournament) — #378. This record's scope resolution must still *route* to it (see Deliverables), but its procedure section lands there. The optional `<surface-topic>` argument in the mode contract exists for that scope and is ignored by this one.
- Entry-point wiring in `/claude-tweaks:init` and `/claude-tweaks:specify` — #379.
- Any auto-mode branch. `explore` is interactive-only by construction, like `live`.
- Invoking upstream `init` on the mode's own initiative — a missing `PRODUCT.md` is offered once interactively, never silently repaired (see Deliverables).
- Delegating the verdict to upstream's `serve-question.mjs` decision page (rejected: card-oriented payload, adds an upstream coupling for no fidelity gain; `AskUserQuestion` is the plugin's interaction convention).
- Rendering upstream's quality-bar boards alongside the scaffold (deliberately deferred until dogfooding shows scaffold quality carrying the decision wrongly).

## Prerequisites

None — first sub-issue of this decomposition.

## Current State

- `skills/design-wrapper/SKILL.md` — the wrapper: mode roster in the Input table, universal preconditions (Layer 1 kill-switch, Layer 2 body-metadata, track resolution, Layer 3 sniff), availability-check table with three artifact classes (LLM-commands by skill resolution; bundled scripts at exact pin via `resolveImpeccablePlugin`; the CLI), output contract, anti-patterns table.
- `skills/design-wrapper/modes/` — one file per mode; `doctor.md` is the closest structural precedent (no target argument, Layer 2/3 structurally inapplicable, bundled-script availability at exact pin); `live.md` is the interactive-only precedent (no auto-mode branch, native-track skip, ephemeral-server target).
- `skills/design-wrapper/impeccable-plugin.md` — the shared `resolveImpeccablePlugin` resolver with a per-consumer script-path table (currently Layer 0 → `context-signals.mjs`, `doctor` → `doctor.mjs`), and Layer 0's signal contract including `hasDesign`/`designPath` — the canonical answer to "does this project have a DESIGN.md."
- `skills/specify/design-pre-steps.md` Step 2.5b-ii — existing single-scaffold conventions this mode reuses: disposable static HTML under `docs/plans/`, realistic placeholder content, ephemeral serving per `_shared/dev-url-detection.md` (including its Cleanup — Standalone rule).
- `tools/upstream-drift/manifest.yml` — the `impeccable-plugin` dependency entry (pinned `4.0.2`), assertions of shape `{file, claims, upstream-path, must-match}`.
- Upstream at the pinned 4.0.2 (verified 2026-08-14, including a read of the installed script source): `skills/impeccable/reference/new-work.md` carries the dealing flow ("Re-roll eliminates every direction already shown"; "after two consecutive re-rolls, ask what quality is missing"; the canon standing exit that is "the user's door, never yours"; the presentation rule — the assigned direction plus "the one or two fused challengers that survived the weighing"); `reference/document.md` seed mode reuses a completed workshop ("use its chosen direction directly. Do not ask again"); `scripts/concept-seed.mjs` supports `--scope direction --mode <mode>`, `--candidate-count <n>` (bounded small, with a script default), `--reroll <n>`, `--from <key>`, `--chosen <id>`, and renders one instruction block for the calling agent rather than discrete per-world payloads. "Steer" is conversational — upstream's re-roll carries "an optional one-line steer"; there is no steer flag on the script.
- Tests: `npm test` includes `tools/upstream-drift/tests/` (manifest schema + assertion checks).

## Deliverables

- [ ] `skills/design-wrapper/modes/explore.md` (new) — mode contract: optional `<surface-topic>` argument (consumed only by the layout scope; ignored here), `--scope identity|layout` flag, `--source <parent-skill>`; scope-dependent return shapes with the identity shape being `{mode: "explore", result: "ok", scope: "identity", chosen_world: "<display name>", visual_reference: "<path to the kept scaffold + winning skin>" | null, design_md: "seeded" | "declined"}` (`visual_reference` is the on-disk survivor callers may persist as a `Visual-reference:` line; `null` only when the pick succeeded but the artifact write failed — name that edge in the mode file).
- [ ] Preconditions in the same file: Layer 1 applies; Layers 2 and 3 structurally inapplicable, `doctor`-style, with the reasoning stated; track resolution runs and the native track skips with `{skipped: "native surface — explore is web-only"}`; availability = exact-pin `resolveImpeccablePlugin`, `doctor`-class.
- [ ] Scope resolution in the same file: read Layer 0's `hasDesign` signal (per `impeccable-plugin.md`); when Layer 0 degraded, fall back to a direct existence check for `DESIGN.md` at the project root. `hasDesign` false → `identity`; true → `layout` (route to the layout section — until #378 lands, that route returns `{skipped: "layout scope not yet implemented — see #378"}`). An explicit `--scope` from the caller wins over auto-resolution. Explicit `--scope identity` while `hasDesign` is true **and the file is coherent** → `{skipped: "design identity already locked — route identity replacement through upstream new-work explicitly"}`; coherent means the file declares an actual identity (at minimum a palette and a typography direction, the identity-bearing sections upstream's `document.md` writes) — an empty or stub file is not coherent, and ambiguity resolves to coherent (toward the skip, never toward casually re-dealing a locked identity). `PRODUCT.md` missing → offer once via `AskUserQuestion` to run `/impeccable:impeccable init`; on decline, `{skipped: "no PRODUCT.md — run /impeccable:impeccable init first"}`. Never fabricate project context.
- [ ] The identity-scope procedure in the same file:
  1. **Deal and derive.** Run `concept-seed.mjs --scope direction --mode <mode>` (leave `--candidate-count` at the script default; `<mode>` is a real parameter — confirm the accepted value set against the script's argument parser during the build and state the selection rule the mode applies). Follow the returned instruction block as upstream directs: derive grounded directions, fuse each dealt challenger, weigh. The render set is the *presented* directions per upstream's own presentation rule — the assigned direction plus the one or two surviving fused challengers — never the full candidate list. Record the deal's id ↔ display-name mapping; carry the printed seed `key` and the reroll counter for the whole session.
  2. **Synthesize clean-room cards.** For each presented direction, this mode composes one self-contained direction card: display name, the complete graphic-system description (palette, type voice, material/component character, motion stance), and the product facts it needs — no sibling direction's content. Card isolation is this mode's responsibility; the deal output is one shared block and must not be handed to builders raw.
  3. **One markup, N skins.** Build one disposable semantic HTML scaffold of the primary surface from `PRODUCT.md` (+ the design doc/brief when one exists), following Step 2.5b-ii's conventions, saved under `docs/plans/YYYY-MM-DD-{feature}-explore/`, tokens referenced only via CSS custom properties. Each presented direction becomes exactly one CSS file; skins may restyle, never restructure.
  4. **Parallel skin builders.** One Task agent per presented direction under `_shared/subagent-output-contract.md`: Standard profile (fan-out — never Frontier), status line first, literal output template inlined in the mode file, clean-room input = the synthesized card + the shared markup path read-only. A `BLOCKED`/failed builder, or one that reports `DONE_WITH_CONCERNS` because its direction cannot be faithfully expressed as a pure restyle of the shared markup, renders as a **degraded variant slot**: still counted in the switcher's "1 / N" indicator, visibly naming the direction and the failure/concern, not pickable as a winner. Builders never restructure markup to compensate.
  5. **Compare.** Serve the explore directory ephemerally per `_shared/dev-url-detection.md`; a self-contained `index.html` switcher (full-viewport scaffold, docked "1 / N — {direction}" indicator, arrow-key/click cycling swapping only the skin stylesheet, no framework, no external assets).
  6. **Verdict.** One `AskUserQuestion` call site, reused per round: pick / reroll / steer / the canon standing exit listed last and never recommended. A reroll re-runs the deal with `--reroll <n>` and the carried `--from <key>` (exclusion of already-shown directions is upstream's, driven by those arguments); a steer is a reroll whose one-line steer text guides this mode's next fuse/weigh pass — there is no script flag for it. After two consecutive rerolls, ask upstream's "what quality is missing" question as a distinct one-off follow-up. Restate-vs-pointer boundary, stated in the mode file: semantics this mode acts on (the exclusion arguments, the two-reroll question, the canon exit, seed-key carrying) are restated in the procedure and each restatement is pinned by a manifest assertion below; everything else about dealing stays a pointer into upstream's references.
  7. **Lock-in.** On pick: pass `--chosen <id>` (the recorded id, not the display name), then invoke `/impeccable:impeccable document --seed` with the chosen direction in context — upstream writes `DESIGN.md`; this wrapper writes nothing outside `docs/plans/`. Keep the scaffold + winning skin (returned as `visual_reference`), delete losing skins. On exit-without-pick: delete the explore dir, stop the server, return a skip.
- [ ] The same-markup constraint stated as load-bearing in the mode file: it keeps the comparison about identities and makes reroll cheap — a reroll re-deals and re-skins, markup untouched.
- [ ] `skills/design-wrapper/SKILL.md`: `argument-hint` gains `explore [<surface-topic>]`; Input table gains the `explore` row; mode-specific precondition note (Layers 2/3 structurally inapplicable + scope-resolution summary, pointing at the mode file); availability-check table gains the `explore` row in the exact-pin bundled-scripts class; "When to Use" gains the standalone-invocation bullet; anti-patterns table gains two rows: invoking `explore` from auto mode or a `$PIPELINE_RUN_DIR`-set context (same reasoning as `live`), and the wrapper writing DESIGN.md itself (upstream `document --seed` is the only writer).
- [ ] `skills/design-wrapper/impeccable-plugin.md`: per-consumer script-path table gains `explore` → `scripts/concept-seed.mjs`.
- [ ] `tools/upstream-drift/manifest.yml`, three new assertions under the `impeccable-plugin` entry, each with `file: skills/design-wrapper/modes/explore.md`: (1) claims the seed path reuses a completed workshop choice without re-asking, `upstream-path: skills/impeccable/reference/document.md`, `must-match: "use its chosen direction directly"`; (2) claims reroll excludes already-shown directions, `upstream-path: skills/impeccable/reference/new-work.md`, `must-match: "Re-roll eliminates every direction already shown"`; (3) claims the direction-scope invocation exists, `upstream-path: skills/impeccable/scripts/concept-seed.mjs`, `must-match: "--scope direction"`.

## Acceptance Criteria

1. `skills/design-wrapper/modes/explore.md` exists and contains: the literal skip strings `design identity already locked` and `native surface — explore is web-only`, the literal layout stub skip citing `#378`, an explicit "interactive-only" statement with no auto-mode branch, the degraded-variant-slot specification (counted in the indicator, names the failure, not pickable), the restate-vs-pointer boundary rule, and a reference to `_shared/subagent-output-contract.md` with a literal inline output template for the skin builders.
2. The mode file's procedure states that the render set is the presented directions (assigned + surviving challengers), that the deal output is a single instruction block this mode segments into synthesized per-direction cards, that the seed `key` and reroll counter are carried across invocations, and that steer maps to a reroll (no script flag) — verifiable by reading the deal/derive and verdict steps.
3. `grep -n "explore" skills/design-wrapper/SKILL.md` shows the Input-table row, the argument-hint (including the optional `<surface-topic>`), the availability row, and both new anti-pattern rows (verify each edit landed by reading the diff, not by count).
4. `grep -n "concept-seed" skills/design-wrapper/impeccable-plugin.md` returns at least one match inside the per-consumer script-path table.
5. The drift auditor passes against the installed pin: `node --test tools/upstream-drift/tests/` succeeds with the three new assertions present, and each `must-match` string matches the installed 4.0.2 plugin file it targets.
6. `npm test` passes.
7. The mode file contains no bare `/{skill}` reference inside actionable instruction text — every skill reference in step bodies uses the fully-qualified `/claude-tweaks:{skill}` or `/impeccable:impeccable` form.

## Technical Approach

New mode file follows `modes/doctor.md`'s structure (When this runs / Preconditions / Procedure steps / Output to caller) with `modes/live.md`'s interactive-only framing. Give each procedure step a stable heading name (the layout scope in #378 reuses steps by heading, never by number). Scope resolution is a short table at the top of the Procedure.

### Data / API Surface

Return shapes (mode-specific fields; the wrapper's generic ok/skip contract is unchanged):

- ok (identity): `{mode: "explore", result: "ok", scope: "identity", chosen_world: "<display name>", visual_reference: "<path>" | null, design_md: "seeded" | "declined"}`
- skip shapes: the literal strings in AC 1, plus the standard availability/kill-switch skips from `SKILL.md`.

Upstream invocations (all at pinned 4.0.2, script resolved via `resolveImpeccablePlugin`):

- `node <plugin>/skills/impeccable/scripts/concept-seed.mjs --scope direction --mode <mode>` — first deal; `--candidate-count` left at script default
- same + `--reroll <n> --from <key>` — reroll/steer rounds (key carried by the mode)
- same + `--chosen <id> --from <key>` — on pick (id from the mode's recorded id ↔ name mapping)
- `/impeccable:impeccable document --seed` via the Skill tool — lock-in only, on pick

### Key Files

- `skills/design-wrapper/modes/explore.md` — new mode file (contract, preconditions, scope resolution, identity procedure)
- `skills/design-wrapper/SKILL.md` — Input row, argument-hint, precondition note, availability row, When to Use bullet, two anti-pattern rows
- `skills/design-wrapper/impeccable-plugin.md` — script-path table row
- `tools/upstream-drift/manifest.yml` — three assertions

### Package Dependencies

None new. Upstream Impeccable plugin pinned at 4.0.2 (existing pin, unchanged).

## Gotchas

- The plugin and the CLI are two independent version lines — all three assertions go under the `impeccable-plugin` manifest entry, never the `impeccable-cli` one.
- `resolveImpeccablePlugin` is the only sanctioned way to locate `concept-seed.mjs` — never glob the plugin cache directly, and never use skill-resolution availability for a bundled script (an off-pin plugin resolves the skill but may lack or change the script).
- Render the *presented* directions, never all candidates — `--candidate-count` (default is larger) sizes the deal, upstream's weighing sizes the presentation; conflating them balloons the fan-out.
- The deal output is one shared instruction block — handing it raw to builders leaks every sibling direction into every card and destroys the fan-out's independence. Synthesis (step 2) is what makes the clean room real.
- Do not restate upstream's dealing rules beyond the stated restate-vs-pointer boundary — pointer-plus-assertion is the pattern (#140's delegate-or-verify thesis); the manifest assertions are what keep the restatements honest.
- Do not state relationship edges to caller skills in `SKILL.md` — edges live once in `docs/skill-graph.md` and are wired by #379.
- Describe the mode roster by reference to the Input table, never as a literal count (CLAUDE.md cardinality rule, `[IL-93]`).
- The switcher `index.html` must be fully self-contained: no CDN, no external fonts, no framework — a disposable artifact served from `docs/plans/`.
- `document --seed` must be invoked only after an explicit pick — "no pick" is a skip, and the wrapper never writes or edits `DESIGN.md`/`PRODUCT.md` itself (same discipline as `doctor`'s never-`--fix` rule).
- Scaffold content at genesis is partly invented — the mode's offer text must say so, setting expectations before the user compares variants.
- Coherence ambiguity resolves toward the locked-identity skip, never toward re-dealing — mirror of the wrapper's ambiguity-resolves-to-allow posture, pointed in the conservative direction for a destructive-feeling action.

## Decision Rationale

See #376 (parent) Decision Rationale for the full set (fidelity choice, rejected serve-question coupling, rejected upstream-`visualize` delegation, one-markup/N-skins rationale, deferred quality-bar boards).

<!-- work-fingerprint: explore-mode:design-wrapper-explore-mode-identity-scope-genesis-worlds-to -->
