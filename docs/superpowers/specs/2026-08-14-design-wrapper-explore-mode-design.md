# Design-Wrapper `explore` Mode — Worlds-Based Variation Tournaments — Design

Rendered design-variation exploration before committing to a visual direction, built on
Impeccable's worlds/dealing machinery. Two scopes: identity (project genesis, before DESIGN.md
is locked) and layout (established world, new feature/page composition).

## Problem

Impeccable's worlds system — pre-authored, human-reviewed graphic systems dealt as competing
challengers with reroll and one-line steering — is the strongest pre-commit design-exploration
mechanism upstream ships, and claude-tweaks reaches it only indirectly and at the wrong fidelity:

- The tournament fires at `/claude-tweaks:specify` time (design-wrapper `shape` mode → upstream
  `reference/new-work.md`), *after* brainstorming has already produced a design doc that may have
  textually baked a direction. The genesis moment — before DESIGN.md is locked — has no entry
  point at all.
- The challengers are presented as world *cards* (descriptions + quality-bar boards), not as the
  user's actual product rendered N ways. Cards choose a direction from prose; the decision the
  user actually wants to make is between rendered identities of *their* surface.
- For an established app designing a new feature or page, there is no way to compare rendered
  *composition/layout* variants of the new surface with the identity held fixed. Upstream's
  `visualize.md` covers this axis but via image-generation raster comps — unavailable without
  image generation, and unable to demonstrate interaction framing.

Upstream already owns every hard part: the dealing catalog (`scripts/concept-seed.mjs`, scopes
`direction` and `surface`), reroll-with-exclusion and steer semantics, the canon standing exit,
and the genesis DESIGN.md seed path (`/impeccable document --seed`, which reuses a completed
new-work workshop choice without re-asking). What is missing is the rendered layer on top, and
lifecycle entry points at the two moments that matter.

## Design summary

One new design-wrapper mode, **`explore`** — interactive-only, no target argument, two scopes
with an inverted constant:

| | `identity` scope (genesis) | `layout` scope (established world) |
|---|---|---|
| Trigger | DESIGN.md absent (auto-resolved) | DESIGN.md present + a target surface topic (auto-resolved) |
| Dealing | `concept-seed.mjs --scope direction` | `concept-seed.mjs --scope surface --from <key>` |
| Held constant | the markup (one scaffold) | the identity (the locked DESIGN.md system) |
| Varied | N identity skins (CSS per world) | N markups (composition/hierarchy/interaction framing) |
| Lock-in | upstream `document --seed` writes DESIGN.md | DESIGN.md untouched; winner becomes `Visual-reference:` |

Upstream deals, claude-tweaks renders: dealing, reroll/steer semantics, and DESIGN.md writes all
stay upstream's. The wrapper's write surface is limited to disposable scaffold artifacts under
`docs/plans/`. Variant rendering fans out as parallel subagents under the Subagent Contract.
Comparison happens in the browser via a self-contained switcher page; the verdict is collected in
the terminal via `AskUserQuestion`. New upstream couplings register in the drift manifest in the
phase that creates each one.

## Phase 1 — `explore` mode, identity scope

The mode file (`skills/design-wrapper/modes/explore.md`), the SKILL.md wiring, and the genesis
tournament.

**Mode contract.** Invoked as `/claude-tweaks:design-wrapper explore [--scope identity|layout]
[--source <parent-skill>]`. No target argument — like `doctor`, it operates on the project, not a
diff. Interactive-only with no auto-mode branch: same anti-pattern row as `live` (never invoked
from auto mode or a `$PIPELINE_RUN_DIR`-set context). Returns a scope-dependent ok shape —
identity: `{mode: "explore", result: "ok", scope: "identity", chosen_world, design_md: "seeded" | "declined"}`;
layout: `{mode: "explore", result: "ok", scope: "layout", chosen_world, visual_reference: "<path>" | "declined"}` —
or a skip shape per the wrapper's output contract.

**Preconditions.**

- Layer 1 (kill-switch) applies. Layer 2 is structurally inapplicable (no spec at genesis).
  Layer 3 is structurally inapplicable, like `doctor` (no diff to sniff). Track resolution runs;
  the native track skips: `{skipped: "native surface — explore is web-only"}` (the scaffold is
  static HTML — same constraint chain as `live`).
- Availability: the mode depends on bundled scripts (`concept-seed.mjs`), so it takes the
  exact-pin resolution (`resolveImpeccablePlugin`, same class as `doctor`/Layer 0), not the
  looser skill-resolution check. Absent or off-pin → mode-level skip naming both versions.
- Scope resolution: DESIGN.md absent → `identity`; present → `layout` (Phase 2). An explicit
  `--scope identity` against a present, coherent DESIGN.md skips:
  `{skipped: "design identity already locked — route identity replacement through upstream new-work explicitly"}` —
  mirroring upstream's own rule that `document --seed` does not authorize replacing a coherent
  incumbent. `PRODUCT.md` missing → route through upstream `init` first; never fabricate one.

**Identity-scope procedure.**

