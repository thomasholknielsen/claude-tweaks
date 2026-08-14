---
record: 378
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: explore-mode:design-wrapper-explore-mode-layout-scope-established-world-c
blocked-by: [377]
surface: backend
---
# 378: design-wrapper explore mode: layout scope (established-world composition tournament)

Surface: backend

## Overview

Implement the `layout` scope of `/claude-tweaks:design-wrapper explore`: the established-world composition tournament. An app whose visual identity is already locked in `DESIGN.md` needs a way to compare rendered composition/layout/interaction-framing variants of a **new** feature or page — colors, type, and component character held fixed. Upstream states this case verbatim: "Inside an established world, use its concept process only when composition or interaction remains materially open" (`reference/new-work.md`), and its `visualize.md` freezes identity for exactly this axis but probes it with image-generation raster comps. This scope is the HTML-rendered analog: interactive variants that demonstrate interaction framing and require no image generation.

The scope inverts the identity scope's constant: **one identity, N markups**. Each variant is a different composition of the same new surface — what is on the page, how it is arranged, where the primary action sits — all dressed in the established DESIGN.md tokens.

**Complexity:** Medium
**Estimated tasks:** 4-6

## Non-Goals

- Any change to the identity scope's procedure (#377's content stays as-is; this record only adds the layout section, swaps the scope-resolution route from the #378-citing skip to the real section, and extends the return-shapes block).
- Delegating to upstream `visualize` (rejected: raster comps cannot demonstrate interaction framing and require image generation; recorded in the parent's Decision Rationale).
- Editing `DESIGN.md` in any way — upstream's own rule for this axis: approval refines the task concept, never DESIGN.md.
- Backend-behavior variation. "Functionality variation" here means interaction framing and composition; variants that differ in actual backend behavior are spec territory, not scaffold territory. The mode file must state this limit **with a bright-line example pair** (allowed: the same save action framed as a modal vs an inline form — same behavior, different framing; forbidden: variants where one autosaves and one requires explicit save — different behavior).
- Entry-point wiring (#379).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #377 | design-wrapper explore mode: identity scope (genesis worlds tournament) | ready |

Build order is enforced by the native blocked-by link — this record edits the file #377 creates, so it must not start until #377 has merged.

## Current State

- After #377: `skills/design-wrapper/modes/explore.md` exists with mode contract (optional `<surface-topic>` argument reserved for this scope), preconditions, scope resolution (DESIGN.md present → routes to a stub skip citing this record), and the identity-scope procedure with **stable step headings** (deal-and-derive / synthesize-cards / scaffold / builders / compare / verdict / lock-in) that this record reuses by heading name, never by number.
- Upstream at the pinned 4.0.2 (verified 2026-08-14): `scripts/concept-seed.mjs` supports `--scope surface --mode <mode> --from <key>` (its own usage header shows `--mode operate` in the surface-scope example); it deals staging/composition challengers within a committed direction and returns a single instruction block for the calling agent, same output style as the direction scope. `reference/new-work.md`'s five-block direction contract names "the seed key the script printed" in its FORM block; `reference/visualize.md` holds the identity-frozen composition-probe rules this scope mirrors ("Keep DESIGN.md's palette, typography direction, material language, component character, imagery stance, and motion grammar fixed").
- `skills/specify/spec-template.md` documents `Visual-reference:` as a body-metadata line read by `/claude-tweaks:build`'s `design-prebuild.md`; `skills/specify/design-pre-steps.md` Step 2.5b-ii item 5 is the existing write-site pattern for it.
- `tools/upstream-drift/manifest.yml` — the `impeccable-plugin` entry, carrying #377's three assertions.

## Deliverables

- [ ] `skills/design-wrapper/modes/explore.md`: a `layout` scope section containing —
  - **Input contract:** the layout scope consumes the mode's `<surface-topic>` argument — free text naming the new surface plus one to three sentences of content requirements (what the page must contain, who uses it, the primary action). #379's caller supplies it; on standalone invocation with no argument, ask for it once via `AskUserQuestion` before dealing.
  - **Dealing:** `concept-seed.mjs --scope surface --mode <mode> --from <key>`. `<mode>` is a real parameter — confirm the accepted value set against the script's argument parser during the build and state the selection rule (which value fits which surface job); never hardcode one. `<key>` is the committed direction's seed key: resolve where upstream's `document --seed` output records it at the pinned 4.0.2 during the build and encode the actual field/location found. When zero candidates or **multiple ambiguous candidates** are found, fall back to dealing without `--from`, and state in the offer that challengers are dealt without the committed direction's seed — degraded, never fatal.
  - **Variant builders:** each receives the synthesized staging card (same synthesis responsibility as the identity scope — the deal output is one shared block), `DESIGN.md` read-only, and the `<surface-topic>` content requirements, and writes one markup file composing the surface differently. The inverted constraint stated as load-bearing, side-by-side with the identity scope's: **markups may not restyle** (no new palette, no new type voice, no new motif; upstream `visualize.md`'s frozen list is the reference), mirroring skins-may-not-restructure.
  - **Machinery reuse by heading:** the compare/verdict steps are reused from the identity section by their stable heading names with the substitutions enumerated explicitly — chief among them that the switcher cycles **whole markup documents** (swapping the displayed document, e.g. an iframe `src`), not stylesheets, since here the variants are different markups over one identity. Reroll/steer semantics unchanged (reroll excludes already-shown stagings; steer is a reroll with the steer text guiding the next fuse/weigh pass; the seed `key` is carried across rounds).
  - **Lock-in:** `DESIGN.md` untouched — keep the winning layout markup, delete losers, and return its path as `visual_reference` for the caller to write as a `Visual-reference:` body-metadata line (per `spec-template.md`; the caller writes the line, this mode only returns the path). **Decline:** exit-without-pick deletes the whole explore dir and stops the server, identical to the identity scope's decline path.
  - The bright-line functionality-limit paragraph from Non-Goals, with the example pair.
- [ ] Scope resolution in the same file: the DESIGN.md-present route now enters the layout section instead of returning the #378-citing skip.
- [ ] Return shape added to the return-shapes block: `{mode: "explore", result: "ok", scope: "layout", chosen_world: "<staging/challenger display name>", visual_reference: "<path>" | "declined"}`. `chosen_world` is deliberately scope-invariant naming (callers branch on `scope`, not on field names); state that in the block.
- [ ] `tools/upstream-drift/manifest.yml`, one new assertion under the `impeccable-plugin` entry: `file: skills/design-wrapper/modes/explore.md`, claims the surface-scope invocation exists, `upstream-path: skills/impeccable/scripts/concept-seed.mjs`, `must-match: "--scope surface"`.

## Acceptance Criteria

1. `skills/design-wrapper/modes/explore.md` contains a layout-scope section with the literal string `--scope surface` and a `--from <key>` resolution that **names the verified DESIGN.md field/location** the key is read from (validated during the build by round-tripping a real `document --seed` output at the pinned 4.0.2 — a recovery rule that merely exists but names an unverified field fails this criterion), plus the stated fallbacks (missing key and ambiguous candidates both deal without `--from`).
2. The identity-scope section is unchanged by this record: `git diff` for this record's change touches only the scope-resolution route, the new layout section, and the return-shapes block — no edits inside the identity procedure's steps.
3. The mode file states the markups-may-not-restyle constraint side-by-side with skins-may-not-restructure and names upstream `visualize.md`'s frozen-identity list as its reference.
4. The layout section's machinery reuse names identity steps by heading (no numeric step references), and explicitly states the switcher substitution (documents cycled, not stylesheets).
5. The layout lock-in path contains no write to `DESIGN.md` and returns `visual_reference` for the caller to persist — grep the layout section for `DESIGN.md` and confirm every mention is read-only or "untouched" phrasing.
6. The drift check suite (`node --test tools/upstream-drift/tests/`) passes with the fourth assertion present, and `--scope surface` matches the installed 4.0.2 `concept-seed.mjs`.
7. `npm test` passes.

## Technical Approach

Extend the existing mode file — no new files. The layout section reuses the identity section's compare/verdict machinery by explicit heading reference ("run steps {heading} through {heading} with these substitutions") with the substitutions enumerated in one list: builder input (staging card + DESIGN.md + content requirements), builder output (one markup file), switcher unit (documents, not stylesheets), lock-in (return `visual_reference`, no `document --seed`).

### Data / API Surface

- `node <plugin>/skills/impeccable/scripts/concept-seed.mjs --scope surface --mode <mode> --from <key>` (+ `--reroll <n>`, `--chosen <id>`) — resolved via `resolveImpeccablePlugin`, same as the identity scope; `<mode>` selection rule stated in the mode file after build-time verification.
- Return shape: `{mode: "explore", result: "ok", scope: "layout", chosen_world, visual_reference: "<path>" | "declined"}`.
- `Visual-reference:` line format: `Visual-reference: docs/plans/YYYY-MM-DD-{feature}-explore/{winning-markup}.html` — written by the caller, per `spec-template.md`'s existing field definition.

### Key Files

- `skills/design-wrapper/modes/explore.md` — layout section, scope-route swap, return-shapes block
- `tools/upstream-drift/manifest.yml` — one assertion

### Package Dependencies

None new.

## Gotchas

- The `--from <key>` seed-key location is the one unverified upstream fact in this decomposition — verify against the installed 4.0.2 (where does `document --seed`'s DESIGN.md record the FORM seed key, if at all?) before wording the recovery rule; encode what is found, and route both the zero-candidate and multiple-candidate cases to the no-`--from` fallback. Do not guess a DESIGN.md field name.
- `--mode` is a real parameter with at least `persuade`/`operate` in upstream's usage examples — confirm whether the set is fixed or open and encode the selection rule; a hardcoded value silently misclassifies every surface of the other job type.
- The identity/layout inversion is easy to state asymmetrically — keep the two constraint statements (skins-may-not-restructure / markups-may-not-restyle) side-by-side in the file so drift in one is visible against the other.
- The manifest assertion goes under `impeccable-plugin`, never `impeccable-cli` (two independent version lines).
- Losing markups are deleted on pick, but the *winning* one must survive — it is the `Visual-reference:` target and `/claude-tweaks:build`'s `design-prebuild.md` reads that path later; deleting it breaks the downstream chain.
- Heading-based reuse is what keeps this section alive across future edits to the identity section — a numeric "steps 4-6" reference goes silently stale on any renumbering and no test catches it.

## Decision Rationale

See #376 (parent) Decision Rationale.

<!-- work-fingerprint: explore-mode:design-wrapper-explore-mode-layout-scope-established-world-c -->
