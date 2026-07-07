---
tier: 3
status: complete
progress: 100
blocked-by: [5]
surface: backend
---

# 07: AskUserQuestion adoption — Lifecycle B (specify, build, test)

## Overview

Applies the `AskUserQuestion` convention established in Spec 05 to the `specify`, `build`, and `test` lifecycle skills. These three share a natural grouping: `/build` is the implementation stage `/specify` hands off to, and `/test` is `/build`'s verification gate — all three sit adjacent in the pipeline and each carries a mix of inline decisions, one batch-table site, and situational `## Next Actions` renderings.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Does not touch any other skill family — `init`/`capture`/`challenge` (Spec 06), `stories`/`review`/`wrap-up` (Spec 08), `reflect`/`simplify`/`deepen` (Spec 09), `journeys`/`visual-review`/`design` (Spec 10), `help`/`tidy`/`flow`/`browse` (Spec 11), `ledger`/`version`/`research`/`code-health`/`routine`/`harness-health` (Spec 12).
- Does not redesign the canonical `AskUserQuestion` directive wording or the Pattern A/B/C definitions — those are Spec 05's output; this spec only applies them.
- Does not touch `skills/build/worktree-setup.md`, `operational-checklist.md`, `design-prebuild.md`, or `failure-recovery.md` — verified via case-insensitive grep for "numbered options", "apply all", and an anchored `^## Next Actions` heading; none of these four sub-files contain any of the three patterns. **Correction from an earlier draft:** `plan-audit.md` was previously (incorrectly) included in this exclusion list — it does contain a real Pattern A site (its own 3-option "Add to plan and continue / Continue without / Stop" prompt), the same prompt `build/SKILL.md`'s one-line summary describes. It is now in scope — see Deliverables and Technical Approach below.
- Does not change any `auto`-mode branch in any of the five files — `AskUserQuestion` is interactive-only; every site below has a parallel `**Auto mode:**` or policy-lookup branch elsewhere in the same file that stays untouched.
- Does not touch `verification.md`, `qa-procedures.md`, `qa-prompts.md`, `qa-reporting.md`, or `report-templates.md` (test's sub-files) — none contain the three patterns (verified by the same grep).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 5 | AskUserQuestion adoption — Foundation | not-started |

## Current State

- `skills/specify/SKILL.md` line 5 — Interaction style directive (boilerplate). Lines 64-70 — "Ambiguous input handling" inline decision. Lines 120-137 — overlap-analysis batch table with a 2-option terminal decision. Lines 393-404 — `## Next Actions` section, a 4-row situational lookup table (each situation renders a distinct 2-3 option list).
- `skills/build/SKILL.md` line 5 — Interaction style directive. Line 168 — Common Step 1.5 Plan Audit's one-line "Interactive mode" description of a 3-option prompt (full procedure lives in `plan-audit.md`, out of scope; only this summary line in SKILL.md is in scope). Lines 276-293 — `## Next Actions` section with one worked 3-option example plus a 4-row signal-to-option lookup table.
- `skills/build/build-options.md` lines 46-53 — "Topic name" 2-option inline decision (spec mode vs. design mode). Lines 58-71 — "Prompt for build options" 4-option (or 2-option) inline decision.
- `skills/build/architecture-alignment.md` lines 23-35 — "Interactive mode — single batch table" with a 2-option terminal decision ("Apply all" / "Override specific rows").
- `skills/test/SKILL.md` line 5 — Interaction style directive. Lines 210-217 — Step 3 Fix Mode 3-option inline decision. Lines 226-233 — QA-failures 3-option inline decision. Lines 237-246 — `## Next Actions` section, a 4-row situational lookup table.

## Deliverables

- [x] Replace the Interaction style directive blockquote (line 5) in `skills/specify/SKILL.md`, `skills/build/SKILL.md`, and `skills/test/SKILL.md` with the canonical text from Spec 05.
- [x] Convert `specify/SKILL.md`'s "Ambiguous input handling" 2-option prompt to an `AskUserQuestion` call.
- [x] Convert `specify/SKILL.md`'s overlap-analysis batch table's terminal 2-option decision ("Apply all recommended" / "Override specific items") to an `AskUserQuestion` call; the batch table itself stays as markdown.
- [x] Convert `specify/SKILL.md`'s `## Next Actions` section: each of the 4 situational renderings becomes an `AskUserQuestion` call with that situation's options.
- [x] Update `build/SKILL.md` Common Step 1.5's one-line "Interactive mode" description to say the 3-option prompt ("Add to plan and continue / Continue without / Stop") is presented via `AskUserQuestion`.
- [x] Convert `build/plan-audit.md`'s own copy of this same 3-option prompt (the full procedure, not just SKILL.md's one-line summary) to an `AskUserQuestion` call with the same 3 options, first suffixed `(Recommended)`. This is the same decision as the deliverable above, implemented in the file that actually contains its full logic — do not treat SKILL.md's summary-line update as sufficient on its own.
- [x] Convert `build/SKILL.md`'s `## Next Actions` worked example and its signal-to-option lookup table's rendering into an `AskUserQuestion` call.
- [x] Convert `build-options.md`'s "Topic name" 2-option prompt (spec mode vs. design mode) to an `AskUserQuestion` call.
- [x] Convert `build-options.md`'s "Prompt for build options" 4-option (execution × git) prompt, and its 2-option fallback (when only one axis is missing), to `AskUserQuestion` calls.
- [x] Convert `architecture-alignment.md`'s batch table's terminal 2-option decision ("Apply all" / "Override specific rows") to an `AskUserQuestion` call; the deviations table itself stays as markdown.
- [x] Convert `test/SKILL.md`'s Step 3 Fix Mode 3-option prompt ("Fix automatically" / "Show details only" / "Skip") to an `AskUserQuestion` call.
- [x] Convert `test/SKILL.md`'s QA-failures 3-option prompt ("Show failure details" / "Re-run failed stories" / "Skip") to an `AskUserQuestion` call.
- [x] Convert `test/SKILL.md`'s `## Next Actions` section: each of the 4 situational rows becomes an `AskUserQuestion` call (rows that are not user decisions, like "Verification failed → fix and re-run", stay as prose instructions, not a choice — see Gotchas).

