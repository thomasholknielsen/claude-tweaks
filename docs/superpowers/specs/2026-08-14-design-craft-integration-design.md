# Design Craft Integration — ambient design principles across UI-writing dispatches

**Date:** 2026-08-14
**Status:** Approved design, awaiting decomposition via `/claude-tweaks:specify`

## Problem

Design quality arrives too late in the pipeline. The failure has three observed modes (user-confirmed): wrong direction (a different layout/concept would have been chosen if options had been seen first), flat execution (direction fine, result bland — spacing, hierarchy, motion, polish), and discovery-at-the-end (nothing visual is seen until the work is done). The direction mode is owned by the explore-mode family (#376–#379, in flight in a parallel session). This design owns the second mode and dissolves the third by front-loading: no new visibility machinery, no mid-run screenshots, no new stops.

The structural root cause of flat execution, verified against the live skill files: implementer subagents that write UI code receive identity context (`DESIGN.md`, `Visual-reference:` scaffold) but no design-engineering *principles*. Concretely, `skills/design-wrapper/modes/pre-build.md` Step 3 gates `motion-design.md` and `interaction-design.md` on keywords in the spec's own text — a spec that never says "animation" produces a UI built with zero motion craft. And nothing anywhere loads execution-craft knowledge of the kind Emil Kowalski's skills encode (easing physics, spring interruption, component mechanics, when not to animate).

## Goal

Every agent that writes or modifies UI code carries design craft ambiently — "like a person breathing": no ceremony, no checkpoints, no human gates. Two upstreams supply the craft, with a clean division of authority:

- **Impeccable** (already integrated via `/claude-tweaks:design-wrapper`) owns identity and conformance: `DESIGN.md`, the sidecar, worlds, critique/audit/doctor.
- **Emil Kowalski's skills** (`emilkowalski/skills`, MIT, installed via `npx skills@latest add`) own execution mechanics: motion physics, component feel, interaction craft — almost entirely identity-agnostic.

## Core distinction: principles vs. decisions

- **Decisions** are project-specific and durable: `DESIGN.md` plus the sidecar `.impeccable/design.json` (motion tokens, shadow tokens, narrative — what the DESIGN.md frontmatter schema can't hold). Written only by upstream Impeccable flows; claude-tweaks never writes either. Authoritative *where they speak*.
- **Principles** are generic and live-loaded: Emil's skills when installed, plus Impeccable reference files. Loaded at dispatch time from the installed source so they are always current — never copied into project artifacts (a per-project copy is a cache of generic content that drifts silently, and `document.md` explicitly forbids inventing top-level token groups like `motion:` in DESIGN.md).

**Authority rule (stated once, in the craft contract): conflict → decisions win; silence → principles govern.** Assembly of the principles layer is **unconditional** for UI work — never "only if DESIGN.md lacks the topic" — so there is no judgment call by which an agent can read DESIGN.md, see no motion content, and skip motion craft.

## Non-goals

- No new pipeline stops, no mid-run screenshots, no human design checkpoints in `auto` mode (explicit user decision).
- No claude-tweaks writes to `DESIGN.md` or the sidecar, ever — same discipline as `doctor`'s never-`--fix` rule and the explore-mode parent's "upstream deals, claude-tweaks renders."
- No UI-stack decision step. #357 remains its own record; this design only adds a one-line Related note there that Emil's `pick-ui-library` is its natural engine.
- No change to review-depth derivation (#361 remains its own record).
- Emil's `prototype` skill is deliberately not wired (superseded by explore mode's worlds tournaments).
- No motion-decision capture machinery. Deposit of new decisions stays upstream-owned (identity lock-in writes motion grammar into the world Overview; sidecar tokens come from Impeccable's own flows; `doctor` already audits both). If dogfooding shows projects chronically missing motion tokens, a staged `survey`/`doctor` nudge is a later iteration — deliberately not built now.

## Phase 1: The craft contract — `skills/_shared/design-craft.md`

One canonical `_shared` procedure defining how any dispatch that will write or modify UI code assembles its design context. Consumers reference it; the assembly logic is stated nowhere else (the alternative — restating it per dispatch site — is exactly the `[IL-93]` drift pattern).

Contents:

- **The authority rule** (conflict → decisions win; silence → principles govern) and the unconditional-assembly rule.
- **Source classes.** Decisions: `DESIGN.md` (three-path lookup per `_shared/visual-html-output.md`) plus the sidecar `.impeccable/design.json`. Principles: Emil's skills plus Impeccable reference files (the reference-selection rules stay in `modes/pre-build.md`, which is the contract's main implementation — see Phase 2; the contract states the classes and the rule, not a duplicate file list).
- **Emil resolution procedure.** Known-skill lookup, project-first: `.claude/skills/{name}/SKILL.md`, then `~/.claude/skills/{name}/SKILL.md`. The implementing task must verify the actual directory layout `npx skills@latest add` produces for Claude Code before hardcoding paths (repo docs don't state it; verify against a real install, per the verify-third-party-source discipline).
- **Relevance map** (the contract's own table, kept small):
  - `emil-design-eng` — always, **web track only** (content is CSS/web; `ios`/`android`/`adaptive` tracks keep Impeccable's native references and load no Emil skills).
  - `animate`, `animation-vocabulary` — when the work has motion scope. Motion scope is an explicit signal, not a craft gate: the spec/description mentions motion work or `Design-intent:` includes `delightful`. The ambient motion baseline is NOT gated on this — `emil-design-eng` and Impeccable's `motion-design.md` are in the always-load layer precisely so unsignalled specs still get motion craft; these two deep-dive skills are authoring procedures loaded on top when animation is the work itself.
  - `apple-design` — only when `Design-intent:` warrants it.
  - `prototype`, `pick-ui-library`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `ask-sonner` — deliberately not wired; the contract names them so a future consumer makes a deliberate choice rather than an accidental one.
- **Gating.** The same `design-integration:` Layer-1 kill-switch as the rest of the design machinery (missing → disabled). Below that: fires only for UI-writing dispatches (surface/track resolution per the existing design-wrapper layers).
- **Degradation posture.** Never a gate, never a stop: Emil absent → skip with a note in the output's `missed`; Impeccable absent → Emil-only principles; both absent → today's plain build. Absence is informational, mirroring `pre-build`'s existing skip semantics.
- **Subagent Contract compliance.** Craft content is inlined into dispatch prompts (agents can't follow references); the existing `context_size` summarize-vs-inline mechanism governs volume.

## Phase 2: `pre-build` becomes the contract's main implementation

Deltas to `skills/design-wrapper/modes/pre-build.md` (and its caller wiring in `skills/build/design-prebuild.md` where needed):

1. **Promote `motion-design.md` and `interaction-design.md` into the frontend always-load set**, removing their keyword gates. The remaining keyword rules (`responsive-design.md`, `ux-writing.md`) stay as they are.
2. **Load the sidecar** `.impeccable/design.json` in Step 4 alongside `DESIGN.md`/`PRODUCT.md` (same missing-is-not-an-error posture).
3. **Resolve and load Emil's skills** per the Phase 1 contract; loaded files join `loaded`, absent ones join `missed`.
4. **State the authority rule in the injected context** so the implementer receives it verbatim, not as a reference.

Output contract shape is unchanged (`loaded` / `context_size` / `missed` / `description` absorb the growth). `pre-build` remains read-only.

## Phase 3: Remaining consumers and graph edges

- **`/flow` polish** (`skills/flow/polish-execution.md`): when composing refinement/intent dispatch prompts, assemble craft context per the contract (motion-scoped Emil skills are the main gain for `animate`-intent runs).
- **`/visual-review` standalone fix path** (`skills/visual-review/standalone-followup.md`): same, for its consent-gated code-modifying options.
- **`docs/skill-graph.md`**: add the `_shared/design-craft.md` edges once — consumers per this design (Phases 2–4), each stated only in the graph.
- **Docs**: `docs/getting-started.md`'s design section gains a short "craft layer" paragraph; also fix its stale "Seven active modes" count while touching it (verify the real count against `skills/design-wrapper/SKILL.md` at edit time).

## Phase 4: Explore-mode renderer amendment (coordination required)

The additive change to the in-flight explore-mode family: variant-renderer dispatch prompts (#377 identity scope, #378 layout scope) assemble their design context per the Phase 1 contract —

- **Identity scope:** principles + the dealt world's description (no `DESIGN.md` exists yet, by definition).
- **Layout scope:** locked decisions + principles.

This is what makes tournament variants worth choosing between: a tournament of flat renders tests the worlds unfairly.

**Execution constraint:** #377/#378 are being built in a live parallel session (worktree `explore-mode-design`). This phase must land as a coordinated amendment — comment on the records referencing this design doc so the other session picks it up, or apply the edit after that family merges — never a racing edit against their worktree. If the explore-mode files already exist at build time, amend them; if not, the amendment content goes into the records as acceptance criteria for that family.

## Phase 5: Upstream governance

- **`tools/upstream-drift/manifest.yml`**: new entry for `emilkowalski/skills`. Upstream has no version discipline (no tags), so pin by git commit SHA plus content hashes of the consumed `SKILL.md` files; the drift auditor triages newly-appearing skills in the repo as new-capability candidates. Keep it a separate entry from the two Impeccable entries (conflating version lines is the documented root cause of an earlier defect — see the spec-141 note).
- **`/claude-tweaks:init`**: a new optional bootstrap step, sibling to the Impeccable step: frontend detected → offer `npx skills@latest add emilkowalski/skills`, cleanly declinable, recorded like the other integration choices. Regenerate the cloud Setup script implications if any (the skills install is per-project files, so cloud sandboxes get them via the repo checkout when installed project-locally — verify at build time).
- **#357**: one-line Related note that `pick-ui-library` is the natural engine for its eventual stack-decision step.

## Decision rationale

- **Optional upstream, degrade gracefully** (over distilling principles into owned files, hard dependency, or not integrating): follows the established Impeccable third-party pattern; no copied content, no license/maintenance burden, no silent drift from Emil's updates; absence degrades to today's behavior. (User-selected.)
- **Live-load principles, never cache them into DESIGN.md**: per-project copies of generic content drift; upstream's own schema forbids the obvious cache location; decisions-vs-principles keeps DESIGN.md authoritative without pretending it is complete.
- **Unconditional assembly**: the observed failure ("Claude takes DESIGN.md and stops") is a judgment-call gap; removing the judgment call fixes it by construction.
- **Always-load promotion of motion/interaction references**: keyword-gating on spec text is the verified structural hole; specs describe features, not craft dimensions.
- **No visibility machinery**: user decision — direction is front-loaded (explore mode) and craft is ambient; mid-run screenshots and checkpoints were explicitly rejected.
- **Kill-switch reuse**: one flag (`design-integration:`) governs all design machinery; a second flag for the craft layer would add a matrix of half-enabled states nobody needs.

## Testing

- Contract-consistency: extend the upstream-drift deterministic checks to cover the new manifest entry (existence + hash-shape), same pattern as the Impeccable entries.
- `pre-build` behavior is prose-defined; its verification is the standard skill self-consistency greps at build time (always-load set, sidecar path, Emil resolution order stated once).
- No new Node code is expected outside `tools/upstream-drift` manifest data; if a task adds any, it lands with `node --test` coverage per repo convention.

## Related

- #376/#377/#378/#379 — explore-mode family (direction layer; Phase 4 amends its renderers).
- #357 — UI-stack decision point (gains a Related note only).
- #361 — review depth for UI-surface specs (untouched; adjacent).
- #140/#145/#149 — Impeccable upstream-contract program (pattern precedent for Phase 5).
