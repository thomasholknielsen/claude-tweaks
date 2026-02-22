---
name: claude-tweaks:flow
description: Use when you want to run an automated build → review → wrap-up pipeline on a spec or design doc without stopping between steps.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Flow — Automated Pipeline

Run multiple lifecycle steps in sequence without stopping between them. Each step has a gate — if a gate fails, the pipeline stops and presents the failure.

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
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
/claude-tweaks:flow <spec-or-design-doc> [step1,step2,step3]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<spec-or-design-doc>` | Yes | Spec number (e.g., `42`), design doc path (e.g., `docs/plans/2026-02-21-meal-planning-design.md`), or topic name (e.g., `meal planning`) |
| `[steps]` | No | Comma-separated list of steps to run. Default: `build,review,wrap-up` |

### Input resolution

1. **Spec number** (e.g., `42`) → **Spec mode** — build uses spec tracking, review checks spec compliance
2. **Design doc path** (e.g., `docs/plans/*-design.md`) → **Design mode** — build reads the design doc directly, review uses git diff instead of spec compliance
3. **Topic name** (e.g., `meal planning`) → search for a matching spec AND design doc. If both exist, prefer spec mode. If only a design doc exists, use design mode.

### Examples

```
/claude-tweaks:flow 42                                              → spec mode: build, review, wrap-up
/claude-tweaks:flow docs/plans/2026-02-21-meal-planning-design.md   → design mode: build, review, wrap-up
/claude-tweaks:flow meal planning                                   → auto-detect: spec or design mode
/claude-tweaks:flow 42 build,review                                 → spec mode: build and review only
/claude-tweaks:flow 42 review,wrap-up                               → review and wrap-up only (already built)
```

## Allowed Steps

Only automatable skills can be included in the pipeline:

| Step | Skill invoked | Why it's automatable |
|------|--------------|---------------------|
| `build` | `/claude-tweaks:build` | Fully autonomous — plans, implements, simplifies, verifies |
| `review` | `/claude-tweaks:review` | Runs verification, code review, simplification — produces a verdict |
| `wrap-up` | `/claude-tweaks:wrap-up` | Reflection, cleanup, knowledge routing — produces actionable summary |

**Not allowed in flow:** `capture`, `challenge`, `specify`, `setup`, `codebase-onboarding`, `tidy`, `help` — these require interactive decision-making.

### Step Order

Steps must follow lifecycle order. Invalid orderings are rejected:

- `build,review,wrap-up` — valid
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
6. If validation fails → **stop before starting**

### Step 2: Run Pipeline

For each step in order:

1. **Announce** the step: `## Flow: Running {step} ({N}/{total})`
2. **Execute** the full skill as documented in its own SKILL.md
3. **Check the gate** — if the step fails its gate, stop the pipeline
4. **Pass context forward** — each step's output feeds into the next:
   - `build` → `review` receives the build summary and changed files
   - `review` → `wrap-up` receives the review summary and verdict

### Step 3: Present Pipeline Summary

On successful completion of all steps:

```markdown
## Flow: Pipeline Complete

### {Spec {number}: {title} | Design: {design doc topic}}

| Step | Outcome |
|------|---------|
| build | Verification passed |
| review | Verdict: PASS |
| wrap-up | Learnings captured, artifacts cleaned |

### Key Outputs
- {summary of what was built}
- {summary of review findings, if any}
- {summary of wrap-up actions taken}

### Recommended Next

`/claude-tweaks:flow {next spec}` — run the pipeline on the next spec. Or `/claude-tweaks:help` for full status.
```

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Using flow for first-time complex specs | You lose the ability to course-correct between steps — run manually first |
| Ignoring gate failures and restarting | Gates exist to catch real problems — investigate before retrying |
| Running flow on specs with unmet prerequisites | The pipeline will fail at build — check dependencies first |
| Using flow for interactive skills | Capture, challenge, and specify need human decisions — they can't be automated |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | First step in the default pipeline — runs in spec mode or design mode depending on flow input |
| `/claude-tweaks:review` | Second step — receives build output, produces verdict. Uses spec compliance (spec mode) or git diff (design mode) |
| `/claude-tweaks:wrap-up` | Third step — receives review output, produces clean slate |
| `/claude-tweaks:help` | Shows pipeline status and recommends flow-ready specs |
| `/claude-tweaks:specify` | Creates the specs that flow consumes in spec mode |
| `brainstorming` (Superpowers) | Produces the design docs that flow consumes in design mode — skipping /specify |