1. **Deal via upstream.** Run `concept-seed.mjs --scope direction` and follow upstream's
   dealing: an assigned direction plus dealt challengers. The catalog, exclusion rules, and
   steer handling are upstream's; the wrapper never maintains a parallel catalog and never
   filters the deal.
2. **One markup, N skins.** Build one disposable semantic HTML scaffold of the primary surface
   from `PRODUCT.md` (+ the design doc/brief when one exists), following Step 2.5b-ii's existing
   conventions (realistic placeholder content, no wiring, no framework), saved under
   `docs/plans/YYYY-MM-DD-{feature}-explore/`. Markup references tokens only via CSS custom
   properties. Each dealt world becomes exactly one CSS file implementing its complete graphic
   system (palette, type, spacing, component character); skins may restyle, never restructure.
   The same-markup constraint is load-bearing and stated in the mode file: it makes the
   comparison evidence about identities rather than about which agent wrote better HTML, and it
   makes reroll cheap (re-deal → re-skin; markup untouched).
3. **Parallel skin builders.** One Task agent per world under the full Subagent Contract:
   Standard profile (fan-out — never Frontier), status line first, literal output template,
   clean-room input (the world's card text from the deal, the shared markup path read-only,
   PRODUCT.md facts). A `BLOCKED`/failed skin surfaces as a degraded variant slot in the
   comparison — never silently aggregated as "fewer worlds dealt."
4. **Compare.** Serve the explore directory ephemerally per `_shared/dev-url-detection.md`
   (same procedure and standalone cleanup rule as Step 2.5b-ii). A self-contained `index.html`
   switcher: full-viewport scaffold, docked indicator ("1 / 3 — {world name}"), arrow-key/click
   cycling that swaps only the skin stylesheet. No framework, no external assets — deliberately
   echoing upstream's variant-cycling idiom.
