---
name: claude-tweaks:flow
description: Use when you want to run an automated build → test → review → wrap-up pipeline on a spec or design doc without stopping between steps.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Flow — Automated Pipeline

Run multiple lifecycle steps in sequence without stopping between them. Each step has a gate — if a gate fails, the pipeline stops and presents the failure.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /brainstorm → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                          ↑                                    ╰──────────────────────────────────────────────────────────────────────╯
                                                                          └── or skip /specify ────────────────╯ [ /claude-tweaks:flow ] automates this
                                                                                                  ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A spec is ready to build and you want to go from code to clean-slate in one command
- A brainstorming session just produced a design doc and you want to skip `/specify` and go straight through the pipeline
- You trust the pipeline to catch issues at gates rather than stopping for manual checkpoints
- You want to batch a build + test + review + wrap-up session

### When NOT to Use

- First time building a complex spec (run steps individually for more control)
- When you expect significant review findings that need discussion

## Syntax

```
/claude-tweaks:flow <spec-or-design-doc>[,spec2,spec3] [worktree] [no-stories] [step1,step2,step3]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<spec-or-design-doc>` | Yes | Spec number (e.g., `42`), comma-separated spec numbers (e.g., `42,45,48`), design doc path, or topic name |
| `worktree` | No | Use worktree git strategy — isolated workspace on a feature branch. See "Parallel Development with Worktrees" below. |
| `no-stories` | No | Skip automatic story generation even if UI files changed. By default, flow auto-generates stories when the build produces UI file changes. |
| `[steps]` | No | Step argument(s). Single step = resume from that step onward. Comma-separated steps = run exactly those steps. Default (no steps): `build,test,review,wrap-up` |

Flow always uses **subagent** execution strategy — its purpose is hands-off automation. The `batched` option (which pauses for human review) is not available in flow; use `/claude-tweaks:build batched` directly instead.

### Input resolution

1. **Single spec number** (e.g., `42`) → **Spec mode** — build uses spec tracking, review checks spec compliance
2. **Multiple spec numbers** (e.g., `42,45,48`) → **Multi-spec mode** — runs each spec sequentially in one terminal (see Multi-Spec Sequential Flow below). For true parallel execution, use separate terminals with `worktree` mode.
3. **Design doc path** (e.g., `docs/plans/*-design.md`) → **Design mode** — build reads the design doc directly, review uses git diff instead of spec compliance
4. **Topic name** (e.g., `meal planning`) → search for a matching spec AND design doc. If both exist, prefer spec mode. If only a design doc exists, use design mode.

### Automatic story generation

After build completes, flow checks the build output for UI file changes (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, or files in component/page directories). If UI files changed and `no-stories` was not specified:

1. Auto-detect the dev server URL using `dev-url-detection.md` from the `/claude-tweaks:stories` skill's directory
2. Run `/claude-tweaks:stories` with the detected URL. When journey files exist in `docs/journeys/` (created by `/build` Common Step 6), the stories step ingests them before browsing — the `journey:` field is set on derived stories, source files are inherited from the journey's `files:` frontmatter, and browsing is enrichment rather than fresh discovery for journey-documented pages.
3. Generated stories feed into `/claude-tweaks:test` (which validates them as part of the test step)

If no UI files changed, or `no-stories` is set, the stories step is skipped.

### Examples

```
/claude-tweaks:flow 42                                              → full pipeline: build, test, review, wrap-up (stories auto-generated if UI changed)
/claude-tweaks:flow 42 worktree                                     → isolated worktree: full pipeline
/claude-tweaks:flow 42 no-stories                                   → full pipeline (skip stories even if UI changed)
/claude-tweaks:flow 42,45,48                                        → multi-spec: sequential full pipelines in one terminal
/claude-tweaks:flow 42,45,48 worktree                               → multi-spec sequential, each in its own worktree
/claude-tweaks:flow docs/plans/2026-02-21-meal-planning-design.md   → design mode: full pipeline
/claude-tweaks:flow meal planning                                   → auto-detect: spec or design mode
/claude-tweaks:flow 42 review                                       → resume from review: runs review + wrap-up
/claude-tweaks:flow 42 test                                         → resume from test: runs test + review + wrap-up
/claude-tweaks:flow 42 wrap-up                                      → resume from wrap-up only
/claude-tweaks:flow 42 review,wrap-up                               → explicit subset: runs ONLY review and wrap-up
/claude-tweaks:flow 42 build,test                                   → explicit subset: runs ONLY build and test
```

