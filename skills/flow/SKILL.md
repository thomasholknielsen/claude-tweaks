---
name: claude-tweaks:flow
description: Use when you want to run an automated build → review → wrap-up pipeline on a spec or design doc without stopping between steps.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a recommended next step, not a navigation menu.


# Flow — Automated Pipeline

Run multiple lifecycle steps in sequence without stopping between them. Each step has a gate — if a gate fails, the pipeline stops and presents the failure.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorm → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                          ↑                                    ╰──────────────────────────────────────────────╯
                                                                          └── or skip /specify ────────────────╯ [ /claude-tweaks:flow ] automates this
                                                                                                  ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A spec is ready to build and you want to go from code to clean-slate in one command
- A brainstorming session just produced a design doc and you want to skip `/specify` and go straight through the pipeline
- You trust the pipeline to catch issues at gates rather than stopping for manual checkpoints
- You want to batch a build + review + wrap-up session

### When NOT to Use

- First time building a complex spec (run steps individually for more control)
- When you expect significant review findings that need discussion

## Syntax

```
/claude-tweaks:flow <spec-or-design-doc>[,spec2,spec3] [worktree] [stories] [step1,step2,step3]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<spec-or-design-doc>` | Yes | Spec number (e.g., `42`), comma-separated spec numbers (e.g., `42,45,48`), design doc path, or topic name |
| `worktree` | No | Use worktree git strategy — isolated workspace on a feature branch. See "Parallel Development with Worktrees" below. |
| `stories` | No | Include `/claude-tweaks:stories` step between build and review. Requires a running app — validation checks the URL before proceeding. |
| `[steps]` | No | Comma-separated list of steps to run. Default: `build,review,wrap-up` |

Flow always uses **subagent** execution strategy — its purpose is hands-off automation. The `batched` option (which pauses for human review) is not available in flow; use `/claude-tweaks:build batched` directly instead.

### Input resolution

1. **Single spec number** (e.g., `42`) → **Spec mode** — build uses spec tracking, review checks spec compliance
2. **Multiple spec numbers** (e.g., `42,45,48`) → **Multi-spec mode** — runs each spec sequentially in one terminal (see Multi-Spec Sequential Flow below). For true parallel execution, use separate terminals with `worktree` mode.
3. **Design doc path** (e.g., `docs/plans/*-design.md`) → **Design mode** — build reads the design doc directly, review uses git diff instead of spec compliance
4. **Topic name** (e.g., `meal planning`) → search for a matching spec AND design doc. If both exist, prefer spec mode. If only a design doc exists, use design mode.

### Examples

```
/claude-tweaks:flow 42                                              → spec mode: build, review, wrap-up
/claude-tweaks:flow 42 worktree                                     → isolated worktree: build, review, wrap-up
/claude-tweaks:flow 42 stories                                      → build, stories, review qa, review code, wrap-up
/claude-tweaks:flow 42,45,48                                        → multi-spec: sequential pipelines in one terminal
/claude-tweaks:flow 42,45,48 worktree                               → multi-spec sequential, each in its own worktree
/claude-tweaks:flow docs/plans/2026-02-21-meal-planning-design.md   → design mode: build, review, wrap-up
/claude-tweaks:flow meal planning                                   → auto-detect: spec or design mode
/claude-tweaks:flow 42 build,review                                 → spec mode: build and review only
/claude-tweaks:flow 42 review,wrap-up                               → review and wrap-up only (already built)
```

## Allowed Steps

Only automatable skills can be included in the pipeline:

| Step | Skill invoked | Why it's automatable |
|------|--------------|---------------------|
| `build` | `/claude-tweaks:build` | Fully autonomous — plans, implements, simplifies, verifies. Always uses `subagent` execution. Passes `worktree` through if specified. |
| `stories` | `/claude-tweaks:stories` | Autonomous — browses app, generates YAML stories |
| `review` | `/claude-tweaks:review` | Runs verification, code review, simplification — produces a verdict |
| `wrap-up` | `/claude-tweaks:wrap-up` | Reflection, cleanup, knowledge routing — produces actionable summary |

**Not allowed in flow:** `capture`, `challenge`, `specify`, `setup`, `codebase-onboarding`, `tidy`, `help`, `browse` — these require interactive decision-making or are utility skills.

### Step Order

Steps must follow lifecycle order. Invalid orderings are rejected:

- `build,review,wrap-up` — valid
- `build,stories,review,wrap-up` — valid (when `stories` keyword is present)
- `build,review` — valid
- `review,wrap-up` — valid (assumes build is already done)
- `wrap-up` — valid (assumes build and review are done)
- `review,build` — **invalid** (out of order)
- `wrap-up,review` — **invalid** (out of order)

## Gate Behavior

Each step has a gate that determines whether to proceed to the next step.

| Step | Gate condition | On pass | On failure |
|------|---------------|---------|-----------|
| `build` | Final verification passes (type check + lint + tests) | Proceed to next step | **STOP** — present verification failures |
| `stories` | YAML files created + no parse errors | Proceed to review qa | **STOP** — present generation failures |
| `review qa` | ALL PASSED | Proceed to review code | **STOP** — present QA failures |
| `review` | Verdict is **PASS** | Proceed to next step | **STOP** — present **BLOCKED** verdict with findings |
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

### Recommended Next

