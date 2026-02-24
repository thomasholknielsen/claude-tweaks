---
name: claude-tweaks:build
description: Use when implementing a spec or design doc end-to-end. Accepts a spec number for full lifecycle tracking, or a design doc path to skip /claude-tweaks:specify and build directly from brainstorming output.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Build

Implement a spec or design doc end-to-end: plan it, build it, simplify it, verify it, and capture the journeys it enables. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorm → /claude-tweaks:specify → [ /claude-tweaks:build ] → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                 ↑                        ^^^^ YOU ARE HERE ^^^^   ↑
                                                                 └── or skip directly ─────────────────────────────┘
```

## When to Use

- A spec is ready to build (prerequisites met, plan exists or will be created)
- A design doc is ready for direct implementation (skipping /claude-tweaks:specify)
- /claude-tweaks:help recommends building a specific spec
- Resuming a partially-completed build

## Build Modes

Build mode controls execution style, git strategy, and feedback behavior. Specify as the last argument:

```
/claude-tweaks:build 42                → autonomous (default)
/claude-tweaks:build 42 guided         → pause at key checkpoints
/claude-tweaks:build 42 branched       → feature branch, autonomous
```

| Mode | Execution | Git Strategy | Feedback | Best for |
|------|-----------|-------------|----------|----------|
| **autonomous** | Subagent-driven | Commit on current branch | Never ask | Solo work, trusted pipeline |
| **guided** | Subagent-driven | Commit on current branch | Pause at checkpoints | Complex specs, unfamiliar code |
| **branched** | Subagent-driven | Feature branch → PR-ready | Never ask | Team projects, code review gates |

### Default mode resolution

1. Explicit argument (`/claude-tweaks:build 42 guided`) — always wins
2. CLAUDE.md setting (`build-mode: autonomous`) — project-level default
3. Fallback — `autonomous`

To set a project default, add to CLAUDE.md:

```
## Build
build-mode: autonomous
```

### Mode-specific behavior

**autonomous** (default):
- `/superpowers:execute-plan` runs the full plan
- Commits land on the current branch
- Never asks for feedback, never presents options
- Push commits promptly

**guided**:
- Same subagent-driven execution
- Commits land on the current branch
- Pauses after plan creation: "Here's the plan — proceed or adjust?"
- Pauses after implementation, before simplification: "Implementation complete — review before simplifying?"
- Presents options when ambiguous instead of choosing silently

**branched**:
- Creates a feature branch from the current branch: `build/{spec-number}-{short-title}` or `build/{topic}`
- Same autonomous behavior (no feedback, no options)
- Ends with the branch ready — does NOT create a PR (that's a user decision)
- Handoff suggests creating a PR or merging

## Input

`$ARGUMENTS` = spec number, design doc path, or topic name — optionally followed by a build mode.

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
        [Common Steps 1-6]
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

Invoke the `/superpowers:write-plan` skill.

Context to provide to `/superpowers:write-plan`:
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

Invoke the `/superpowers:write-plan` skill.

Context to provide to `/superpowers:write-plan`:
- The full design doc content
- The brainstorming brief (if it exists) — especially constraints and assumptions
- Relevant codebase context (existing files, patterns, schemas)

<IMPORTANT>
Design mode has no spec with structured acceptance criteria. When providing context to `/superpowers:write-plan`, extract testable outcomes from the design doc's decisions and recommendations. If the design doc lacks clear success criteria, ask the user to confirm what "done" looks like before proceeding.
</IMPORTANT>

The plan will be written to `docs/plans/YYYY-MM-DD-{feature}.md`.

Proceed to **Common Step 1**.

---

## Common Steps (both modes)

### Common Step 1: Execute the Plan

Invoke the `/superpowers:execute-plan` skill.

This runs the full Superpowers execution chain:
1. Per task: **implementer** subagent builds the code
2. Per task: **spec reviewer** subagent verifies it matches requirements
3. Per task: **code quality reviewer** subagent evaluates implementation excellence
4. After all tasks: **final overall code review**

#### Superpowers Failure Handling

If `/superpowers:execute-plan` (or `/superpowers:write-plan` in Step 3) fails:

| Failure | Recovery |
|---------|----------|
| **Not installed** (command not found) | Stop. Tell the user: "Superpowers plugin is required. Install: `/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`" |
| **Timeout or partial output** | Re-run the specific step that failed. If write-plan timed out, re-invoke it with the same context. If execute-plan timed out mid-task, check which tasks completed (scan git log) and resume from the next incomplete task. |
| **Malformed plan** (write-plan produced output that execute-plan can't parse) | Re-run `/superpowers:write-plan` with the same context. If it fails again, fall back to manual planning: break the spec into 3-5 implementation tasks, present them to the user, and implement each task directly without the Superpowers execution chain. |
| **Subagent failures** (individual tasks fail within execute-plan) | Let execute-plan's built-in retry handle it first. If the task fails repeatedly, implement that task directly in the main thread and continue. |

#### Project-Specific Context

The implementer subagents will pick up project conventions from CLAUDE.md, `.claude/rules/`, and loaded skills. Ensure your CLAUDE.md documents:
- Import conventions (shared types packages, etc.)
- Error handling patterns
- Logging conventions
- Validation approach
- Naming conventions

### Common Steps 2 + 3.5: Simplification and Alignment (Concurrent)

> **Parallel execution:** After implementation completes, run code simplification (Task agent via code-simplifier:code-simplifier) and architecture alignment check (main thread) concurrently — they operate on independent concerns. Common Step 4 (Final Verification) gates after both complete.

### Common Step 2: Code Simplification

After all implementation tasks are complete, run the `code-simplifier:code-simplifier` agent on the recently modified code.

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
3. Append blocked items to the open items ledger with status `open`
4. These will be picked up by `/claude-tweaks:help` when scanning for actionable work

### Common Step 3.5: Architecture Alignment Check

Compare what was actually built to what the spec or design doc said to build. Implementation often drifts from the plan — sometimes for good reasons, sometimes not. Catch it here before verification locks it in.

**Check:**
1. Read the spec (or design doc) and identify its stated architectural approach — the "how" decisions: patterns chosen, boundaries defined, data flow described
2. Compare against the actual implementation — scan the files created/modified for structural alignment
3. Note any deviations

**For each deviation found, classify and route:**

```
Deviation: {what the spec said vs. what was built}
1. Beneficial — The deviation is an improvement. Update the spec to match reality AND capture the insight (why the deviation was better) in the commit message so /wrap-up can reflect on it.
2. Fix now — The deviation contradicts the spec's intent. Correct the implementation.
3. Update the spec — The spec was wrong or incomplete. Update the spec to match reality.
```

"Beneficial" deviations still require action — update the spec and document why. Don't just "note it" — that loses the insight.

**Skip this step if:**
- Design mode with no formal spec (no stated architecture to compare against)
- The plan was trivial (< 3 tasks, single-file changes)

### Common Step 4: Final Verification

After code simplification, run the shared verification procedure from `verification.md` in the `/claude-tweaks:test` skill's directory. This runs type checking, linting, and tests using the project's commands from CLAUDE.md.

If anything fails, fix it and commit the fix.

### Common Step 4.5: Operational Checklist

After verification passes, check for operational tasks that are easy to forget. These are not code quality issues — they're deployment and environment concerns that slip through code review.

> **Parallel execution:** Use parallel tool calls — all checks are independent Grep/Glob operations.

| Check | Detect | Action |
|-------|--------|--------|
| Schema changes | `git diff --name-only` includes schema/migration files | Run the project's schema push command (check CLAUDE.md). If no command is documented, append to ledger as `open`. |
| Shared constant value changed | `git diff` shows a constant's value changed in a shared package | Grep all test files for the old literal value. Update any hardcoded assertions to import the constant instead. |
| New environment variables | Grep changed files for new `process.env.*` or env access patterns | Check `.env.example` (or equivalent) includes the new variable. Add if missing. |
| New package exports | `package.json` `exports` field changed | Run the package build to verify exports resolve correctly. |

Append each finding to the open items ledger (`docs/plans/*-ledger.md` for this work). Resolve immediately — these are operational, not design decisions. Update status to `fixed` after each.

If the ledger doesn't exist (standalone build without `/claude-tweaks:flow`), create it at `docs/plans/YYYY-MM-DD-{feature}-ledger.md`.

### Common Step 5: User Journey Capture

After verification passes, automatically create or update journey files for the features that were built. This is not optional and does not require user input — if you built a feature that any persona interacts with (end user, admin, developer, internal tooling user), document the journey.

#### Determine affected journeys

Analyze what was built and identify the journeys it enables or modifies — for any persona (end users, admins, developers, internal tooling users):

1. **Scan existing journeys** — read `docs/journeys/*.md` to see if any existing journey includes pages, flows, features, CLI commands, or APIs that were just built or changed
2. **Identify new journeys** — if the feature introduces a new flow for any persona that doesn't map to an existing journey, a new journey file is needed
3. **No interaction surface** — if the build has no flow impact for any persona (pure internal refactor, library-only changes with no behavioral shift), skip this step entirely

#### Create new journey files

For each new journey identified, create a file at `docs/journeys/{journey-name}.md`:

```markdown
---
files:
  - {path/to/key-source-file.ts}
  - {path/to/another-file.ts}
---

# {Journey Name}

**Persona:** {Who is this user? Be specific — not "user" but "first-time visitor with no account" or "developer setting up local environment"}
**Goal:** {What are they trying to accomplish?}
**Entry point:** {Where do they start? URL or trigger}
**Success state:** {What does "done" look like? What should they feel at the end?}

## Steps

### 1. {Step name} — {Page or action}
- **URL:** {path}
- **Action:** {What the user does}
- **Should feel:** {The emotional/experiential quality — "fast and effortless", "guided but not forced", "like an accomplishment"}
- **Should understand:** {What the user should know after this step}
- **Red flags:** {What would make this step fail experientially — not just functionally}

### 2. {Next step}
...

## Origin
- Created during build of {spec number or design doc}
- Steps {N-M} built in this session
- Related specs: {list}
```

Key principles for writing journeys:
- **"Should feel" is the most important field.** It's what visual review tests against. Be specific — "low commitment" not "good."
- **`files:` enables regression detection.** List the key source files that implement this journey's functionality — components, API routes, pages, services. `/review` uses this to detect when a future build changes files that an existing journey depends on. Don't list every file — just the ones whose changes would affect the journey's behavior.
- **One journey per goal**, not per feature. A journey may span features from multiple specs.
- **Include the entry point and success state.** These bookend the journey and define what "complete" means.
- **Personas are specific people**, not roles. "Developer who just joined the team and is setting up for the first time" not "developer."

#### Update existing journey files

If the build modifies or extends an existing journey:

1. Read the existing journey file
2. Add, update, or reorder steps to reflect what was built
3. Update the `files:` frontmatter — add new source files, remove files that are no longer relevant
4. Update the Origin section to reference the current build
5. Preserve existing "Should feel" and "Red flags" for steps that weren't changed — those are tested expectations

#### Commit the journey files

Commit journey files separately from the implementation code:
```
git add docs/journeys/{journey-name}.md
git commit -m "Add/update {journey name} journey"
```

### Common Step 6: Handoff

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

### User Journeys
- {created/updated journey name} — {summary of what changed}
(or: No user-facing journeys affected.)

### Blocked items (if any)
- {item} — blocked by {reason}

### Recommended Next

{If UI files changed (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, component/page directories):}
`/claude-tweaks:stories {url}` — generate QA stories for the changed UI, then `/claude-tweaks:review`.

{Otherwise:}
`/claude-tweaks:review {number}` — run the quality gate.

(Branched mode: also consider creating a PR from `{branch}`.)
```

## Git Strategy

**autonomous / guided:** Commit directly on the current branch.

**branched:** Before any work begins:
1. Create branch: `git checkout -b build/{spec-number}-{short-title}`
2. All commits land on this branch
3. At handoff, the branch is ready for PR or merge — do NOT auto-merge or auto-PR

## Git Rules — NON-NEGOTIABLE

These rules apply in ALL modes. They exist because multiple processes may commit to the same branch simultaneously.

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

These apply in **autonomous** and **branched** modes. In **guided** mode, pause at documented checkpoints instead.

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
| Skipping journey capture for features with an interaction surface | Journeys are what visual review tests against — no journey means no QA anchor. This applies to all personas: end users, admins, developers, internal tooling users. |
| Writing journeys with vague "should feel" | "Good" and "intuitive" are not testable. "Low commitment" and "like an accomplishment" are. |
| Asking the user whether to create a journey | Journey capture is automatic. The user didn't know they needed the spec either — that's why the workflow exists. |
| Ignoring architectural deviations from the spec | Drift happens during implementation — catch it in Step 3.5 before it becomes tech debt. Every deviation must be explicitly classified. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Runs BEFORE /claude-tweaks:build in spec mode — creates the spec. Can be skipped using design mode. |
| `/superpowers:brainstorm` | Produces the design doc that design mode consumes directly |
| `/superpowers:write-plan` | Invoked BY /claude-tweaks:build to create the execution plan |
| `/superpowers:execute-plan` | Invoked BY /claude-tweaks:build to execute the plan |
| `code-simplifier:code-simplifier` | Invoked BY /claude-tweaks:build after implementation, before verification |
| `/claude-tweaks:stories` | Runs AFTER /claude-tweaks:build when UI files change — generates QA stories before review |
| `/claude-tweaks:review` | Runs AFTER /claude-tweaks:build — in design mode, uses git diff instead of spec compliance |
| `/claude-tweaks:wrap-up` | Runs AFTER /claude-tweaks:review — cleans up and captures learnings |
| `/claude-tweaks:capture` | Design mode may create INBOX items for blocked work |
| `/claude-tweaks:test` | Standalone verification — /test runs the same checks as /build Common Step 4 |
| `/claude-tweaks:review` (visual modes) | Tests the user journeys that /build creates — visual review modes are the bridge between build and visual QA |
| `/claude-tweaks:tidy` | Reviews specs from /claude-tweaks:build for staleness — periodic cleanup complement |