## Allowed Steps

Only automatable skills can be included in the pipeline:

| Step | Skill invoked | Why it's automatable |
|------|--------------|---------------------|
| `build` | `/claude-tweaks:build` | Fully autonomous — plans, implements, simplifies, verifies. Always uses `subagent` execution. Passes `worktree` through if specified. |
| `stories` | `/claude-tweaks:stories` | Autonomous — browses app, generates YAML stories. Auto-triggered when build produces UI file changes (unless `no-stories`). |
| `test` | `/claude-tweaks:test` | Mechanical pass/fail gate — types, lint, tests, QA story validation. Sets `TEST_PASSED=true` on pass. |
| `review` | `/claude-tweaks:review` | Code review, simplification, visual browser review with idea generation (when browser available) — produces a verdict. Gates on `TEST_PASSED`. |
| `wrap-up` | `/claude-tweaks:wrap-up` | Reflection, cleanup, knowledge routing — produces actionable summary |

**Not allowed in flow:** `capture`, `challenge`, `specify`, `setup`, `codebase-onboarding`, `tidy`, `help`, `browse` — these require interactive decision-making or are utility skills.

### Step Arguments

Steps must follow lifecycle order. Invalid orderings are rejected.

| Form | Meaning | Example |
|------|---------|---------|
| No steps | Full pipeline | `/flow 42` → build, test, review, wrap-up |
| Single step | Resume from that step onward | `/flow 42 review` → review, wrap-up |
| Multiple steps (comma-separated) | Run exactly those steps | `/flow 42 review,wrap-up` → review, wrap-up only |

**Resume mode** (single step argument, no comma) assumes all prior steps completed successfully. The pipeline reads existing context (ledger, `TEST_PASSED`, etc.) from files rather than generating it. If prior context is missing (e.g., no ledger file when resuming from review), the pipeline creates fresh context as needed and notes: "No existing ledger found — creating fresh."

**Explicit subset** (comma-separated steps) runs only the listed steps. Context from skipped prior steps is read from files if available.

**Valid examples:**
- `build,test,review,wrap-up` — valid (default; stories auto-inserted if UI changed)
- `build,stories,test,review,wrap-up` — valid (stories always runs regardless of UI changes)
- `build,test,review` — valid
- `build,test` — valid
- `test,review,wrap-up` — valid (assumes build is already done)
- `review,wrap-up` — valid (assumes build and test are done)
- `wrap-up` — valid (assumes build, test, and review are done)
- `review,build` — **invalid** (out of order)
- `wrap-up,review` — **invalid** (out of order)

**Auto-insert `test`:** If `review` is in the step list but `test` is not, auto-insert `test` before `review` and note: "Auto-inserted `test` before `review` — review gates on test passing." This ensures backward compatibility.

## Gate Behavior

Each step has a gate that determines whether to proceed to the next step.

| Step | Gate condition | On pass | On failure |
|------|---------------|---------|-----------|
| `build` | Final verification passes (type check + lint + tests) | Check for UI changes → auto-trigger stories if applicable → proceed | **STOP** — present verification failures |
| `stories` (auto) | YAML files created + no parse errors | Proceed to test | **STOP** — present generation failures |
| `test` | All checks pass — types, lint, tests, QA (when stories exist). Sets `TEST_PASSED=true`. | Proceed to review | **STOP** — present test/QA failures |
| `review` | Verdict is **PASS**. Gates on `TEST_PASSED=true`. Runs in full mode (code + visual) when browser available; falls back to code mode otherwise. | Proceed to next step | **STOP** — present **BLOCKED** verdict with findings |
| `wrap-up` | Always passes | Pipeline complete | — |

