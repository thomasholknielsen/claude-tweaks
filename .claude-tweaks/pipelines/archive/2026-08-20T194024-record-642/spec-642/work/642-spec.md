---
record: 642
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 642: multispec-review-console: consoleAutoResolve says "render as an informational report (nothing dropped)" and "skip the console render" in the same paragraph — the audit surface vanishes at unattended

Surface: backend

## Current State

At `autonomy: unattended` the multi-spec review console is a read-only FYI and `consoleAutoResolve` resolves the consolidated console with zero prompts. The contract's own Auto-resolution short-circuit paragraph — in both `skills/flow/multispec-review-console.md` and `skills/wrap-up/review-console.md` — both requires an informational render ("render every section below as an informational report (nothing dropped)") and, twelve lines later, tells the model to skip it ("skip the console render and its AskUserQuestion entirely"). So an unattended run can end with dozens of auto-decisions and console rows and no operator-visible summary beyond a gitignored `decisions.md` the closing report never names.

Repro: set `autonomy: unattended`, run a multi-spec `/flow` to completion in `auto` mode, and read the Auto-resolution short-circuit paragraph — whichever clause the model follows, the operator sees either the full table or nothing; the contract does not decide. The console-on-PR post is also suppressed on this path, so no surface carries the rows.

## Deliverables

- Resolve the contradiction in favor of render-don't-ask: delete the "skip the console render" clause from both `skills/flow/multispec-review-console.md` and `skills/wrap-up/review-console.md`'s Auto-resolution short-circuit paragraph.
- End the short-circuit paragraph with the absolute paths to `decisions.md` and any retained `staged/` files, so the operator has a pointer even at `unattended`.
- Add a conformance test asserting the paragraph contains no "skip the console render" clause alongside "nothing dropped".

## Acceptance Criteria

- [ ] `skills/flow/multispec-review-console.md` and `skills/wrap-up/review-console.md`'s Auto-resolution short-circuit paragraph contain exactly one instruction (render, never skip) and end with the `decisions.md`/`staged/` paths.
- [ ] A new conformance test fails on the pre-fix text (both "nothing dropped" and "skip the console render" present) and passes on the fixed text.
- [ ] `npm test` passes.

## Technical Approach

Edit both cited files' Auto-resolution short-circuit paragraph to remove the "skip the console render and its AskUserQuestion entirely" clause, keeping only the render-as-informational-report instruction, and append the `decisions.md`/`staged/` path pointer. Add a `skill-prose-conformance-tests`-style pin (per this repo's existing convention) asserting the contradiction can't reappear.

### Key Files

- `plugin/skills/flow/multispec-review-console.md` — Auto-resolution short-circuit paragraph
- `plugin/skills/wrap-up/review-console.md` — same section
- a new or existing `tests/` conformance test pinning the paragraph's text

## Gotchas

- The fix must not silence what `_shared/autonomy-ceiling.md`'s `consoleAutoResolve` capability is actually meant to silence (the click, not the record) — this record is scoped to the *visibility* contradiction, not to changing what `unattended` is allowed to auto-resolve.
- Both files (`flow` and `wrap-up` variants) must be edited in lockstep — fixing only one leaves the other carrying the same contradiction.

## Original request

multispec-review-console: consoleAutoResolve says "render as an informational report (nothing dropped)" and "skip the console render" in the same paragraph — the audit surface vanishes at unattended

**Summary:** At `autonomy: unattended` the Manifesto is a read-only FYI and `consoleAutoResolve` resolves the consolidated console with zero prompts; the contract's own paragraph both requires an informational render and tells the model to skip the render, so an unattended run can end with 43 auto-decisions and 16+ console rows and no operator-visible summary beyond a gitignored `decisions.md` the report never names.

**Kind:** Defect

**Affected component:** `skills/flow/multispec-review-console.md` (Auto-resolution short-circuit); `skills/wrap-up/review-console.md` (same section)

**Objective:** Trust calibration

**Repro steps:**
1. Set `autonomy: unattended` and run a multi-spec `/flow` to completion in `auto` mode.
2. Read the Auto-resolution short-circuit paragraph: "render every section below as an informational report (nothing dropped)" and, twelve lines later, "skip the console render and its AskUserQuestion entirely".
3. Observe the closing report: whichever clause the model follows, the operator sees either the full table or nothing — the contract does not decide.

**Expected vs. actual:**
Expected: one unambiguous instruction — render the full batch table with every row marked Auto-resolved and its reversibility, and print the absolute paths to `decisions.md` and the retained `staged/` files.
Actual: contradictory clauses; the console-on-PR post is also suppressed on this path, so no surface carries the rows.

**Proposed fix:** Resolve in favour of render-don't-ask; delete the "skip the console render" clause; end the short-circuit with the run-dir paths; add a conformance test asserting the paragraph contains no "skip the console render" alongside "nothing dropped".

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).

