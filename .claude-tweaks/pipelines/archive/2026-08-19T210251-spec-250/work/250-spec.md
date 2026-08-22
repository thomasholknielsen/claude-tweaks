---
record: 250
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 250: Mutation-probe discipline for implementer test tasks

Surface: backend

## Current State

Across spec #216's 7 SDD implementer tasks, 4 independently ran scratch-copy mutation probes (mutate the code, confirm the planned test goes red, restore byte-identical) before reporting the task done — and each one caught a planned test that would not have discriminated a real defect: an unpinned stage ordering, a dedent-terminates-block edge case, a tally-line filter, and a presumed-dead assertion that turned out reachable. The plan's own tests were reviewed and still under-discriminated in each case; the probe, not the review, caught it.

This is IL-105's mechanism (mutation/negation-drill discipline) generalized from content assertions to behavioral tests, and it is currently folk practice picked up independently by implementers, not written instruction anywhere in the dispatch contract.

## Deliverables

- Add one sentence to `skills/_shared/subagent-output-contract.md`'s dispatch conventions (or the relevant CLAUDE.md/docs/skill-authoring.md dispatch rules, whichever section the implementer determines is the correct home): implementer dispatches for test-authoring tasks should run a scratch-copy mutation probe (mutate the code under test, confirm the test goes red, restore byte-identical) before committing, and report mutants tried vs. survivors caught.

## Acceptance Criteria

- [ ] The chosen doc (`subagent-output-contract.md` or the determined alternative home) contains one sentence instructing implementer dispatches for test-authoring tasks to run a scratch-copy mutation probe before committing.
- [ ] The sentence states the probe procedure: mutate the code under test, confirm the test goes red, restore byte-identical.
- [ ] The sentence states the reporting expectation: mutants tried vs. survivors caught.
- [ ] `npm test` still passes.
- [ ] No other dispatch-contract doc duplicates the new sentence — it lives in exactly one home, cross-referenced from elsewhere if relevant.

## Technical Approach

Determine the correct home first: `skills/_shared/subagent-output-contract.md`'s dispatch conventions section is the more likely fit since it is already the single source of truth cited by every dispatch site (per CLAUDE.md's Subagent Contract section) — but confirm no existing sentence there already covers mutation-probe discipline before adding a duplicate. If that file's scope doesn't fit (e.g. it is scoped narrowly to parallel-fan-out contract mechanics rather than general dispatch-quality practice), fall back to `docs/skill-authoring.md`'s dispatch rules. Add exactly one sentence — this is dispatch-prompt guidance, not a new gate or CI check (see the Non-Goals in the preserved original request below).

## Gotchas

- This is dispatch-prompt guidance only, not mandatory tooling or a CI-enforced gate — don't over-build a probe harness or automation around it.
- Whichever doc gains the sentence, respect CLAUDE.md's "every relationship between skills is stated once" convention — if the guidance is also relevant from a second doc, cross-reference the canonical location rather than duplicating the sentence.

## Original request

Mutation-probe discipline for implementer test tasks

Surface: skills

## Overview

Across spec #216's 7 SDD implementer tasks, 4 independently ran scratch-copy mutation probes (mutate the code, confirm the planned test goes red, restore byte-identical) before reporting the task done — and each one caught a planned test that would not have discriminated a real defect: an unpinned stage ordering, a dedent-terminates-block edge case, a tally-line filter, and a presumed-dead assertion that turned out reachable. The plan's own tests were reviewed and still under-discriminated in each case; the probe, not the review, caught it.

This is IL-105's mechanism (mutation/negation-drill discipline) generalized from content assertions to behavioral tests, and it is currently folk practice picked up independently by implementers, not written instruction anywhere in the dispatch contract.

## Deliverables

- [ ] Add one sentence to `skills/_shared/subagent-output-contract.md`'s dispatch conventions (or the relevant CLAUDE.md/docs/skill-authoring.md dispatch rules, whichever the implementer determines is the correct home): implementer dispatches for test-authoring tasks should run a scratch-copy mutation probe (mutate the code under test, confirm the test goes red, restore byte-identical) before committing, and report mutants tried vs. survivors caught.

## Non-Goals

- Making mutation probes mandatory tooling/CI-enforced — this is dispatch-prompt guidance, not a gate.

## Origin

Reflect finding from `/claude-tweaks:wrap-up`'s Multi-Spec Review Console (specs 216/217/218), Queue write Q1, staged at `.claude-tweaks/pipelines/2026-08-08T163319-spec-216-217-218/spec-216/staged/reflect-2.md`.