Fix the issues, then resume: `/claude-tweaks:flow {spec or design doc} {remaining steps}`
Or run the failed step manually: `/claude-tweaks:{step} {spec or design doc}`
```

## Execution

### Step 1: Validate Input

1. Parse `$ARGUMENTS` — extract spec number or design doc path, detect `worktree` keyword, plus optional step list
2. Determine mode: spec mode (number) or design mode (path/topic)
3. If `worktree` keyword is present, set git strategy to `worktree`. If not provided as an argument, prompt the user:
   ```
   Git strategy for this pipeline:
   1. Worktree **(Recommended)** — isolated workspace on a feature branch (safest for automated pipelines)
   2. Current branch — commit directly, no isolation
   ```
   This is passed through to `/claude-tweaks:build` and controls isolation. Flow always uses `subagent` execution — no prompt needed for execution strategy.
4. Validate step list is in lifecycle order
4. If spec mode: check prerequisites are met (same as `/claude-tweaks:build` Spec Step 1)
5. If design mode: verify the design doc file exists
6. If `stories` keyword is present: ask the user for the app URL (e.g., `http://localhost:3000`). Verify the URL responds using the WebFetch tool or a cross-platform HTTP check via Node.js (`node -e "require('http').get('{url}', r => { console.log(r.statusCode); r.resume() }).on('error', () => { console.error('unreachable'); process.exit(1) })"`). If unreachable, stop: "Stories step requires a running app at {url}. Start the dev server and re-run."
7. If validation fails → **stop before starting**
8. **Create the open items ledger** at `docs/plans/YYYY-MM-DD-{feature}-ledger.md` — the `{feature}` name matches the execution plan that build will create. This file tracks findings and operational tasks across all pipeline phases. Format:
   ```markdown
   # Open Items — {spec title or design topic}

   | # | Phase | Item | Status | Resolution |
   |---|-------|------|--------|------------|
   ```
   Status lifecycle: `open` → `fixed` / `deferred` / `accepted`. Each phase appends rows; wrap-up enforces resolution of every item before completing.

### Step 2: Run Pipeline

For each step in order:

1. **Announce** the step: `## Flow: Running {step} ({N}/{total})`
2. **Execute** the full skill as documented in its own SKILL.md
3. **Check the gate** — if the step fails its gate, stop the pipeline
4. **Pass context forward** — each step's output feeds into the next:
   - `build` → `stories` receives the UI changed files list + app URL
   - `stories` → `review qa` receives the stories directory
   - `review qa` → `review` (code) receives the QA verdict
   - `build` → `review` receives the build summary, changed files, and `VERIFICATION_PASSED=true` (so review skips redundant verification — see `verification.md` in the `/claude-tweaks:test` skill)
   - `review` → `wrap-up` receives the review summary and verdict
5. **Ledger carries forward** — each step reads and appends to the open items ledger. Unlike conversation context (which may be compressed), the ledger is a file — it survives context window limits.

### Step 3: Present Pipeline Summary

**Nothing-left-behind gate:** Before presenting the summary, read the open items ledger. If any item has status `open`:
1. Present the open items table
2. For each open item, determine resolution: fix now, defer (DEFERRED.md with origin/trigger), or accept with stated reason
3. Update the ledger — no item may remain `open`

The pipeline cannot complete with unresolved items.

On successful completion of all steps:

```markdown
## Flow: Pipeline Complete

### {Spec {number}: {title} | Design: {design doc topic}}

| Step | Outcome |
|------|---------|
| build | Verification passed |
| review | Verdict: PASS |
| wrap-up | Learnings captured, artifacts cleaned, ledger resolved |

### Key Outputs
- {summary of what was built}
- {summary of review findings, if any}
- {summary of wrap-up actions taken}

### Recommended Next

`/claude-tweaks:flow {next spec}` — run the pipeline on the next spec. Or `/claude-tweaks:help` for full status.
```

---

## Multi-Spec Sequential Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline **sequentially** in one terminal.

### Validation

Before starting, validate the spec list:

1. **Parse** — split on commas, resolve each to a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.

### Execution

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → review → wrap-up) before the next begins. A gate failure in one spec stops the remaining specs — present what completed and what remains.

If `worktree` is specified, each spec gets its own worktree via `/superpowers:using-git-worktrees`. The worktree is finished via `/superpowers:finishing-a-development-branch` before the next spec begins.

### Multi-Spec Summary

After all specs complete (or one fails), present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete

| Spec | Build | Review | Wrap-Up | Outcome |
|------|-------|--------|---------|---------|
| {N} | passed | PASS | done | Complete |
| {N} | passed | BLOCKED | — | Stopped at review |
| {N} | — | — | — | Not started (previous spec failed) |

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

### Recommended Next
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

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | First step in the default pipeline — runs in spec mode or design mode depending on flow input |
| `/claude-tweaks:stories` | Optional step between build and review — generates QA stories when `stories` keyword is present |
| `/claude-tweaks:review` | Review step — receives build output, produces verdict. Includes QA mode when stories step ran. |
| `/claude-tweaks:wrap-up` | Final step — receives review output, produces clean slate |
| `/claude-tweaks:help` | Shows pipeline status and recommends flow-ready specs |
| `/claude-tweaks:specify` | Creates the specs that flow consumes |
| `/claude-tweaks:browse` | Used transitively — /stories and /review visual/qa modes use /browse for browser interaction |
| `/superpowers:brainstorm` | Produces the design docs that flow consumes in design mode — skipping /specify |
| `/superpowers:using-git-worktrees` | Invoked BY flow (when `worktree` specified) to create isolated workspace for each spec |
| `/superpowers:finishing-a-development-branch` | Invoked BY flow (when `worktree` specified) at handoff to merge, PR, or discard each feature branch |
