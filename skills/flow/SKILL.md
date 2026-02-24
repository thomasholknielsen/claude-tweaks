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
/claude-tweaks:flow <spec-or-design-doc>[,spec2,spec3] [stories] [step1,step2,step3]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<spec-or-design-doc>` | Yes | Spec number (e.g., `42`), comma-separated spec numbers (e.g., `42,45,48`), design doc path, or topic name |
| `stories` | No | Include `/claude-tweaks:stories` step between build and review. Requires a running app — validation checks the URL before proceeding. |
| `[steps]` | No | Comma-separated list of steps to run. Default: `build,review,wrap-up` |

### Input resolution

1. **Single spec number** (e.g., `42`) → **Spec mode** — build uses spec tracking, review checks spec compliance
2. **Multiple spec numbers** (e.g., `42,45,48`) → **Multi-spec mode** — each spec runs through the pipeline in parallel (see Multi-Spec Parallel Flow below)
3. **Design doc path** (e.g., `docs/plans/*-design.md`) → **Design mode** — build reads the design doc directly, review uses git diff instead of spec compliance
4. **Topic name** (e.g., `meal planning`) → search for a matching spec AND design doc. If both exist, prefer spec mode. If only a design doc exists, use design mode.

### Examples

```
/claude-tweaks:flow 42                                              → spec mode: build, review, wrap-up
/claude-tweaks:flow 42 stories                                      → build, stories, review qa, review code, wrap-up
/claude-tweaks:flow 42,45,48                                        → multi-spec: parallel pipelines on separate branches
/claude-tweaks:flow docs/plans/2026-02-21-meal-planning-design.md   → design mode: build, review, wrap-up
/claude-tweaks:flow meal planning                                   → auto-detect: spec or design mode
/claude-tweaks:flow 42 build,review                                 → spec mode: build and review only
/claude-tweaks:flow 42 review,wrap-up                               → review and wrap-up only (already built)
/claude-tweaks:flow 42,45 build,review                              → multi-spec: parallel build+review only
```

## Allowed Steps

Only automatable skills can be included in the pipeline:

| Step | Skill invoked | Why it's automatable |
|------|--------------|---------------------|
| `build` | `/claude-tweaks:build` | Fully autonomous — plans, implements, simplifies, verifies |
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

1. Parse `$ARGUMENTS` — extract spec number or design doc path, plus optional step list
2. Determine mode: spec mode (number) or design mode (path/topic)
3. Validate step list is in lifecycle order
4. If spec mode: check prerequisites are met (same as `/claude-tweaks:build` Spec Step 1)
5. If design mode: verify the design doc file exists
6. If `stories` keyword is present: ask the user for the app URL (e.g., `http://localhost:3000`). Verify the URL responds with a quick HTTP check (`curl -s -o /dev/null -w "%{http_code}" <url>`). If unreachable, stop: "Stories step requires a running app at {url}. Start the dev server and re-run."
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

## Multi-Spec Parallel Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline in parallel on separate branches.

### Validation

Before dispatching, validate the spec list:

1. **Parse** — split on commas, resolve each to a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.
3. **File overlap** — extract `Key Files` from each spec. If any two specs share files, **reject the pair** — concurrent modification of the same files causes merge conflicts. Present the overlap:
   ```
   CONFLICT: Spec 42 and Spec 45 both modify:
   - src/components/ShoppingList.tsx
   - src/api/items.ts

   Run these specs sequentially, or restructure to eliminate file overlap.
   ```
4. **Force branched mode** — multi-spec flow always uses branched mode. Each spec gets its own `build/{N}-{title}` branch. This is not optional — concurrent work on the same branch would conflict.

### Execution

> **Parallel execution:** Dispatch each spec pipeline as a parallel Task agent. Each agent runs the full step sequence (build → review → wrap-up) independently on its own branch. A gate failure in one agent does not affect the others — each pipeline succeeds or fails independently.

Each agent:
1. Creates its `build/{N}-{title}` branch from the current HEAD
2. Creates its own ledger: `docs/plans/YYYY-MM-DD-{spec-N-feature}-ledger.md`
3. Runs the pipeline steps in order (same gate behavior as single-spec flow)
4. Returns its outcome: completed steps, gate failures, and summary

### Multi-Spec Summary

After all agents complete, present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete

| Spec | Branch | Build | Review | Wrap-Up | Outcome |
|------|--------|-------|--------|---------|---------|
| {N} | build/{N}-{title} | passed | PASS | done | Complete |
| {N} | build/{N}-{title} | passed | BLOCKED | — | Stopped at review |
| {N} | build/{N}-{title} | failed | — | — | Stopped at build |

### Per-Spec Details
(expand each spec's key outputs, failures, and review findings)
```

### Phase 4: Merge Reconciliation

After presenting the multi-spec summary, merge completed branches back.

#### Merge Order

1. Sort completed branches by diff size (smallest first — `git diff --stat main..build/{N}-{title} | tail -1`)
2. Merge branches sequentially into the base branch

#### Merge Procedure

For each completed branch (in order):

1. `git merge build/{N}-{title}` into the base branch
2. **If merge succeeds** — continue to the next branch
3. **If merge conflicts** — present the conflicts:
   ```
   Merge conflict merging spec {N} (build/{N}-{title}):

   Conflicting files:
   - {file1}
   - {file2}

   1. Resolve conflicts now **(Recommended)** — I'll resolve based on both specs' intent
   2. Skip this branch — merge remaining branches first, come back to this one
   3. Abort all remaining merges — I'll handle merges manually
   ```
4. After all merges, update `specs/INDEX.md` to reflect completed specs

#### Post-Merge

```markdown
### Merge Results

| Spec | Branch | Merge Status |
|------|--------|-------------|
| {N} | build/{N}-{title} | Merged cleanly |
| {N} | build/{N}-{title} | Merged with conflict resolution |
| {N} | build/{N}-{title} | Skipped (pipeline failed) |

### Recommended Next
- Failed specs: fix issues and re-run `/claude-tweaks:flow {spec} {remaining steps}`
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
| Multi-spec flow with overlapping Key Files | Concurrent modification of the same files causes merge conflicts — reject pairs that share files |
| Multi-spec flow without branched mode | Parallel work on the same branch would conflict — multi-spec always forces branched mode |
| Ignoring open ledger items at pipeline end | The nothing-left-behind gate prevents dropped work — every item must be explicitly resolved |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | First step in the default pipeline — runs in spec mode or design mode depending on flow input |
| `/claude-tweaks:stories` | Optional step between build and review — generates QA stories when `stories` keyword is present |
| `/claude-tweaks:review` | Review step — receives build output, produces verdict. Includes QA mode when stories step ran. |
| `/claude-tweaks:wrap-up` | Final step — receives review output, produces clean slate |
| `/claude-tweaks:help` | Shows pipeline status and recommends flow-ready specs |
| `/claude-tweaks:specify` | Creates the specs that flow consumes — multi-spec uses Key Files from /specify for file overlap detection |
| `/claude-tweaks:browse` | Used transitively — /stories and /review visual/qa modes use /browse for browser interaction |
| `/superpowers:brainstorm` | Produces the design docs that flow consumes in design mode — skipping /specify |
