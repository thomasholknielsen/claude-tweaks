---
record: 176
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
fingerprint: research-verification-phase:research-verify-mode-grammar-input-resolution-and-the-conseq
surface: backend
---
# 176: research verify: mode grammar, input resolution, and the consequence filter

Surface: backend
Parent: #175

## Overview

Add a `verify` mode to `/claude-tweaks:research` that grounds a design before it is written, instead of leaving codebase grounding to two prose bullets inside superpowers' brainstorming (`brainstorming/SKILL.md:97-99`). This leaf delivers the mode's entry grammar, its input resolution, the consequence filter that selects what gets researched, and the auto-mode behavior. The source registry that answers the selected questions is a separate leaf.

The filter is the entire cost-control mechanism. For each candidate question it asks: *if the answer surprised me, would the design change?* When both branches lead to the same design, the question is dropped and the drop is logged. There is no budget knob and no per-source authorization — a topic where nothing diverges correctly costs nothing, and a topic on new ground (where you have no priors, so almost everything diverges) automatically authorizes more work. The filter self-calibrates, which is why no separate green-field mode exists.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- The source registry, routing, and dispatch — that is the sibling leaf (`research verify: source registry, parallel dispatch, and verdict shape`).
- The brief's `falsified` vocabulary and write-back — a separate leaf.
- Changing bare `/claude-tweaks:research <topic>`. Today's web-survey behavior is untouched.
- Removing or rescoping the existing `--engine=auto|inline` flag.

## Current State

- `skills/research/SKILL.md` — the skill today. Web-only (`:3`). `## Input` at `:33-40` parses `--mode=`, `--engine=`, `--output=`. `## Mode Picker` at `:42-53` includes the auto-mode precedence branch at `:44`. `## Workflow` Steps 1-7 at `:55-73`. Its own diagram at `:16-23` asserts no skill invokes it from a numbered Workflow step.
- `skills/challenge/SKILL.md` — produces the Brainstorming Brief. Schema at `:220-247`; `### Key Assumptions Surfaced` at `:233`, `### Open Questions for Brainstorming` at `:244`. Saved to `docs/plans/{YYYY-MM-DD}-{topic}-brief.md` (`:251`). "When to Skip" documents that `/challenge` is optional.
- `skills/assess-agent-autonomy/SKILL.md:4` — the leading-positional-mode grammar precedent (`argument-hint: "<grant-check|merge-check|failure-check|ceremony-check> ..."`).
- `skills/_shared/auto-mode-contract.md` — decision precedence and the no-new-mid-flow-stops rule.
- `skills/_shared/auto-decision-log.md` — the `AUTO`/`STAGED`/`KEPT-PROMPT`/`SCANNED` line format.
- Tests: `tests/research/skill-md.test.js`, `tests/research/cross-refs.test.js`.

## Deliverables

- [ ] `argument-hint` and `## Input` in `skills/research/SKILL.md` accept a leading positional `verify` mode: `/claude-tweaks:research verify [brief-path|#N]`, alongside today's bare `<topic>` form.
- [ ] A new `skills/research/verify-mode.md` sub-file carrying the mode's procedure, referenced from `SKILL.md` with a "read `verify-mode.md` in this skill's directory" stub.
- [ ] Input resolution in `verify-mode.md`: a brief path or a record with one reads `### Key Assumptions Surfaced` + `### Open Questions for Brainstorming`; with neither, generate a candidate set from the topic directly.
- [ ] The consequence filter, stated as an explicit per-candidate test with the drop rule and the divergence-ranked output ordering.
- [ ] Question-shape classification: falsifiable (→ registry, returns a verdict) vs. unfalsifiable (→ survey, returns a landscape), with the existing depth tiers rescoped to bound survey breadth only.
- [ ] Auto-mode behavior: depth resolves through the existing precedence chain; every filter drop and every verdict writes one `decisions.md` line.
- [ ] Ambiguity handling: a bare `verify` with no following argument, where "verify" could also be a topic, resolves via the numbered-choice disambiguation `/claude-tweaks:specify`'s `## Input` already establishes for topic-vs-path collisions.
- [ ] `tests/research/skill-md.test.js` covers the new grammar and the sub-file stub.