## Acceptance Criteria

1. `grep -c "AskUserQuestion" skills/specify/SKILL.md skills/build/SKILL.md skills/build/build-options.md skills/build/architecture-alignment.md skills/build/plan-audit.md skills/test/SKILL.md` returns a nonzero count for every one of the 6 files.
2. `skills/specify/SKILL.md`'s "Ambiguous input handling" section no longer contains the literal text `1. Topic name — invoke /superpowers:brainstorming to produce a design doc` as a plain numbered list; it instructs an `AskUserQuestion` call with two options carrying that same text as descriptions.
3. `skills/specify/SKILL.md`'s overlap-analysis section still renders the `| # | Section | Existing spec | Coverage | Recommended | Override? |` batch table as markdown, but the line `1. Apply all recommended **(Recommended)**` / `2. Override specific items (tell me which #s to change and to what)` is replaced with instructions to call `AskUserQuestion` with those two options.
4. `skills/build/build-options.md` no longer contains the literal text `1. Subagent + worktree **(Recommended)**` as a plain numbered list; the "Prompt for build options" section instructs an `AskUserQuestion` call with the same 4 options (or 2, in the single-missing-axis case).
5. `skills/build/architecture-alignment.md`'s "Interactive mode — single batch table" section still renders the `| # | Deviation | What the spec said | What was built | Recommended |` table as markdown, but `1. Apply all **(Recommended)**` / `2. Override specific rows (tell me which #s to reclassify and to what)` is replaced with an `AskUserQuestion` call.
6. `skills/test/SKILL.md`'s Step 3 Fix Mode section no longer contains the literal text `1. Fix automatically — I'll address these failures now` as a plain numbered list; it instructs an `AskUserQuestion` call with the same 3 options.
7. `skills/test/SKILL.md`'s QA-failures section no longer contains the literal text `1. Show failure details` as a plain numbered list; it instructs an `AskUserQuestion` call with the same 3 options.
8. Each of `specify/SKILL.md`, `build/SKILL.md`, and `test/SKILL.md`'s `## Next Actions` sections instructs rendering via `AskUserQuestion` for every row/situation that is genuinely a user choice; rows that are pure instructions (no choice — e.g. `test/SKILL.md`'s "Verification failed (types/lint/tests) → Fix the failures, then re-run") remain plain prose, not converted into a single-option `AskUserQuestion` call.
9. None of the five files' `**Auto mode:**` / auto-mode policy-lookup sections changed (diff review confirms only `**Interactive mode:**` / user-facing prompt text changed).

