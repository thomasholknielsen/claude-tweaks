---
record: 833
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 833: specify: design-pre-steps.md's AskUserQuestion option text is prose the model can reorder or truncate, unlike red-team's verbatim template

Surface: backend

## Current State

`plugin/skills/specify/design-pre-steps.md`'s Step 2.5b (shape pre-step) and Step 2.5c (design-intent) prescribe exact `AskUserQuestion` option labels, order, `(Recommended)` placement, and option counts, but nothing in the file marks that text as verbatim. In one observed run, Step 2.5b's prescribed Recommended option ("Yes — run shape") was rendered as the non-recommended alternative while "Skip" was relabeled Recommended with an invented justification, and Step 2.5c's six prescribed design-intent options rendered as only four (two silently dropped). The plugin already has a mechanism for the opposite case — `decomposition-mode.md`'s red-team Step 5 explicitly requires its Template A block to "remain inlined verbatim in the dispatch prompt at runtime" — but `design-pre-steps.md` has no equivalent instruction.

## Deliverables

- [ ] Add an explicit "render this block verbatim — do not reorder, drop, or relabel options" instruction to Step 2.5b's `AskUserQuestion` block in `design-pre-steps.md`.
- [ ] Add the same explicit verbatim instruction to Step 2.5c's `AskUserQuestion` block (the six-option design-intent question).
- [ ] Follow the same wording convention `decomposition-mode.md`'s red-team Step 5 already uses for its Template A verbatim requirement, so the two verbatim-instruction idioms in this plugin stay consistent.

## Acceptance Criteria

1. Step 2.5b's `AskUserQuestion` block in `design-pre-steps.md` carries an explicit instruction that its option labels, order, and `(Recommended)` placement must render verbatim.
2. Step 2.5c's `AskUserQuestion` block carries the same explicit verbatim instruction, naming that all six options must render.
3. The added instruction wording is consistent with (or explicitly cites) `decomposition-mode.md`'s existing Template A verbatim requirement.

## Technical Approach

A prose-only fix — add one sentence to each of the two `AskUserQuestion` block definitions in `design-pre-steps.md`, mirroring `decomposition-mode.md`'s existing verbatim-template instruction for Step 5's red-team Template A. No code changes; this is a skill-authoring reliability fix in line with `docs/skill-authoring.md`'s conventions for prescriptive interactive blocks.

### Key Files

- `plugin/skills/specify/design-pre-steps.md` — add the verbatim-rendering instruction to Step 2.5b and Step 2.5c's `AskUserQuestion` blocks

## Gotchas

- This is a reliability/instruction-following defect, not a logic bug — there's no code path to test; verification is by re-reading the prose for the explicit verbatim marker, and by prose-conformance test if the plugin's existing `skill-prose-conformance-tests` pattern can pin the added sentence.
- Don't conflate this with red-team's Template A instruction itself — this record only needs `design-pre-steps.md`'s two blocks updated, not a rewrite of the red-team file.

## Original request

specify: design-pre-steps.md's AskUserQuestion option text is prose the model can reorder or truncate, unlike red-team's verbatim template

**Summary:** `design-pre-steps.md`'s Step 2.5b (shape pre-step) and Step 2.5c (design-intent) prescribe exact `AskUserQuestion` option labels, order, and counts, but nothing marks them as verbatim — in one run the shape pre-step's prescribed Recommended option ("Yes — run shape") was rendered as the non-recommended alternative while "Skip" was relabeled the Recommended choice with an invented justification, and the design-intent question's six prescribed options were rendered as only four (two silently dropped).

**Kind:** Defect

**Affected component:** `/claude-tweaks:specify` (`design-pre-steps.md` Step 2.5b/2.5c)

**Objective:** Instruction efficacy

**Repro steps:**
1. Reach `/claude-tweaks:specify`'s Step 2.5 on a frontend-surfaced design doc in interactive mode.
2. Render the Step 2.5b shape-pre-step question and the Step 2.5c design-intent question.
3. Compare the rendered option labels, order, `(Recommended)` placement, and option count against `design-pre-steps.md`'s literal prescribed text.

**Expected vs. actual:**
Expected: prescribed option text renders as written, or the skill explicitly marks it as adaptable — the plugin already has a mechanism for the opposite case (`decomposition-mode.md`'s red-team Step 5 explicitly requires its "Template A block must remain inlined verbatim in the dispatch prompt at runtime").
Actual: nothing in `design-pre-steps.md` marks Step 2.5b/2.5c's option text as verbatim, and a real run both flipped which option carried "(Recommended)" and reduced the design-intent question from 6 options to 4.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.