## Acceptance Criteria

1. `skills/research/SKILL.md`'s `argument-hint` contains the literal `verify`, and `## Input` documents both the bare-topic and `verify` forms with their distinct resolutions.
2. `skills/research/verify-mode.md` exists and is referenced from `SKILL.md` by a stub naming the file.
3. `verify-mode.md` states the consequence filter as a question with exactly two outcomes (research it / drop it and log the drop) — not as a severity scale or a scoring rubric.
4. `verify-mode.md` states that an unfalsifiable question routes to survey and that `--mode=quick|standard|deep|ultradeep` bounds survey breadth only; grepping `verify-mode.md` for `ultradeep` returns at least one line, and no line claims the tier governs falsifiable questions.
5. `verify-mode.md` documents the no-brief path explicitly (generate candidates from the topic), so skipping `/challenge` does not skip grounding.
6. `verify-mode.md` states that absence is a finding — `history`/`telemetry` returning nothing is reported as "no precedent exists", not omitted.
7. `verify-mode.md` states that a filter drop writes a `decisions.md` line, quoting the line format from `_shared/auto-decision-log.md`.
8. `verify-mode.md` documents the bare-`verify` ambiguity and resolves it by presenting a choice, never by silently assuming mode or topic.
9. `verify-mode.md` states that survey depth resolves through the CLI-arg > pipeline-config > project-policy > skill-default chain, citing `_shared/auto-mode-contract.md`.
10. `node --test tests/research/` passes.

## Technical Approach

Grammar follows `assess-agent-autonomy`'s leading-positional-mode precedent rather than overloading `--mode=`, which already means depth tier. Verification is a different job, not a fifth depth tier — conflating them would make `--mode=verify --mode=deep` unexpressible.

`verify-mode.md` is a new lazy-load unit, not an addition to `SKILL.md`. `SKILL.md` is currently 119 lines; the mode's procedure would roughly double it, and the bare-topic path would then pay for verification prose it never uses.

### Key Files

- `skills/research/SKILL.md` — modify: `argument-hint`, `## Input`, `## Workflow` mode branch, the stub referencing `verify-mode.md`
- `skills/research/verify-mode.md` — new: input resolution, consequence filter, question-shape split, auto-mode behavior
- `tests/research/skill-md.test.js` — modify: grammar + stub assertions

## Gotchas

- The stub-vs-sub-file rule: a sub-file is a lazy-load unit, not an overflow bucket. If a second stub later needs to cite a *section* of `verify-mode.md`, split by the unit the stubs name rather than growing it (`[IL-70]`).
- Do not write a plan-verification grep as a single-line literal against markdown prose — hard-wrapped text splits phrases across lines and the grep returns zero while the phrase is present (`[IL-66]`). AC4/AC6 greps must be whitespace-flexible.
- `auto` mode must not gain a new mid-flow stop from this leaf. Depth resolution and filter drops are logged, never prompted.
- The consequence filter's own judgment quality is not unit-testable — an eval, not an assertion. Do not write a test that would pass on any input to cover it (`[IL-78]`); the eval leaf owns this.
- **Deferred decision (carried from the design doc, which Step 7 deletes):** whether `verify` should be reachable from `/claude-tweaks:flow` at all. `/flow` consumes ready leaf records, which are post-design by construction, so grounding may be structurally too late there. Decide during build; the default if unresolved is not reachable from `/flow`.
- Don't restate a literal count of the source registry's entries in this leaf's prose — the registry is the sibling leaf's deliverable and its size may move (`[IL-40]`).


<!-- work-fingerprint: research-verification-phase:research-verify-mode-grammar-input-resolution-and-the-conseq -->