## Technical Approach

No data model or API surface — documentation/skill-content changes only.

### `specify/SKILL.md` — Ambiguous input handling (Pattern A)

Before:
```
"{input}" could be a topic name or a path. Which did you mean?
1. Topic name — invoke /superpowers:brainstorming to produce a design doc
2. Design doc path — read the file directly
```
After: instruct calling `AskUserQuestion` with `header: "Input type"`, two options — `label: "Topic name"`, `description: "invoke /superpowers:brainstorming to produce a design doc"`; `label: "Design doc path"`, `description: "read the file directly"`.

### `specify/SKILL.md` — Overlap analysis (Pattern B)

The `| # | Section | ... |` batch table stays as markdown. Replace the trailing:
```
1. Apply all recommended **(Recommended)**
2. Override specific items (tell me which #s to change and to what)
```
with an instruction to call `AskUserQuestion` with those exact two options (first labeled `(Recommended)`).

### `specify/SKILL.md` — Next Actions (Pattern C)

The "Situation → Next Actions block" table (4 rows) stays as the assistant's own lookup logic to pick which situation applies. Replace the *rendering* of the chosen row's numbered list (e.g. `1. /claude-tweaks:flow {N} — ... **(Recommended)**`) with an `AskUserQuestion` call whose options carry the row's commands as descriptions and short labels (e.g. "Pipeline this spec", "Build only", "Pipeline dashboard").

### `build/SKILL.md` — Plan Audit interactive-mode line (Pattern A)

