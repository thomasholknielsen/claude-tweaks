---
name: claude-tweaks:build
description: Use when implementing a spec end-to-end. Chains Superpowers planning and subagent-driven development with project-specific guardrails.
---

# Build

Implement a spec end-to-end: plan it, build it, simplify it, verify it. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
```

## Input

`$ARGUMENTS` = spec number (e.g., `42`, `73`)

## Workflow

```
Read spec
    ↓
Plan exists? ──yes──→ Review plan for freshness
    │                       ↓
    no              Still valid? ──yes──→ Execute
    ↓                   │
Invoke writing-plans    no
    ↓                   ↓
    └───────────────→ Invoke writing-plans
                        ↓
                    Invoke subagent-driven-development
                        ↓
                    Code simplification
                        ↓
                    Final verification
                        ↓
                    Suggest /claude-tweaks:challenge → /claude-tweaks:wrap-up
```

## Step 1: Read & Assess the Spec

```
specs/{number}-*.md
```

- Read the full spec file
- Read `specs/INDEX.md` to understand dependencies and tier placement
- Check prerequisites — are all blocking specs completed?
- If prerequisites are not met, **stop** and tell the user what's blocking

## Step 2: Check for Existing Plan

Search `docs/plans/` for a plan matching this spec (by number, topic, or date).

### If a plan exists:

- Read it and compare against the spec — has the spec evolved since the plan was written?
- Check what's already implemented (search codebase for files, routes, tests referenced in the plan)
- If the plan is still valid and work remains, proceed to Step 4
- If the plan is stale (spec changed, codebase diverged), proceed to Step 3 to create a fresh plan

### If no plan exists:

Proceed to Step 3.

## Step 3: Create the Plan

Invoke the `superpowers:writing-plans` skill.

Context to provide to writing-plans:
- The full spec content (including Current State, Gotchas, and acceptance criteria)
- Any existing progress identified in Step 2

The plan will be written to `docs/plans/YYYY-MM-DD-{feature}.md`.

## Step 4: Execute the Plan

Invoke the `superpowers:subagent-driven-development` skill.

This runs the full Superpowers execution chain:
1. Per task: **implementer** subagent builds the code
2. Per task: **spec reviewer** subagent verifies it matches requirements
3. Per task: **code quality reviewer** subagent evaluates implementation excellence
4. After all tasks: **final overall code review**

### Project-Specific Context

The implementer subagents will pick up project conventions from CLAUDE.md, `.claude/rules/`, and loaded skills. Ensure your CLAUDE.md documents:
- Import conventions (shared types packages, etc.)
- Error handling patterns
- Logging conventions
- Validation approach
- Naming conventions

## Step 5: Code Simplification

After all implementation tasks are complete, run the `code-simplifier` agent on the recently modified code.

This step:
- Simplifies and refines code for clarity, consistency, and maintainability
- Preserves all functionality — no behavioral changes
- Focuses on files modified during this build session

The code-simplifier catches patterns that individual task-focused subagents miss:
- Unnecessary complexity introduced across multiple tasks
- Inconsistent naming or patterns between tasks
- Over-engineering that accumulated during implementation
- Opportunities to consolidate similar code written by different subagents

If the simplifier makes changes, commit them separately.

## Step 6: Handle Blocked Work

If any part of the plan is blocked (missing infrastructure, unresolved dependencies, pending external work):

1. Document blocked items in the spec file under a "Blocked / Future Work" section
2. Note what unblocks them
3. These will be picked up by `/claude-tweaks:next` when scanning for actionable work

## Step 7: Final Verification

After code simplification, verify the full build using the project's standard checks:

- Type checking
- Linting
- Tests

Check CLAUDE.md for the project's specific commands (e.g., `pnpm typecheck`, `npm run lint`, `yarn test`).

If anything fails, fix it and commit the fix.

## Step 8: Handoff

After successful build, present:

```markdown
## Build Complete: Spec {number} — {title}

### Verification
- Type check: {pass/fail}
- Lint: {pass/fail}
- Tests: {pass/fail}

### What was built
- {summary of implemented features}

### Code simplification
- {summary of simplifications made, or "No changes needed"}

### Blocked items (if any)
- {item} — blocked by {reason}

### Recommended next steps
1. Run `/claude-tweaks:challenge` to challenge assumptions and surface learnings
2. Run `/claude-tweaks:wrap-up {number}` to finalize, clean up, and capture knowledge
```

## Git Rules — NON-NEGOTIABLE

These rules exist because multiple processes may commit to the same branch simultaneously.

| Rule | Reason |
|------|--------|
| **NEVER `git reset`** | Other processes may be committing. A reset wipes their work. |
| **NEVER `git checkout .` or `git restore .`** | Same reason — destroys concurrent work. |
| **NEVER force push** | Rewrites shared history. |
| **Push commits promptly** | Local-only commits are vulnerable to loss. |
| **Stage specific files only** | Never `git add -A` or `git add .`. |
| **Verify commits landed** | Always `git log --oneline -3` after committing. |

If you encounter a merge conflict, resolve it — do not reset or discard.

## Autonomy Rules

- **Do not ask for feedback** during execution. Make reasonable decisions and keep moving.
- **Do not ask "should I proceed?"** — yes, you should. Always.
- **Do not present options** — pick the best one and implement it.
- **If ambiguous**, choose the simpler approach and note the alternative in a code comment.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Runs BEFORE /claude-tweaks:build — creates the spec that /claude-tweaks:build implements |
| `writing-plans` (Superpowers) | Invoked BY /claude-tweaks:build to create the execution plan |
| `subagent-driven-development` (Superpowers) | Invoked BY /claude-tweaks:build to execute the plan |
| `code-simplifier` | Invoked BY /claude-tweaks:build after implementation, before verification |
| `/claude-tweaks:challenge` | Runs AFTER /claude-tweaks:build — challenges assumptions before wrap-up |
| `/claude-tweaks:wrap-up` | Runs AFTER /claude-tweaks:challenge — cleans up and captures learnings |
