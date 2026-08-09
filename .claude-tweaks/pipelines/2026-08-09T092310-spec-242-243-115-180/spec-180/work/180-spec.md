---
record: 180
origin: human
risk: low
effort: low
ceremony: fast-lane
grants: [build]
fingerprint: research-verification-phase:eval-coverage-for-the-consequence-filter
surface: backend
---
# 180: Eval coverage for the consequence filter

Surface: backend
Parent: #175
Blocked by #176: the consequence filter must exist to be evaluated
Blocked by #115: eval-harness shape only — #115 is currently parked, so unpark it or drop this edge and author a standalone harness before this leaf can be dispatched

## Overview

The consequence filter — *if the answer surprised me, would the design change?* — is a judgment, and judgments are not unit-testable. A `node --test` assertion over it would pass on any input, which makes it worse than no test: a check that would pass regardless is most seductive exactly when it agrees with the conclusion you wanted (`[IL-78]`).

This leaf adds eval coverage for the filter under `evals/`, the same gap #115 identifies for `assess-agent-autonomy`'s four judgments. It is a companion to #115 rather than a duplicate: same harness, different judgment.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- Adding eval coverage for `assess-agent-autonomy`'s own four judgments — that is #115's scope.
- Building a new eval harness. `evals/` is an existing separate Node project with its own `package.json`/`node_modules`.
- Adding evals to `npm test`. `evals/` is deliberately not part of the plugin runtime test suite.
- Evaluating the source registry's routing — only the filter's keep/drop judgment.

## Current State

- `evals/` — a separate Node project with its own `package.json` and `node_modules`, not part of the plugin runtime; harness commands are documented in `docs/plugin-structure.md`.
- #115 "assess-agent-autonomy has no eval coverage for any of its four judgments" — open, `parked`, `risk:low`/`effort:medium`. Establishes the same gap for a sibling judgment skill; whatever harness shape it settles on should be reused here.
- `skills/research/verify-mode.md` — created by the mode leaf; carries the filter this leaf evaluates.

## Deliverables

- [ ] An eval case set for the consequence filter: questions that should be kept, questions that should be dropped, and boundary cases where both branches genuinely converge.
- [ ] At least one case per class where the *wrong* answer is plausible — a question that looks consequential and isn't, and one that looks trivial and is.
- [ ] Green-ground cases: on a topic with no priors, the filter should keep nearly everything; a case set that only tests well-understood topics cannot catch a filter that always drops.
- [ ] The eval wired into `evals/`'s existing harness invocation, following whatever shape #115 establishes.
- [ ] A recorded baseline result so later changes to the filter's prose are measurable rather than assumed.

## Acceptance Criteria

1. The eval case set contains at least one keep case, one drop case, and one convergence-boundary case, each with a stated expected outcome and a one-line rationale.
2. At least one adversarial case exists in each direction (looks consequential but converges; looks trivial but diverges).
3. At least one green-ground case exists where the correct behavior is "keep nearly everything".
4. The eval runs through `evals/`'s existing harness command without modifying `npm test`.
5. A baseline result is recorded in the repo, with the date and the plugin version it was measured against.
6. The expected outcome for each case is derived independently of how the filter's prose currently reads — not by running the filter and recording what it said.

## Technical Approach

Blocked by #115 for harness shape only, not for content: the case set can be authored in parallel, but the wiring should follow whatever #115 settles on rather than inventing a second convention.

Expected outcomes are authored from the design intent, not from observed behavior. An expectation computed the way the implementation computes it cannot distinguish "correct" from "matches current behavior" and passes the bug straight through (`[IL-62]`).

### Key Files

- `evals/` — new: consequence-filter case set + baseline (exact paths follow #115's harness shape)
- `docs/plugin-structure.md` — modify: eval command reference, if #115 does not already cover it

## Gotchas

- Verify the eval actually discriminates: change the filter's prose to something wrong and confirm the eval fails. A case set that reads correctly but passes either way proves nothing.
- Do not compute an expected value the way the implementation does from the same environment (`[IL-62]`).
- `evals/` has its own `package.json` and `node_modules` — a new test directory there does not get picked up by the plugin's own test globs, and the reverse is also true (`[IL-84]`).
- Don't measure a passing verification without measuring what it examined — a check that would pass on any input is not a weak check, it is no check (`[IL-78]`).
- Related to #115 — if that record lands a shared eval-harness module, use it rather than duplicating; bugs in a shared harness get fixed once rather than twice (`[IL-32]`).

<!-- work-fingerprint: research-verification-phase:eval-coverage-for-the-consequence-filter -->