Before: `**Interactive mode:** present a numbered prompt with "Add to plan and continue / Continue without / Stop."`
After: `**Interactive mode:** call \`AskUserQuestion\` with three options: "Add to plan and continue" (Recommended), "Continue without", "Stop".` (The full procedure detail stays in `plan-audit.md`, out of this spec's scope — this is only the one-line summary in SKILL.md.)

### `build/SKILL.md` — Next Actions (Pattern C)

Before:
```
1. /claude-tweaks:review 42 full — code + visual review **(Recommended)**
2. /claude-tweaks:test qa — validate 7 QA stories before review
3. /superpowers:finishing-a-development-branch — merge, PR, or discard the feature branch
```
After: the signal-to-option lookup table stays as-is (it's the assistant's own logic for picking which options apply to the current build's signals, not something the user sees). Replace the rendered numbered-list output with an `AskUserQuestion` call. Option 1's command switches on the browser-availability signal exactly as the current table does — do not collapse the two branches into always-`full`: when UI changed AND a browser is available, `label: "Code + visual review"` / `description: "/claude-tweaks:review {N} full — code + visual review"`; otherwise `label: "Code review"` / `description: "/claude-tweaks:review {N} — code review"` — either way suffixed `(Recommended)` unless worktree mode makes option 3 the recommendation instead. Option 2 — `label: "QA validation"`, `description: "/claude-tweaks:test qa — validate {X} QA stories before review"`. Option 3 — `label: "Finish branch"`, `description: "/superpowers:finishing-a-development-branch — merge, PR, or discard the feature branch"`, suffixed `(Recommended)` when in worktree mode instead of option 1.

### `build-options.md` — Topic name ambiguity (Pattern A)

Before:
```
Found both a spec and a design doc for "{topic}":
1. Spec mode (spec {N}: {title}) — Full lifecycle with prerequisites and tracking
2. Design mode ({design doc filename}) — Build directly, skip spec machinery
```
After: instruct calling `AskUserQuestion` with `header: "Build mode"`, two options carrying the same label/description text.

### `build-options.md` — Prompt for build options (Pattern A)

Before (4-option case):
```
How should this build run?
1. Subagent + worktree **(Recommended)** — automated review chain, isolated workspace
2. Subagent + current-branch — automated review chain, no isolation
3. Batched + worktree — human reviews every 3 tasks, isolated workspace
4. Batched + current-branch — human reviews every 3 tasks, no isolation
```
After: instruct calling `AskUserQuestion` with `header: "Build strategy"`, exactly these 4 options (fits the tool's 4-option cap precisely), first suffixed `(Recommended)`. When only one axis is missing (2-option case), the same instruction applies with 2 options instead of 4.

### `architecture-alignment.md` — Batch table terminal decision (Pattern B)

The `| # | Deviation | What the spec said | What was built | Recommended |` table stays as markdown. Replace:
```
1. Apply all **(Recommended)**
2. Override specific rows (tell me which #s to reclassify and to what)
```
with an `AskUserQuestion` call carrying those exact two options.

### `test/SKILL.md` — Step 3 Fix Mode (Pattern A)

Before:
```
{N} failure(s) found.
1. Fix automatically — I'll address these failures now **(Recommended when failures are mechanical: lint/type/simple test failures)**
2. Show details only — I'll investigate but not change code
3. Skip — I'll fix these manually
```
After: instruct calling `AskUserQuestion` with `header: "Fix failures"`, three options carrying the same label/description text; the `(Recommended)` suffix is conditional on failure type exactly as today (only apply it when failures are mechanical).

### `test/SKILL.md` — QA failures (Pattern A)

Before:
```
{N} QA story failure(s) found. QA failures require investigation — they cannot be auto-fixed.
1. Show failure details — I'll investigate the root cause via reproduce-first debugging (`/superpowers:systematic-debugging`) **(Recommended)**
2. Re-run failed stories — `/claude-tweaks:test qa retry={RUN_DIR}`
3. Skip — I'll investigate manually
```
After: instruct calling `AskUserQuestion` with `header: "QA failures"`, three options carrying the same label/description text, first suffixed `(Recommended)`.

### `test/SKILL.md` — Next Actions (Pattern C)

The 4-row situational table stays as the assistant's lookup logic. The table's two "pass" rows are not two separate single-option situations — they are two alternative commands for the same outcome (plain code review vs. code + visual review), differing only in whether UI files changed and a browser is available. On any pass outcome, present **both** as one `AskUserQuestion` call with exactly 2 options: `label: "Code review"`, `description: "/claude-tweaks:review {spec} — code review quality gate"`; `label: "Code + visual review"`, `description: "/claude-tweaks:review {spec} full — code + visual review"`. Whichever one matches the current run's actual signal (UI changed + browser available → visual; otherwise → plain) gets `(Recommended)` on its label. The other two rows (`Verification failed`, `QA failed`) are not a user choice — they are single deterministic next steps ("Fix the failures, then re-run"). Per Acceptance Criterion 8, leave these two as plain prose instructions; do not force them into a one-option `AskUserQuestion` call.

### Key Files

- `skills/specify/SKILL.md`
- `skills/build/SKILL.md`
- `skills/build/build-options.md`
- `skills/build/architecture-alignment.md`
- `skills/build/plan-audit.md`
- `skills/test/SKILL.md`

### Package Dependencies

None.

## Gotchas

- `build-options.md`'s 4-option "Prompt for build options" is the one site in this spec that lands exactly on `AskUserQuestion`'s 4-option cap — do not add a 5th option (e.g., an "ask me more" escape) since `Other` already covers anything not listed.
- `test/SKILL.md`'s `## Next Actions` table mixes genuine choices with deterministic single-path instructions (see Technical Approach's Next Actions section) — converting every row into a forced `AskUserQuestion` call, including the non-choice rows, would be a regression, not an improvement. Only convert rows that are actually a decision.
- `build/SKILL.md`'s Common Step 1.5 only contains the one-line interactive-mode summary of the Plan Audit prompt; the full decision procedure (Check A/B failure handling, auto-mode policy table, and the actual 3-option prompt) lives in `plan-audit.md`. An earlier draft of this spec incorrectly excluded that file as having "no matching content" — it does, and it's now in scope (see Deliverables). Convert both the SKILL.md summary line and `plan-audit.md`'s own prompt together; converting only the summary line would leave the file that actually renders the prompt unconverted.
- `specify/SKILL.md` is the very skill currently producing this spec decomposition (this file is self-referential) — when this spec is later built, note that `/claude-tweaks:specify`'s own Step 1 (Overlap Analysis), Ambiguous input handling, and Next Actions sections are the ones being modified, not a separate copy.

## Manual Steps

None.
