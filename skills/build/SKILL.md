---
name: claude-tweaks:build
description: Use when implementing a spec or design doc end-to-end. Accepts a spec number for full lifecycle tracking, or a design doc path to skip /claude-tweaks:specify and build directly from brainstorming output.
---
> **Interaction style:** Present choices as numbered options (1, 2, 3…) so the user can reply with just a number. Do the same when suggesting the next skill to run.


# Build

Implement a spec or design doc end-to-end: plan it, build it, simplify it, verify it. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → [ /claude-tweaks:build ] → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                 ↑                        ^^^^ YOU ARE HERE ^^^^   ↑
                                                                 └── or skip directly ─────────────────────────────┘
```

## When to Use

- A spec is ready to build (prerequisites met, plan exists or will be created)
- A design doc is ready for direct implementation (skipping /claude-tweaks:specify)
- /claude-tweaks:help recommends building a specific spec
- Resuming a partially-completed build

## Input

`$ARGUMENTS` = spec number, design doc path, or topic name.

### Resolve the input:

1. **Spec number** (e.g., `42`, `73`) → **Spec mode** — full lifecycle with prerequisites, INDEX.md tracking, and spec compliance
2. **Design doc path** (e.g., `docs/plans/2026-02-21-meal-planning-design.md`) → **Design mode** — build directly from the design doc, skipping spec machinery
3. **Topic name** (e.g., `meal planning`) → search for a matching design doc in `docs/plans/*-design.md` AND a matching spec in `specs/`. If both exist, present numbered options:

```
Found both a spec and a design doc for "{topic}":
1. Spec mode (spec {N}: {title}) — Full lifecycle with prerequisites and tracking
2. Design mode ({design doc filename}) — Build directly, skip spec machinery
``` If only one exists, use it.
4. **No arguments** → check conversation context or recent git activity for clues. Ask if unclear.

| Mode | Source | Skips | Best for |
|------|--------|-------|----------|
| **Spec mode** | `specs/{N}-*.md` | Nothing | Tracked work with acceptance criteria, dependencies, and INDEX.md |
| **Design mode** | `docs/plans/*-design.md` | `/claude-tweaks:specify`, prerequisite checks, INDEX.md | Quick builds where the design doc is clear enough to execute directly |

## Workflow

```
Resolve input
    ↓
Spec mode? ──yes──→ [Spec Steps 1-3]
    │                       ↓
    no (design mode)        │
    ↓                       │
[Design Steps 1-3]         │
    ↓                       │
    └───────────────────────┘
                ↓
        [Common Steps 1-5]
```

---

## Spec Mode

### Spec Step 1: Read & Assess the Spec

```
specs/{number}-*.md
```

- Read the full spec file
- Read `specs/INDEX.md` to understand dependencies and tier placement
- Check prerequisites — are all blocking specs completed?
- If prerequisites are not met, **stop** and tell the user what's blocking

### Spec Step 2: Check for Existing Plan

Search `docs/plans/` for a plan matching this spec (by number, topic, or date).

#### If a plan exists:

- Read it and compare against the spec — has the spec evolved since the plan was written?
- Check what's already implemented (search codebase for files, routes, tests referenced in the plan)
- If the plan is still valid and work remains, skip to Common Step 1
- If the plan is stale (spec changed, codebase diverged), proceed to Spec Step 3

#### If no plan exists:

Proceed to Spec Step 3.

### Spec Step 3: Create the Plan

Invoke the `superpowers:writing-plans` skill.

Context to provide to writing-plans:
- The full spec content (including Current State, Gotchas, and acceptance criteria)
- Any existing progress identified in Spec Step 2

The plan will be written to `docs/plans/YYYY-MM-DD-{feature}.md`.

Proceed to **Common Step 1**.

---

## Design Mode

### Design Step 1: Read the Design Doc

- Read the full design doc
- If a brainstorming brief exists (`docs/plans/*-brief.md` for the same topic), read it too — it contains debiased constraints and assumptions from `/claude-tweaks:challenge`
- Scan the codebase for existing files, schemas, APIs, and patterns relevant to the design

### Design Step 2: Check for Existing Plan

Search `docs/plans/` for an execution plan matching this design doc (by topic or date).

- If a plan exists and is still valid → skip to Common Step 1
- If no plan or plan is stale → proceed to Design Step 3

### Design Step 3: Create the Plan

Invoke the `superpowers:writing-plans` skill.

Context to provide to writing-plans:
- The full design doc content
- The brainstorming brief (if it exists) — especially constraints and assumptions
- Relevant codebase context (existing files, patterns, schemas)

<IMPORTANT>
Design mode has no spec with structured acceptance criteria. When providing context to writing-plans, extract testable outcomes from the design doc's decisions and recommendations. If the design doc lacks clear success criteria, ask the user to confirm what "done" looks like before proceeding.
</IMPORTANT>

The plan will be written to `docs/plans/YYYY-MM-DD-{feature}.md`.

Proceed to **Common Step 1**.

---

## Common Steps (both modes)

### Common Step 1: Execute the Plan

Invoke the `superpowers:subagent-driven-development` skill.

This runs the full Superpowers execution chain:
1. Per task: **implementer** subagent builds the code
2. Per task: **spec reviewer** subagent verifies it matches requirements
3. Per task: **code quality reviewer** subagent evaluates implementation excellence
4. After all tasks: **final overall code review**

#### Project-Specific Context

The implementer subagents will pick up project conventions from CLAUDE.md, `.claude/rules/`, and loaded skills. Ensure your CLAUDE.md documents:
- Import conventions (shared types packages, etc.)
- Error handling patterns
- Logging conventions
- Validation approach
- Naming conventions

### Common Step 2: Code Simplification

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

### Common Step 3: Handle Blocked Work

If any part of the plan is blocked (missing infrastructure, unresolved dependencies, pending external work):

1. Document blocked items:
   - **Spec mode:** add to the spec file under a "Blocked / Future Work" section
   - **Design mode:** create an INBOX entry via `/claude-tweaks:capture`
2. Note what unblocks them
3. These will be picked up by `/claude-tweaks:help` when scanning for actionable work

### Common Step 4: Final Verification

After code simplification, verify the full build using the project's standard checks:

- Type checking
- Linting
- Tests

Check CLAUDE.md for the project's specific commands (e.g., `pnpm typecheck`, `npm run lint`, `yarn test`).

If anything fails, fix it and commit the fix.

### Common Step 5: Handoff

After successful build, present:

```markdown
## Build Complete: {spec number and title OR design doc topic}

### Mode
{Spec mode (spec {number}) | Design mode ({design doc filename})}

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

### What's Next?

Pick an action (reply with the number):

1. `/claude-tweaks:review {number or blank}` — Run the quality gate ⭐ **(Recommended)**
2. `/claude-tweaks:wrap-up {number or blank}` — Skip review, go straight to wrap-up
3. `/claude-tweaks:help` — See full workflow status
4. Done for now
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

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Building without a spec or design doc | No clear scope leads to scope creep and unverifiable results |
| Asking for feedback during execution | Build is autonomous — make reasonable decisions and keep moving |
| Using `git reset` or `git checkout .` | Other processes may be committing concurrently — destroys their work |
| Skipping code simplification | Iterative implementation accumulates unnecessary complexity across tasks |
| Building a spec with unmet prerequisites | Downstream specs depend on upstream work — check the dependency graph first |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Runs BEFORE /claude-tweaks:build in spec mode — creates the spec. Can be skipped using design mode. |
| `brainstorming` (Superpowers) | Produces the design doc that design mode consumes directly |
| `writing-plans` (Superpowers) | Invoked BY /claude-tweaks:build to create the execution plan |
| `subagent-driven-development` (Superpowers) | Invoked BY /claude-tweaks:build to execute the plan |
| `code-simplifier` | Invoked BY /claude-tweaks:build after implementation, before verification |
| `/claude-tweaks:review` | Runs AFTER /claude-tweaks:build — in design mode, uses git diff instead of spec compliance |
| `/claude-tweaks:wrap-up` | Runs AFTER /claude-tweaks:review — cleans up and captures learnings |
| `/claude-tweaks:capture` | Design mode may create INBOX items for blocked work |