### On Gate Failure

When a gate fails, the pipeline stops immediately. Present:

```markdown
## Flow: Pipeline Stopped

### Completed
- {step}: {outcome}

### Failed at: {step}
{failure details from the step's output}

### Open Items (at time of failure)
{current ledger contents — so the user sees what's been tracked}

### Manual Steps Required (collected so far)
| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
(or: No manual steps collected yet.)

> These were detected before the pipeline stopped. Address them alongside the fix.

### Actions Performed

{Include rows from completed phases before the failure. Omit when pipeline failed at the first step.}

| Action | Detail | Ref |
|--------|--------|-----|
| {rows from completed phases} | ... | ... |

### Next Actions

1. `/claude-tweaks:flow {spec} {failed-step}` — resume from {failed step} **(Recommended)**
2. `/claude-tweaks:{step} {spec}` — run {failed step} manually for more control
{If test failed:}
3. `/claude-tweaks:test` — re-verify after fixes
```

## Execution

### Step 1: Validate Input

1. Parse `$ARGUMENTS` — extract spec number or design doc path, detect `worktree` and `no-stories` keywords, plus optional step list
2. Determine mode: spec mode (number) or design mode (path/topic)
3. If `worktree` keyword is present, set git strategy to `worktree`. If not provided as an argument, prompt the user:
   ```
   Git strategy for this pipeline:
   1. Worktree **(Recommended)** — isolated workspace on a feature branch (safest for automated pipelines)
   2. Current branch — commit directly, no isolation
   ```
   This is passed through to `/claude-tweaks:build` and controls isolation. Flow always uses `subagent` execution — no prompt needed for execution strategy.
   If `auto` keyword is present, default to `worktree` without prompting. `auto` can be overridden with explicit `current-branch`.
4. Validate step list is in lifecycle order. Auto-insert `test` before `review` if `test` is missing from the step list (with a note).
4. If spec mode: check prerequisites are met (same as `/claude-tweaks:build` Spec Step 1)
5. If design mode: verify the design doc file exists
6. If validation fails → **stop before starting**
8. **Create the open items ledger** using `/claude-tweaks:ledger`'s create operation. The `{feature}` name matches the execution plan that build will create. This file tracks findings and operational tasks across all pipeline phases. See `/claude-tweaks:ledger` for status lifecycle and phase taxonomy.

### Step 2: Run Pipeline

For each step in order:

1. **Announce** the step: `## Flow: Running {step} ({N}/{total})`
2. **Execute** the full skill as documented in its own SKILL.md
3. **Check the gate** — if the step fails its gate, stop the pipeline
4. **Pass context forward** — each step's output feeds into the next:
   - `build` → check output for UI file changes (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, component/page directories). If UI changed and `no-stories` not set → auto-detect dev URL via `dev-url-detection.md` and run `stories` step.
   - `stories` → `test` receives the stories directory
   - `build` → `test` receives `VERIFICATION_PASSED=true` (so test skips redundant types/lint/tests — see `verification.md` in the `/claude-tweaks:test` skill). Test still runs QA if stories exist.
   - `test` → `review` receives `TEST_PASSED=true` and QA results. Flow invokes `/claude-tweaks:review` in **full** mode (code + visual review) by default:
     - **Detect browser backend:** Run backend detection from `/claude-tweaks:browse` (same detection as the stories step).
     - **Browser available:** Invoke `/claude-tweaks:review {spec-or-design-doc} full`. The visual review auto-detects the dev server URL using `dev-url-detection.md` from the `/claude-tweaks:stories` skill's directory. When QA data exists from the test step, the visual review consumes page inventories, caveats, and screenshots to enrich its analysis and idea generation.
     - **No browser available:** Invoke `/claude-tweaks:review {spec-or-design-doc}` (code mode). Note in the pipeline output: "Visual review skipped — no browser backend available. To enable, run `/claude-tweaks:setup` and choose browser integration."
   - `review` → `wrap-up` receives the review summary and verdict. Skill observations (`build/skill` and `review/skill` ledger entries) carry forward via the ledger file for wrap-up's skill update analysis (Step 7).
