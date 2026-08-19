---
record: 324
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-11-demo-observation-plan-design:observation-plan-briefs-wrap-up-authors-the-surface-plan-dem
surface: backend
---
# 324: Observation-plan briefs: wrap-up authors the surface plan, /demo walks it show-first

Surface: backend

## Overview

Replace the Verification Brief's binary testable/non-testable shape with a builder-authored `### Observation plan`, and rewrite `/claude-tweaks:demo`'s walkthrough to execute that plan show-first. The producer (`skills/wrap-up/verification-brief.md`) and the primary consumer (`skills/demo/SKILL.md`) change in this one leaf — one change-set, so whole-branch review sees both sides of the schema — with the schema itself stated once in a new `skills/_shared/observation-plan.md` both cite. The plan is plain markdown in the brief: human-readable in the posted issue comment, structured enough for demo to execute mechanically. Expand-contract: the old `### See it yourself (optional)` / `### Verify it yourself (manual)` sections stop being written but stay readable — demo falls back to today's handling for briefs posted before this ships.

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- No behavior or test changes to `bin/lib/issues/acceptance.js` — `verificationSurface` keeps its tidy-sweep consumers and demo's reconstruction fallback; only its header comment's consumer list is corrected
- No migration of the Family-Gate parent brief to the structured section — its inline end-to-end walkthrough stays as-is; only its prose references to the retired section names change
- No generated HTML demo page, no evidence archive, no new storage of any kind
- No backfill or rewrite of already-posted briefs
- No repo-wide prose sweep beyond the files named in Key Files (the follow-up leaf's job), and no version bump here — the follow-up leaf owns the family's single bump

## Prerequisites

None — first leaf of this decomposition.

## Current State

- `skills/wrap-up/verification-brief.md` (34.8 KB) — Step 2 classifies this run's changed paths via `verificationSurface` into `interactive`/`non-interactive`; Step 2.5's visual-review safety net runs for `interactive` only; Step 3 sources the Confirmed section through two branches keyed on that same vocabulary ("testable, visual-review available" vs "non-testable, or testable-with-browser-unavailable" — the latter's prose reads "Step 2 found no interactive surface" without naming the function); Step 4's template renders mutually-exclusive `### See it yourself (optional)` / `### Verify it yourself (manual)` sections; the Family-Gate Procedure's "What this path deliberately does not run" and "Compose the parent brief" sections name those two section headings when describing what a parent brief omits.
- `skills/demo/SKILL.md` (36.5 KB) — Step 1 resolves the item (session-recall / `#N` label-backed / closing-commit reconstruction) and composes or fetches the brief, calling `verificationSurface` for the session-recall and reconstruction paths; Step 2 renders the brief, then a verdict `AskUserQuestion` whose Option 2 is "See it yourself"/"Verify it yourself", then a live-vs-steps follow-up question ("Open a live session and show you, or give you the steps...") and a browser pre-flight; Anti-Patterns rows reference the pre-flight/steps flow.
- `bin/lib/issues/acceptance.js` — `verificationSurface(changedPaths)` with `NON_INTERACTIVE` patterns (including `^docs\//` and `\.md$`) and `INTERACTIVE_PATHS` carve-outs (`^stories\//`, `^docs/journeys\//`); its header comment names `verification-brief.md` Step 2, `demo/SKILL.md` Step 1, and both tidy acceptance-gap sweeps as the callers.
- `skills/_shared/dev-url-detection.md` — existing project-agnostic dev-server resolution both skills already cite; unchanged, still the Prepare-step fallback.
- `skills/_shared/observation-plan.md` — does not exist yet; created by this leaf.
- Tests: `tests/pending-review-durability.test.js` reads `verification-brief.md` and pins the `### Branch` section's exact field names (untouched by this leaf, but the test runs against the edited file).

## Deliverables

- [ ] New `skills/_shared/observation-plan.md`: the canonical schema and grammar for the `### Observation plan` section (schema under Data / API Surface below), including the per-kind field semantics and the authoring rules. Both wrap-up's Step 2 composition and demo's session-recall composition cite this file — the schema is stated once; the two skill files carry only the template skeleton and a citation, never a second full copy of the semantics.
- [ ] `verification-brief.md` Step 2 rewritten from "Determine testability" to "Author the observation plan": the builder picks the surface kind by judgment from what this run actually did, per the `_shared/observation-plan.md` guidance. Precedence rule (stated in the `_shared` file): when any changed path is UI, route, or rendered-content code, `app-route`/`rendered-page` take precedence — choosing `cli`/`flow`/`diff` anyway requires a one-line justification written into the plan's own text. The residual risk of a mis-picked kind is accepted as a documented tradeoff (rationale on the parent record); demo's Validate step guards URL surfaces, and cli/flow surfaces fail visibly at Show time. The `verificationSurface` call is removed from this step.
- [ ] Step 2.5's gate condition keys off plan kind `app-route` or `rendered-page` instead of `interactive`; its branch table and severity-floor behavior unchanged.
- [ ] Step 3's two sourcing branches re-keyed to plan kinds: "testable, visual-review available" applies to `app-route`/`rendered-page` plans whose Step 2.5 walk completed; "non-testable, or testable-with-browser-unavailable" applies to `cli`/`flow`/`diff` plans and to URL-surface plans under the browser-unavailable fallback. Its stale "Step 2 found no interactive surface" wording is updated to name the plan kinds.
- [ ] Step 4's template: one always-present `### Observation plan` section replaces the `### See it yourself (optional)` and `### Verify it yourself (manual)` sections; the Family-Gate sections' references to the retired headings are updated to name the new section (parents still omit it, and part 2's inline walkthrough still carries the human).
- [ ] `demo/SKILL.md` Step 2 rewritten show-first: execute the plan before any question — Prepare (run the plan's commands; fall back to `skills/_shared/dev-url-detection.md` when a Prepare command exits non-zero or the entry point does not respond afterward — connection refused or HTTP 404; `none` → skip) → Validate (URL surfaces only, run whenever browser tools are available — agent-browser is headless-capable: quick session confirms the exact deep link renders, attempts Auth-Vault login when credentials resolve, then closes; browser tools unavailable → skip Validate without blocking) → Show (`open <entry-point>` on macOS / `xdg-open` on Linux for URL surfaces, degrading to the validated URL plus self-contained steps when neither command exists or the call exits non-zero — the existing steps checklist survives here: self-contained `cd`, copy-paste-clean, explain surprising-but-correct state; run the command for `cli`; walk Inspect pointers in order for `flow`, opening each artifact, running its `Regenerate:` line when the artifact is gone, and treating a `Regenerate:` that itself exits non-zero exactly like a missing artifact — state it and continue, never block; render the diff for `diff`, full under ~200 lines else stat + central hunks) → one verdict `AskUserQuestion` (Approve / Request changes / Skip for now). The Option 2 verdict entry and the live-vs-steps follow-up question are deleted. Prepare/Validate failure stays evidence for Request changes, never a debugging detour. Preparation caching: "once per record per session" means one `/claude-tweaks:demo` invocation's walkthrough; what is cached is the resolved entry-point URL/port/credentials and the validation outcome — never a live browser session handle (Validate's session closes). A Request-changes verdict ends the record's walkthrough; any later re-demo is a new invocation with fresh preparation.
- [ ] `demo/SKILL.md` compatibility and fallback paths: a label-backed brief with no `### Observation plan` section (posted before this ships) walks today's Option-2 flow unchanged; session-recall composes a plan in the new schema directly from recall, per `_shared/observation-plan.md` (existing no-path-list omission rules keep governing — no recallable work → "Nothing awaiting sign-off", stop; recalled work with no confident surface → brief without a plan, straight to the verdict); closing-commit reconstruction keeps the `verificationSurface` floor (`interactive` → best-effort `app-route` plan via `skills/_shared/dev-url-detection.md`; `non-interactive` → manual steps composed as today, presented as a `cli` plan when those steps name a runnable command, else a `diff` plan).
- [ ] Anti-Patterns tables in both files updated: retire rows describing deleted branches (e.g. "Handing over 'Give me the steps' instructions without running the pre-flight first" becomes its show-first equivalent), add rows for the new failure modes (asking before showing; blocking on a stale flow pointer; skipping Validate and handing the human an unverified URL).
- [ ] `acceptance.js` header comment's consumer list corrected (comment-only): `verification-brief.md` Step 2's entry is removed from the list; demo's entry now names its closing-commit reconstruction fallback.

## Acceptance Criteria

1. `skills/_shared/observation-plan.md` exists and contains the schema block and the per-kind semantics exactly once repo-wide: `grep -rl 'Surface: rendered-page | app-route | cli | flow | diff'` over `skills/` matches the `_shared` file plus at most the two template skeletons (which carry the section heading and field names, not the semantics prose).
2. The Step 4 template block in `verification-brief.md` contains `### Observation plan` and contains neither `### See it yourself` nor `### Verify it yourself`.
3. `grep -c 'verificationSurface' skills/wrap-up/verification-brief.md` returns 0; `grep -c 'verificationSurface' skills/demo/SKILL.md` ≥ 1, with every remaining demo occurrence inside the closing-commit reconstruction path. Additionally `grep -c 'found no interactive surface' skills/wrap-up/verification-brief.md` returns 0 (Step 3's stale vocabulary is re-keyed, not just Step 2's).
4. In `demo/SKILL.md` Step 2, the verdict `AskUserQuestion` lists exactly Approve / Request changes / Skip for now — no "See it yourself"/"Verify it yourself" option label — and the literal question "Open a live session and show you, or give you the steps to check it yourself?" no longer appears anywhere in the file.
5. Read checks (ordering doesn't grep): `demo/SKILL.md` Step 2 top-to-bottom shows Prepare → Validate → Show before the verdict question, with the old-brief compatibility branch stated explicitly; `verification-brief.md` Step 3's two branches name plan kinds, not `interactive`/`non-interactive`.
6. `wc -c` on both edited skill files ≤ 40960 bytes each; if either exceeds it, content is extracted to a sub-file cited as "read `{filename}` in this skill's directory" with a stub heading left behind. The new `_shared/observation-plan.md` is also ≤ 40960 bytes.
7. Each grep in criteria 1-4 is run with a negative control (invert the claim and confirm the inverted assertion fails, one claim at a time), and every new bash snippet added to any of the three files parses under `bash -n` or runs under `bash -c` against a sample.
8. `npm test` passes in full — including `tests/pending-review-durability.test.js`, which reads the edited `verification-brief.md`.

## Technical Approach

Key decisions absorbed from the design (full rationale on the parent record): builder-baked plan because wrap-up holds surface knowledge for free; show-first always; the human's own browser with agent-browser as silent validator; the plan is text in the brief — nothing else is stored; expand-contract on the schema; schema stated once in `_shared/observation-plan.md` per the repo's stated-once convention.

### Data / API Surface

The `### Observation plan` section schema — canonical home: `skills/_shared/observation-plan.md` (created by this leaf); the two skill files cite it:

```markdown
### Observation plan
- Surface: rendered-page | app-route | cli | flow | diff
- Entry point: {deep link URL/route, or the command to run, or the diff range for `diff`}
- Prepare: {one command per `-` sub-bullet, or `none`}
- Inspect: {one pointer per `-` sub-bullet — what to open/run and what to look for;
  a flow pointer may carry one indented `Regenerate: {command}` continuation line}
```

Grammar rules (stated in the `_shared` file): one Prepare command per sub-bullet; one Inspect pointer per sub-bullet; `Regenerate:` attaches to its pointer as an indented continuation line, at most one per pointer. Per-kind field semantics: `rendered-page` — Entry point is the changed page's deep link, never the site root; `app-route` — the affected route, state-seeding in Prepare; `cli` — Entry point is the invocation, Prepare is usually `none`, output is the outcome; `flow` — Entry point is the flow's own invocation or first artifact, Prepare usually `none`, one Inspect pointer per verdict-relevant intermediate ordered by stage; `diff` — the floor: Entry point is the diff range, Prepare `none`, Inspect optional.

### Key Files

- `skills/_shared/observation-plan.md` — new: canonical schema, grammar, per-kind semantics, precedence rule
- `skills/wrap-up/verification-brief.md` — Step 2 rewrite, Step 2.5 gate condition, Step 3 branch re-keying, Step 4 template, Family-Gate prose references
- `skills/demo/SKILL.md` — Step 2 rewrite, Step 1 fallback-path adjustments, Anti-Patterns table
- `bin/lib/issues/acceptance.js` — header comment consumer list only (no code change)

### Package Dependencies

None.

## Gotchas

- Both skill files sit near the 40 KB soft ceiling (34.8 / 36.5 KB). Deleting the Option-2 machinery and the live-vs-steps question offsets additions — and moving the schema semantics to the `_shared` file helps — but measure after editing; if over, extract by the stubs' own unit, don't reorganize in place, and leave the old heading as a stub.
- `tests/pending-review-durability.test.js` pins `verification-brief.md`'s `### Branch` section field names — don't touch that section, and run the full suite after editing.
- The Family-Gate Procedure is functionally untouched: only its sentences naming the retired section headings change. Don't restructure it.
- Demo's old-brief compatibility branch must keep naming the retired headings — it reads them. State inside that branch's own text that the headings are quoted deliberately for backward compatibility, so the follow-up sweep leaf can cite the exemption instead of guessing.
- The follow-up leaf updates `docs/plugin-structure.md`'s sub-file table for the new `_shared/observation-plan.md` — don't do it here, but don't forget to tell the truth in the summary if this leaf adds further sub-files (the follow-up leaf reads this leaf's landed diff).
- Skill references inside actionable instruction text must use the fully-qualified `/claude-tweaks:{skill}` form; bare `/{skill}` is prose/tables only.
- No emojis in skill files; verify markdown insertions by reading the rendered result around them, not the diff — a stray sentence next to a fenced block lands inside the fence.
- Every relationship edge belongs in `docs/skill-graph.md`, not restated inside a SKILL.md — this leaf changes behavior, the follow-up leaf verifies the graph. A new `_shared` file is not a skill and adds no edge.

<!-- work-fingerprint: 2026-08-11-demo-observation-plan-design:observation-plan-briefs-wrap-up-authors-the-surface-plan-dem -->

