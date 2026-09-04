---
record: 639
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 639: specify / option-block convention: a Recommended option justified on churn or effort contradicts the zero-cost philosophy — add a pre-send check

Surface: backend

## Current State

`docs/skill-authoring.md`'s Interaction patterns section (the "Decisions" bullet, ~line 45) defines the `AskUserQuestion` option-block convention — how to mark a Recommended option, how to batch multi-item decisions. It places no constraint on the *content* of a Recommended option's justification. CLAUDE.md's Philosophy section states "Assume zero cost" and "Assume zero time" — the plugin's stated project-wide default explicitly disallows treating implementation cost, effort, or churn as a valid consideration when choosing between designs.

This issue was filed via `/claude-tweaks:feedback` after a session-evaluation caught exactly that contradiction: `/specify`'s shaping self-review issued one `AskUserQuestion` whose Recommended option was justified on "zero marketplace churn" grounds. The user rejected the menu outright ("what is the proper fix?"), and the correctness-judged answer turned out to be close to the opposite of the Recommendation — the call didn't just fail to help, it actively steered toward the wrong answer, costing roughly two extra user turns to correct.

**Verified against the live repo (2026-08-17):** grepped the currently shipped `docs/skill-authoring.md` and every `skills/specify/*.md` file (`shaping-mode.md`, `decomposition-mode.md`, `design-pre-steps.md`, `red-team.md`) for `churn`, `AskUserQuestion`, and `Recommended` — no live `AskUserQuestion` call today is justified on cost/effort/churn grounds. The incident described above was a one-off in a past session's live reasoning, not a standing defect baked into checked-in prose. `docs/skill-authoring.md`'s Interaction patterns section (lines 45-46) confirmed to contain no admissibility rule of this kind — the gap the issue names is real and reproducible: nothing in the convention text today would catch a repeat of this incident, on `/specify` or any other skill that follows the same convention.

## Deliverables

- Add an explicit pre-send admissibility rule to `docs/skill-authoring.md`'s Interaction patterns section, next to the existing "Mark the recommended option's label with `(Recommended)`" instruction: before marking an option `(Recommended)`, when the project's CLAUDE.md carries a zero-cost/zero-time (or equivalent) philosophy — as this one does — the option's stated justification must not rest on cost, effort, or churn vocabulary (e.g. "churn", "cheapest", "not worth it", "too many files to touch", "smallest change"). A justification using that vocabulary must be restated on correctness/quality grounds before the option can be marked Recommended, or the option demoted (not marked Recommended) if no correctness-grounded justification holds.
- State the rule generally, in the convention doc — it governs every skill that follows this Interaction patterns convention (not just `/specify`), since the convention is defined once in `docs/skill-authoring.md` and consumed via each skill's identical Interaction style directive line.

## Acceptance Criteria

- [ ] `docs/skill-authoring.md`'s Interaction patterns section states the cost/effort/churn admissibility rule for Recommended options, gated on the project's CLAUDE.md carrying a zero-cost/zero-time (or equivalent) philosophy.
- [ ] The rule names concrete disallowed-vocabulary examples (churn, cheapest, effort, "not worth", "too many files", "smallest change"), matching this issue's Proposed fix.
- [ ] The rule is stated once, in `docs/skill-authoring.md`, not duplicated into any individual skill's Interaction style directive line (which is byte-identical across every skill, pinned by `tests/bin-lib/skill-audit/house-structure.test.js` — never edited).
- [ ] `npm test` passes with the new prose in place.

## Technical Approach

Single-file prose edit: `docs/skill-authoring.md`'s "## Interaction patterns" section, "Decisions" bullet (~line 45), adding the admissibility rule inline next to the existing `(Recommended)` labeling instruction. No code changes, no skill-graph edges, no `_shared/*.md` contract file touched — this is a rule an authoring agent applies when composing an `AskUserQuestion` call, same shape as the section's other Interaction-pattern rules.

Confirmed no existing test pins the exact wording of this bullet (`grep -n "Interaction patterns\|Mark the recommended" tests/bin-lib/skill-audit/house-structure.test.js` returns nothing) — the only test files referencing `docs/skill-authoring.md` at all are `tests/next-actions-premise.test.js`, `tests/claude-md-budget.test.js`, and `tests/bin-lib/skill-audit/house-structure.test.js`; none of the three pin this specific bullet's prose, so no fixture update is required alongside the edit — just run the full `npm test` to confirm nothing else pins it indirectly.

## Gotchas

- This is a **convention-text change**, not new tooling. There is no proposal to build an automated pre-send scanner that greps a composed `AskUserQuestion` call before it fires — the check is a rule an agent applies while composing the call, identical in kind to every other rule already in this section (e.g. the existing batch-table-vs-per-item convention). Building an automated linter for this would be a much larger, unscoped effort and is explicitly out of scope for this record.
- Investigation found the specific incident (an actual "zero marketplace churn"-justified Recommended option) does not reproduce against any currently shipped skill file — this record is preventive (closing a gap in the convention text), not corrective (there is no live bad line to revert).
- `docs/skill-authoring.md` is read at skill-*authoring* time, not at runtime by dispatched agents (its own opening line: "Dispatched implementer/reviewer/QA agents do not need this — it is not part of their per-dispatch context"). The rule therefore governs a live authoring session composing a fresh `AskUserQuestion` call (e.g. `/specify`'s shaping self-review, `/backlog refine`), not a skill file's own already-written text — the acceptance criteria scope to the convention doc itself, not to auditing every existing skill file for latent violations (none were found in this investigation).

## Original request

specify / option-block convention: a Recommended option justified on churn or effort contradicts the zero-cost philosophy — add a pre-send check

**Summary:** The one `AskUserQuestion` of a session marked its Recommended option on "zero marketplace churn" grounds; the user rejected the menu ("what is the proper fix?"), and the correctness-judged answer was the near-opposite of the Recommendation.

**Kind:** Gap

**Affected component:** `docs/skill-authoring.md` option-block convention; `skills/specify/shaping-mode.md` self-review

**Objective:** Avoidable interactions

**Measurement:** total AskUserQuestion calls: 1; 0 of 1 resolved to the pre-marked Recommended option (rejected for clarification); cost ≈ two extra user turns.

**Use case:** A project whose CLAUDE.md carries "Assume zero cost / Assume zero time" should never see a Recommended option whose stated rationale is cost, effort, or churn — the philosophy makes that rationale inadmissible, so the stop is wasted.

**Proposed fix:** Before issuing an `AskUserQuestion` with a Recommended option, scan the option descriptions for cost/effort/churn vocabulary (`churn`, `cheapest`, `effort`, `not worth`, `too many files`, `smallest change`); when the project's CLAUDE.md carries the zero-cost philosophy, require the Recommended option's justification to be restated on correctness grounds or demoted. Cite the check from `/specify`'s shaping self-review, which produced this menu.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-901ef914 -->