5. **Verdict in the terminal.** One `AskUserQuestion`: pick a world / reroll / steer / the canon
   standing exit as the last option, listed but never recommended (upstream's rule — the
   category-standard door is the user's, never ours). Reroll and steer keep upstream semantics:
   a reroll excludes every world already shown; after two consecutive rerolls, ask what quality
   is missing. Each round re-deals and re-skins; markup is untouched.
   *Decision recorded (not chosen): driving the verdict through upstream's `serve-question.mjs`
   decision page was considered and rejected — its payload is card-oriented while our renders
   are already in the browser, it adds an upstream coupling for no fidelity gain, and
   `AskUserQuestion` is the plugin's own interaction convention.*
6. **Lock-in — upstream writes DESIGN.md, never the wrapper.** On pick, invoke
   `/impeccable:impeccable document --seed` with the chosen direction in context; upstream's
   `document.md` rule ("If new-work already completed the workshop in this session, use its
   chosen direction directly. Do not ask again.") lands the seed without re-interviewing — the
   explore deal *is* that workshop. Keep the scaffold + winning skin (the natural
   `Visual-reference:` candidate for later `/claude-tweaks:specify` runs); delete losing skins.
   The seeded DESIGN.md is the durable record — no side ledger. Exit without picking = skip:
   nothing written, explore dir deleted, server stopped.

**Drift-manifest registrations (this phase creates the couplings, so this phase registers
them).** Three assertions under the `impeccable-plugin` manifest entry:

1. `reference/document.md` — claims "--seed reuses new-work's completed workshop choice without
   re-asking"; must-match on `use its chosen direction directly`.
2. `reference/new-work.md` — claims the reroll-exclusion semantics the verdict loop depends on;
   must-match on `Re-roll eliminates every direction already shown`.
3. `scripts/concept-seed.mjs` — claims the direction-scope invocation exists; must-match on
   `--scope direction`.

## Phase 2 — layout scope (established world)

The second scope: an existing app with a locked DESIGN.md, designing a new feature or page, where
the open question is composition/layout/interaction framing — not colors and fonts.

**Grounding.** Upstream states the case verbatim: "Inside an established world, use its concept
process only when composition or interaction remains materially open" (`new-work.md`), and its
`visualize.md` freezes identity for exactly this axis ("Keep DESIGN.md's palette, typography
direction, material language, component character... fixed. It is not a second identity
workshop"). This scope is the HTML-rendered analog of that probe: interactive variants beat
raster comps for the functionality axis, and they work without image generation. `explore` does
**not** delegate to upstream `visualize` — decision recorded below.

**Procedure deltas from Phase 1** (everything not listed carries over symmetrically — fan-out,
switcher, verdict, reroll/steer):

- **Dealing:** `concept-seed.mjs --scope surface --from <key>`, where `<key>` is the committed
  direction's seed key (recorded by the five-block FORM contract; #152 lifts it onto records).
  A hand-written DESIGN.md with no recoverable seed key → deal without `--from` — degraded, not
  fatal. *Build-time verification item: confirm where the seeded DESIGN.md records the key at
  the pinned version before finalizing the recovery rule.*
- **Inverted constant:** one identity, N markups. Each variant builder gets its staging card,
  DESIGN.md read-only, and the feature's content requirements, and writes one markup file that
  composes the new surface differently — composition, hierarchy, density, primary-action
  framing — all dressed in the established tokens. Skins-may-not-restructure inverts to:
  markups-may-not-restyle (no new palette, type voice, or motif — upstream's own probe rule).
- **Lock-in:** DESIGN.md untouched (upstream's rule: approval refines the task concept, never
  DESIGN.md). The winning layout scaffold is kept and becomes the `Visual-reference:`
  body-metadata line on the records `/claude-tweaks:specify` produces — plugging into the
  existing Step 2.5b-ii → build → polish chain unchanged.
- **Honest limit, stated in the mode file:** "functionality variation" means interaction framing
  and composition — what is on the page, how it is arranged, what the primary action is.
  Variants differing in actual backend behavior are spec territory, not scaffold territory.

**Drift-manifest registration:** one assertion — `scripts/concept-seed.mjs` supports the
surface scope; must-match on `--scope surface`.

## Phase 3 — entry points

- **Standalone:** `/claude-tweaks:design-wrapper explore` renders the Next Actions block when
  user-invoked directly, per the existing component-skill contract. New Next Actions rows:
  identity pick → `/claude-tweaks:specify` (direction is locked; brainstorm/specify against it);
  layout pick → `/claude-tweaks:specify` (winner carried as `Visual-reference:`).
- **`/claude-tweaks:init`:** when it configures design integration on a frontend project with no
  DESIGN.md, it *recommends* explore as a Next Action. Never auto-runs it — interactive-only
  mode.
- **`/claude-tweaks:specify`:** Step 2.5b-ii (`skills/specify/design-pre-steps.md`) gains one
  pre-check on its existing offer: no DESIGN.md → offer `explore` (identity tournament) instead
  of the current single-scaffold `live` exploration; DESIGN.md present → offer `explore`'s
  layout tournament for the new surface, with `live` remaining available on the *winner* for
  element-level tuning (tournament picks the composition, live tunes the details). The step
  stays interactive-only and decomposition-mode-only, exactly as today.
- **Cross-references:** all new relationships stated once in `docs/skill-graph.md`, per the
  CLAUDE.md rule. No `/help` change — explore is a mode of an existing skill, not a new skill.
  `command-map.md` categorization for `document --seed` verified/added at build time.

## File structure changes

```
skills/design-wrapper/
  SKILL.md                    # Input-table row, argument-hint, mode-specific precondition
                              # notes, availability row (exact-pin class), anti-pattern rows
  modes/explore.md            # NEW — both scopes' full procedure
tools/upstream-drift/
  manifest.yml                # +4 assertions under impeccable-plugin (3 in Phase 1, 1 in Phase 2)
skills/specify/
  design-pre-steps.md         # Step 2.5b-ii pre-check (Phase 3)
skills/init/bootstrap/step-11-impeccable-design-integration.md   # Next Action recommendation (Phase 3)
docs/skill-graph.md           # edges (Phase 3)
```

Ships as a minor version bump (feature addition).

## Risks

- **Scaffold quality carries the identity decision.** A weak auto-generated first-surface markup
  can sour a good world. Mitigation is structural (one shared markup keeps the comparison about
  identities) but the residual risk is real; if dogfooding shows it, a later iteration can
  render upstream's quality-bar boards alongside the scaffold so a weak scaffold doesn't carry
  the decision alone. Deliberately not built now (YAGNI until observed).
- **Seed-key recovery for `--from` is unverified** at the pinned version (Phase 2 build-time
  item). The degraded no-`--from` deal bounds the damage.
- **Rendered content at genesis is partly invented.** The scaffold approximates an app that does
  not exist yet. Stated in the mode's offer text so expectations are set.
- **Testing is thin by nature.** The executable surface is the drift assertions; the mode file
  is markdown verified by dogfooding (run explore end-to-end on a genesis-state project and on
  an established-world fixture). The existing wrapper contract tests guard shared preconditions.

## Decisions log (from brainstorming)

- Rendered app variants over upstream's card tournament (fidelity call; cards insufficient for
  committing an identity). Two-round card-then-render hybrid rejected as unnecessary ceremony.
- One-markup/N-skins (identity) and one-identity/N-markups (layout) as load-bearing constraints —
  fairness of comparison and cheap rerolls.
- Verdict via `AskUserQuestion`, not `serve-question.mjs` — one less upstream coupling, renders
  already in-browser, matches plugin interaction conventions.
- Upstream writes DESIGN.md (`document --seed`); wrapper write surface stays zero beyond
  disposable `docs/plans/` artifacts.
- DESIGN.md-present no longer skips the mode wholesale (earlier draft) — it switches scope;
  only explicit `--scope identity` against a locked identity skips.
- No delegation to upstream `visualize` for the layout scope — raster comps can't demonstrate
  interaction framing and require image generation; HTML variants do and don't.
- Losing skins deleted on pick; explore dir deleted wholesale on exit-without-pick (stale
  variants mislead; re-runs re-deal anyway).