5. **Ledger carries forward** — each step reads and appends to the open items ledger (see `/claude-tweaks:ledger` for all operations). Unlike conversation context (which may be compressed), the ledger is a file — it survives context window limits.

### Step 3: Present Pipeline Summary

**Nothing-left-behind gate:** Run the resolve gate from `/claude-tweaks:ledger`. If any item has status `open`, present it for resolution -- no item may remain `open`. The pipeline cannot complete with unresolved items.

On successful completion of all steps:

```markdown
## Flow: Pipeline Complete

### {Spec {number}: {title} | Design: {design doc topic}}

| Step | Outcome |
|------|---------|
| build | Verification passed |
| stories | {Generated N stories | Skipped — no UI changes | Skipped — no-stories} |
| test | {Passed (types + lint + tests) | Passed (QA: N stories) | Passed (verification skipped — passed in build, QA: N stories)} |
| review | Verdict: PASS {(code + visual) | (code only — no browser)} |
| wrap-up | Learnings captured, artifacts cleaned, ledger resolved |

### Key Outputs
- {summary of what was built}
- {summary of review findings, if any}
- {summary of wrap-up actions taken}

### Manual Steps Required
| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
(or: No manual steps — nothing to do outside the codebase.)

> Complete these after merging. The pipeline detected them but cannot execute them.

### Actions Performed

{Rolled-up table from all phases. When >15 rows, collapse to per-phase summaries.}

| Action | Detail | Ref |
|--------|--------|-----|
| {rows from build, stories, review, wrap-up phases} | ... | ... |

### Next Actions

1. `/claude-tweaks:flow {next spec}` — full pipeline on spec {N}: "{title}" **(Recommended)**
2. `/claude-tweaks:help` — full pipeline status
{If unblocked specs:}
3. `/claude-tweaks:build {N}` — spec {N} "{title}" now unblocked
```

---

## Multi-Spec Sequential Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline **sequentially** in one terminal.

### Validation

Before starting, validate the spec list:

1. **Parse** — split on commas, resolve each to a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.

### Execution

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins. A gate failure in one spec stops the remaining specs — present what completed and what remains.

If `worktree` is specified, each spec gets its own worktree via `/using-git-worktrees`. The worktree is finished via `/finishing-a-development-branch` before the next spec begins.

### Multi-Spec Summary

After all specs complete (or one fails), present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete

| Spec | Build | Test | Review | Wrap-Up | Outcome |
|------|-------|------|--------|---------|---------|
| {N} | passed | passed | PASS | done | Complete |
| {N} | passed | passed | BLOCKED | — | Stopped at review |
| {N} | — | — | — | — | Not started (previous spec failed) |

### Manual Steps Required (all specs)
| # | Spec | What | Where |
|---|------|------|-------|
| 1 | {N} | {description} | {source} |
(or: No manual steps required.)

