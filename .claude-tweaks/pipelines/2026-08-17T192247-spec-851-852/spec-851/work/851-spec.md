---
record: 851
origin: capture
risk: medium
size: high
ceremony: standard
grants: []
surface: backend
---
# 851: wrap-up: bookend sub-files load full interactive prose even on auto-resolve path

Surface: backend

## Current State

Wrap-up's bookend sub-files — `skills/wrap-up/review-console.md`, `verification-brief.md`, `cleanup-procedures.md`, and `skills/_shared/pr-first-merge.md` — are each read into context in full every time `/claude-tweaks:wrap-up` reaches Phase 4, regardless of whether the run actually renders a real interactive stop. Measured on one dispatch/wrap-up resume session: reading these four files cost ~141K characters (~35K tokens), on a run where the Review Console auto-resolved under `consoleAutoResolve` and the oversight-floor gate resolved `AUTO` — no interactive content was ever shown to a human. Each file interleaves the non-interactive decision logic (what to check, what to log) with the much larger interactive-rendering prose (batch table templates, `AskUserQuestion` wording, numbering rules) that only a real stop ever uses.

## Deliverables

Split each of the four sub-files into two parts:

1. A slim auto-resolve procedure — the checks to run, the decisions to make, and the `decisions.md` log-line formats for the non-interactive path.
2. A separate file (or a clearly delimited, independently-skippable section) containing the interactive-console-rendering prose — table templates, `AskUserQuestion` wording, numbering rules.

The calling procedure (`/claude-tweaks:wrap-up` Phase 4, `/claude-tweaks:dispatch`'s settle-and-merge, `_shared/pr-first-merge.md`'s callers) reads only the auto-resolve half by default, and reads the interactive half only once it has determined a real stop will actually render.

## Acceptance Criteria

- `review-console.md`, `verification-brief.md`, `cleanup-procedures.md`, and `pr-first-merge.md` each have their auto-resolve logic separated from their interactive-rendering prose, either as two files or a clearly delimited section a caller can skip reading.
- A wrap-up run that fully auto-resolves (the Auto-resolution short-circuit / `consoleAutoResolve` granted, or every gate closes with nothing to review) measurably reads less total sub-file content than before the split.
- Every existing citation of these four files' step numbers, section names, or file paths by other skills (`dispatch/settle-and-merge.md`, `flow/steps-and-gates.md`, `wrap-up/SKILL.md`, and any others found by a repo-wide grep) still resolves correctly after the split.
- Existing prose-conformance tests referencing these files pass after the split, updated as needed for the new file layout.

## Technical Approach

Grep the repo for every citation of these four files (by path, by step number like "Step 2.5", and by section heading) before splitting, to build the full list of call sites that need updating — the same discipline `docs/skill-authoring.md` and this project's own shared-contract-extraction convention already require for a file move/split. Extract the interactive-rendering prose (console templates, `AskUserQuestion` blocks) into its own file per source file, leaving the original file holding only the auto-resolve procedure plus a pointer ("read `{new-file}` when a real stop will render") to the extracted prose. Update every citing skill to reference the correct half. Run the full test suite plus a targeted check of `tests/` files that pin any of this prose.

## Gotchas

- Many other skills cite these four files by literal step number or section name (`dispatch/settle-and-merge.md`, `flow/steps-and-gates.md`, `wrap-up/SKILL.md`) — a split must preserve every such reference; a repo-wide grep sweep before and after the split is required, not optional.
- `skill-prose-conformance-tests`-style suites likely pin some of this text byte-exactly (see `tests/`) — expect to update fixtures alongside the split, not as an afterthought.
- The split must not change any actual decision logic or gating behavior — this is a context-cost reorganization, not a behavior change; the acceptance criteria's "measurably reads less" check is the signal that the split actually helped, not just moved text around.

## Original request

wrap-up: bookend sub-files load full interactive prose even on auto-resolve path

**Related:** none

Context: Found by /feedback's session-evaluation judge (self-referential to this repo — claude-tweaks evaluating its own dispatch/wrap-up session). ~141K chars (~35K tokens) loaded across review-console.md, verification-brief.md, cleanup-procedures.md, and _shared/pr-first-merge.md on a run where the Review Console auto-resolved and the oversight-floor gate resolved AUTO — zero interactive content ever rendered.

Scope: Split each sub-file into a slim auto-resolve procedure (what to check, what to log) and a separate interactive-console-rendering doc (table templates, AskUserQuestion wording), loading the latter only when a real stop will actually be presented to a human.
