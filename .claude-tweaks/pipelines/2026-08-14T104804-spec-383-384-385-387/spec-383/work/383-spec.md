---
record: 383
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: design-craft-integration:design-craft-contract-decisions-vs-principles-assembly-for-u
surface: backend
---
# 383: Design craft contract: decisions vs principles assembly for UI-writing dispatches

Surface: backend

## Overview

Create `skills/_shared/design-craft.md` — the canonical, stated-once procedure for how any dispatch that will write or modify UI code assembles its design context. Two source classes: **decisions** (project-specific, durable: `DESIGN.md` plus the sidecar `.impeccable/design.json` — authoritative where they speak) and **principles** (generic, live-loaded at dispatch time: Emil Kowalski's skills when installed, plus Impeccable reference files). Authority rule, stated once here and nowhere else: **conflict → decisions win; silence → principles govern.** Assembly of the principles layer is unconditional for UI work — never "only if DESIGN.md is silent" — so there is no judgment call by which an implementer reads DESIGN.md, sees no motion content, and skips motion craft.

This is the contract sub-issue only: consumers (pre-build, flow polish, visual-review fix path, explore renderers) are wired by the sibling sub-issues of this decomposition (parent: #382).

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No consumer edits — `modes/pre-build.md`, `polish-execution.md`, `standalone-followup.md`, `modes/explore.md` are the sibling sub-issues' territory.
- No writes to `DESIGN.md` or `.impeccable/design.json`, ever — upstream Impeccable owns both.
- `prototype` and `pick-ui-library` are not wired (superseded by explore mode / reserved for #357).
- No new Node code and no drift-manifest entry — governance is #387's territory.
- The contract does not decide which dispatches count as UI-writing — each consumer's own existing gate does (pre-build's detection layers, polish's frontend check, explore's own scope rules). The contract defines what to assemble once a consumer's gate says the dispatch is UI-writing.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | none | — |

## Current State

- `skills/_shared/` — cross-skill contracts cited rather than restated (e.g. `subagent-output-contract.md`, `visual-html-output.md` — the latter owns the `DESIGN.md` three-path lookup: project root → `docs/design/DESIGN.md` → `docs/DESIGN.md`).
- `skills/design-wrapper/modes/pre-build.md` Step 3 — the current Impeccable reference-selection rules (always-load set + keyword gates). Reference-file selection stays there; this contract states the source classes and rules, not a duplicate file list. Its Output-to-caller block also owns the `missed` field this contract's degradation posture writes into.
- `skills/design-wrapper/SKILL.md` — Layer 1 kill-switch semantics (`design-integration:` in CLAUDE.md `## Design integration`; missing → disabled) and the `surface_track` resolution this contract's web-track gating reuses.
- Emil's skills: github.com/emilkowalski/skills (MIT, no version tags), installed via `npx skills@latest add emilkowalski/skills`. Skill set at design time: `emil-design-eng`, `animate`, `animation-vocabulary`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `apple-design`, `pick-ui-library`, `prototype`, `ask-sonner`.
- `docs/skill-graph.md` — the single home for every cross-skill edge.

## Deliverables

- [ ] `skills/_shared/design-craft.md` containing: the authority rule (the canonical sentence "conflict → decisions win; silence → principles govern" verbatim — AC 1 greps for "decisions win"); the unconditional-assembly rule; the two source classes (decisions: `DESIGN.md` via `_shared/visual-html-output.md`'s three-path lookup, plus sidecar `.impeccable/design.json`; principles: Emil skills + Impeccable references, with reference-file selection delegated to `modes/pre-build.md`); the Emil resolution procedure — a provisional lookup order (project `.claude/skills/{name}/SKILL.md`, then `~/.claude/skills/{name}/SKILL.md`) that the verification deliverable below finalizes before ship; the relevance map (see Acceptance Criteria 2); gating (same `design-integration:` Layer-1 kill-switch, missing → disabled; web track only for Emil content — `ios`/`android`/`adaptive` tracks load no Emil skills); the degradation posture (Emil absent → skip with a note in the consumer's `missed` output, the field defined by `modes/pre-build.md`'s Output-to-caller block; Impeccable absent → Emil-only principles; both absent → plain build; never a gate, never a stop); and a Subagent Contract compliance note (craft content is inlined into dispatch prompts — agents can't follow references; volume is governed by the consumer's existing `context_size` summarize-vs-inline mechanism).
- [ ] The authority rule carries two refinements, both stated in the same section: **(a) scope is per-sub-topic** — "speaks" means the decisions address the specific property or behavior at hand, not the general area (worked example in the file: a DESIGN.md that defines colors and typography but no motion tokens has spoken on color and is silent on motion — principles govern the motion of a button whose color DESIGN.md sets); **(b) decisions-internal tie-break** — the sidecar extends `DESIGN.md`, it never overrides it (upstream defines it as carrying "what the frontmatter schema can't hold"); on a direct disagreement, `DESIGN.md` wins. Also state plainly: content overlap between decisions and principles is accepted as a cost — there is no dedup rule; the consumer's `context_size` mechanism is the only volume control.
- [ ] The relevance map wires: `emil-design-eng` — always (web track); `animate` + `animation-vocabulary` — only on an explicit motion signal, and the file states that this signal is consumer judgment reading the spec/description (does it name motion work — animation, transition, gesture, micro-interaction?) or `Design-intent: delightful` — an LLM judgment call by design, not a deterministic keyword gate, and the file says so; `apple-design` — only on an explicit signal (the spec or `Design-intent:` names Apple-style/HIG-like treatment), never inferred. It names the deliberately-not-wired remainder (`prototype`, `pick-ui-library`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `ask-sonner`) each with a one-clause reason, so a future consumer makes a deliberate choice rather than an accidental one.
- [ ] Verification of the install layout: run a throwaway `npx skills@latest add emilkowalski/skills` in a scratch directory outside the repo (never into the repo's own `.claude/skills/` — AC 4 bounds the diff), observe where skill files actually land for Claude Code, finalize the lookup order to match, and record the observed layout as a short verification note inside the resolution-procedure section (so drift is falsifiable later). Requires network access; if unavailable at build time, the order ships explicitly marked provisional and the note says why.
- [ ] `docs/skill-graph.md`: a `_shared/design-craft.md` entry with its consumer edges (design-wrapper `pre-build`, `/build` via `design-prebuild.md`, `/flow` polish, `/visual-review` standalone fix path, design-wrapper `explore` renderers) — each edge stated only here.
- [ ] `docs/plugin-structure.md`: add the new file to the sub-file/`_shared` inventory if that table enumerates `_shared` files (verify at edit time).

## Acceptance Criteria

1. `skills/_shared/design-craft.md` exists; `grep -rn "decisions win" skills/ docs/` matches exactly one file (this one) — the authority rule is stated once, with the canonical sentence verbatim.
2. The relevance map accounts for every skill in the `emilkowalski/skills` set listed under Current State: each row is either wired (with its trigger condition) or named-not-wired (with a reason). No skill from that list is silently absent.
3. The file contains an explicit statement that principles-layer assembly is unconditional for UI-writing dispatches and never conditioned on DESIGN.md's coverage of a topic, plus the per-sub-topic scope example and the sidecar-extends-never-overrides tie-break.
4. `git diff --stat` for this sub-issue touches only `skills/_shared/design-craft.md`, `docs/skill-graph.md`, and (if applicable) `docs/plugin-structure.md` — no consumer skill file, and no files under any `.claude/skills/` directory.
5. Every consumer edge appears exactly once, in `docs/skill-graph.md`; `grep -l "design-craft" skills/*/SKILL.md` returns nothing (no edge restated inside a SKILL.md by this sub-issue).
6. Skill references inside any actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
7. The resolution-procedure section contains the install-layout verification note (observed paths from a real install, or an explicit provisional marker with the reason network verification was impossible).
8. `grep -n "design-craft" docs/plugin-structure.md` matches iff that doc's inventory enumerates `_shared` files individually.

## Technical Approach

The contract is a `_shared` prose procedure, same genre as `subagent-output-contract.md`: consumers reference it and inline its outputs at dispatch time. It defines assembly semantics and the relevance map; it deliberately does not duplicate `pre-build`'s Impeccable reference-file list (single-source rule).

### Key Files

- `skills/_shared/design-craft.md` — new file, the contract
- `docs/skill-graph.md` — consumer edges, stated once
- `docs/plugin-structure.md` — inventory row (verify whether `_shared` files are enumerated)

## Gotchas

- The install-layout assumption (one directory per skill containing `SKILL.md`) is unverified at spec time — the verification deliverable settles it against a real install before the lookup order ships; do not ship the order on assumption, and do the throwaway install in a scratch location outside the repo.
- Emil's repo has no version tags — the contract references the drift-manifest pin location (`tools/upstream-drift/manifest.yml`, entry added by sibling #387). #387 is not a prerequisite: until its entry lands, the contract's reference names the intended pin location, which is stable either way; the wording must tolerate either landing order.
- The `design-integration:` Layer-1 rule treats a missing flag as `disabled` — this repo's own CLAUDE.md has no such flag, so nothing in claude-tweaks itself fires the contract; that is expected and not a defect.
- Native tracks (`ios`/`android`/`adaptive`) load no Emil skills — his content is CSS/web; Impeccable's native references remain those tracks' craft source.
- Prefer describing list sizes by reference, not literal counts (cardinality rule in CLAUDE.md `## Cross-references`).

## Decision Rationale

See parent #382's Decision Rationale for the full trade-off set (optional-upstream posture, live-load vs. cache, unconditional assembly, kill-switch reuse). Contract-local rationale: stating assembly logic once in `_shared` rather than per dispatch site is the same anti-drift discipline as `[IL-93]` — five files restating one list all went stale.


<!-- work-fingerprint: design-craft-integration:design-craft-contract-decisions-vs-principles-assembly-for-u -->