### Per-Spec Details
(expand each spec's key outputs, failures, and review findings)
```

---

## Parallel Development with Worktrees

For true parallel execution, run separate terminals with `worktree` mode — each terminal gets an isolated copy of the repository:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:flow 42 worktree      /claude-tweaks:flow 45 worktree      /claude-tweaks:flow 48 worktree
```

Each terminal creates its own worktree and feature branch. There is no file overlap risk because each worktree is a full, isolated copy.

### When to use worktree mode

- **Parallel work** — multiple specs building simultaneously in separate terminals
- **Team projects** — isolated branches ready for PR review
- **Risky changes** — experiment without affecting the main working tree

### When to use current-branch mode

- **Solo work** — simple, sequential, fast
- **Quick specs** — low risk, no isolation needed
- **Single terminal** — no need for parallel execution

### Merge Reconciliation (after parallel worktree runs)

After all terminals complete, merge the feature branches back. Run this once from the main working tree:

#### Merge Order

1. Sort completed branches by diff size (smallest first — run `git diff --stat main..{branch}` and read the summary line at the end of its output)
2. Merge branches sequentially into the base branch

#### Merge Procedure

For each completed branch (in order):

1. `git merge {branch}` into the base branch
2. **If merge succeeds** — continue to the next branch
3. **If merge conflicts** — present the conflicts:
   ```
   Merge conflict merging {branch}:

   Conflicting files:
   - {file1}
   - {file2}

   1. Resolve conflicts now **(Recommended)** — I'll resolve based on both specs' intent
   2. Skip this branch — merge remaining branches first, come back to this one
   3. Abort all remaining merges — I'll handle merges manually
   ```
4. After all merges, update `specs/INDEX.md` to reflect completed specs

#### Post-Merge Summary

```markdown
### Merge Results

| Branch | Spec | Merge Status |
|--------|------|-------------|
| {branch} | {N} | Merged cleanly |
| {branch} | {N} | Merged with conflict resolution |
| {branch} | {N} | Skipped (pipeline failed) |

### Next Actions
- Failed specs: fix issues and re-run `/claude-tweaks:flow {spec} worktree {remaining steps}`
- All merged: run `/claude-tweaks:help` for full pipeline status
```

---

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Using flow for first-time complex specs | You lose the ability to course-correct between steps — run manually first |
| Ignoring gate failures and restarting | Gates exist to catch real problems — investigate before retrying |
| Running flow on specs with unmet prerequisites | The pipeline will fail at build — check dependencies first |
| Using flow for interactive skills | Capture, challenge, and specify need human decisions — they can't be automated |
| Using `batched` execution in flow | Flow's purpose is hands-off automation — batched pauses for human review, contradicting flow's no-stopping design. Use `/claude-tweaks:build batched` directly. |
| Ignoring open ledger items at pipeline end | The nothing-left-behind gate prevents dropped work — every item must be explicitly resolved |
| Skipping test in the pipeline | Test is the mechanical gate — review depends on `TEST_PASSED`. Omitting test means review runs on potentially broken code. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | First step in the default pipeline — runs in spec mode or design mode depending on flow input. Sets `VERIFICATION_PASSED=true`. |
| `/claude-tweaks:stories` | Auto-triggered between build and test when UI files change (unless `no-stories`). Ingests journey files from `/build` for journey-aware story generation. Uses `dev-url-detection.md` for URL resolution. |
| `/claude-tweaks:test` | Mechanical gate between build/stories and review — types, lint, tests, QA. Receives `VERIFICATION_PASSED` from build (skips redundant checks). Sets `TEST_PASSED=true`. |
| `/claude-tweaks:review` | Analytical gate — receives `TEST_PASSED=true` from test, produces verdict. Runs in **full** mode (code + visual) by default when browser available; code mode fallback otherwise. Never runs verification or QA itself. |
| `/claude-tweaks:wrap-up` | Final step — receives review output, produces clean slate |
| `/claude-tweaks:help` | Shows pipeline status and recommends flow-ready specs |
| `/claude-tweaks:specify` | Creates the specs that flow consumes |
| `/claude-tweaks:browse` | Used transitively — /stories and /review visual modes use /browse for browser interaction |
| `/brainstorm` | Produces the design docs that flow consumes in design mode — skipping /specify |
| `/using-git-worktrees` | Invoked BY flow (when `worktree` specified) to create isolated workspace for each spec |
| `/finishing-a-development-branch` | Invoked BY flow (when `worktree` specified) at handoff to merge, PR, or discard each feature branch |
| `/claude-tweaks:ledger` | Manages the open items ledger. /flow creates the ledger (Step 1), carries it across phases, and runs the resolve gate (Step 3). |
