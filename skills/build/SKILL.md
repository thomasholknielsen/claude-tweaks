---
name: claude-tweaks:build
description: Use when implementing a spec or design doc end-to-end. Accepts a spec number for full lifecycle tracking, or a design doc path to skip /claude-tweaks:specify and build directly from brainstorming output.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Build — Implement a spec end-to-end with worktree, plan audit, and lifecycle tracking

Implement a spec or design doc end-to-end: plan it, build it, simplify it, verify it, and capture the journeys it enables. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → [ /claude-tweaks:build ] → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                                       ↑                                          ^^^^ YOU ARE HERE ^^^^   ↑
                                                                                       └── or skip directly ──────────────────────────────────────────────┘
```

## When to Use

- A spec is ready to build (prerequisites met, plan exists or will be created)
- A design doc is ready for direct implementation (skipping /claude-tweaks:specify)
- /claude-tweaks:help recommends building a specific spec
- Resuming a partially-completed build

## Build Options

Two orthogonal choices control how `/build` runs. Combine them freely:

**Execution strategy** — how work gets done and reviewed:

| Strategy | Superpowers skill | Review model | Best for |
|----------|------------------|--------------|----------|
| **subagent** (default) | `subagent-driven-development` | Automated review chain — spec reviewer, code quality reviewer, final review. No human in the loop. | Solo work, trusted pipeline |
| **batched** | `executing-plans` | Human reviews in batches of 3 tasks. Pauses after each batch. | Complex specs, unfamiliar code, hands-on review |

**Git strategy** — where work happens:

| Strategy | Behavior | Best for |
|----------|----------|----------|
| **worktree** (default) | Isolated workspace via `using-git-worktrees` → build → `finishing-a-development-branch` | Parallel work, team projects, risky changes, safe automation |
| **current-branch** | Commit directly on the current branch | Quick local edits, no isolation needed |

**The 2x2 matrix:**

| | **Current branch** | **Worktree** (default) |
|---|---|---|
| **Subagent** | Fast solo work, no isolation. | Default. Isolated automated build. |
| **Batched** | Hands-on review, no isolation. | Full control + full isolation. |

```
/claude-tweaks:build 42                         → subagent + worktree (default)
/claude-tweaks:build 42 current-branch          → subagent + current branch (no isolation)
/claude-tweaks:build 42 batched                 → human-reviewed batches + worktree
/claude-tweaks:build 42 batched current-branch  → human-reviewed batches + current branch
/claude-tweaks:build 42 auto                    → subagent + worktree, no confirmations
/claude-tweaks:build 42 auto current-branch     → subagent + current-branch, no confirmations
```

### Default resolution

1. Explicit arguments (`/claude-tweaks:build 42 batched current-branch`) — always win
2. CLAUDE.md settings — project-level defaults:
   ```
   ## Build
   execution-strategy: subagent
   git-strategy: worktree
   ```
3. Fallback — `subagent` + `worktree`
4. `auto` keyword — skip intermediate confirmation prompts. Uses defaults (`subagent` + `worktree`) unless overridden. Architecture alignment (Common Step 4.5) auto-routes "Beneficial" deviations (update spec silently). Only stops for genuinely ambiguous deviations or critical decisions.

### Execution strategy behavior

**subagent** (default):
- Invokes `/superpowers:subagent-driven-development` for the full plan
- Fresh subagent per task, spec reviewer, code quality reviewer, final review
- Never asks for feedback, never presents options
- Push commits promptly

**batched**:
- Invokes `/superpowers:executing-plans` for the plan
- Executes in batches of 3 tasks, pauses for human review after each batch
- User acts as reviewer — approves, requests changes, or skips tasks
- Push commits after each approved batch

### Git strategy behavior

**worktree** (default):
- Before execution, invokes `/superpowers:using-git-worktrees` to create an isolated workspace with dependency install and baseline test verification
- All commits land in the worktree on a feature branch
- At handoff, delegates to `/superpowers:finishing-a-development-branch` (merge locally, create PR, keep, or discard)

**current-branch**:
- Commits land directly on the current branch
- No isolation — simple and fast

## Input

`$ARGUMENTS` = spec number, design doc path, or topic name — optionally followed by execution strategy (`batched`), git strategy (`worktree`), and/or `auto`.

### Resolve the input:

1. **Spec number** (e.g., `42`, `73`) → **Spec mode** — full lifecycle with prerequisites, INDEX.md tracking, and spec compliance
2. **Design doc path** (e.g., `docs/superpowers/specs/2026-02-21-meal-planning-design.md`) → **Design mode** — build directly from the design doc, skipping spec machinery
3. **Topic name** (e.g., `meal planning`) → search for a matching design doc in `docs/superpowers/specs/*-design.md` AND a matching spec in `specs/`. If both exist, present numbered options:

```
Found both a spec and a design doc for "{topic}":
1. Spec mode (spec {N}: {title}) — Full lifecycle with prerequisites and tracking
2. Design mode ({design doc filename}) — Build directly, skip spec machinery
``` If only one exists, use it.
4. **No arguments** → check conversation context or recent git activity for clues. Ask if unclear.

### Prompt for build options

After resolving the input, if execution strategy and/or git strategy were not provided as arguments, prompt the user.

Per CLAUDE.md "One decision per message" rule, present the two prompts as **two consecutive messages** — resolve execution strategy first, then ask about git strategy in the next message. Do not combine them into one prompt.

**Message 1 — Execution strategy** (skip if `subagent` or `batched` was passed as an argument):

```
How should this build run?

Execution strategy:
1. Subagent **(Recommended)** — fully automated review chain, no stopping
2. Batched — human reviews every 3 tasks
```

Wait for the user's answer. Then send Message 2.

**Message 2 — Git strategy** (skip if `worktree` or `current-branch` was passed as an argument):

```
Git strategy:
1. Worktree **(Recommended)** — isolated workspace on a feature branch
2. Current branch — commit directly, no isolation
```

Skip both prompts if both options were provided as arguments (e.g., `/build 42 batched worktree`). If only one was provided, send only the message for the missing one.

| Mode | Source | Skips | Best for |
|------|--------|-------|----------|
| **Spec mode** | `specs/{N}-*.md` | Nothing | Tracked work with acceptance criteria, dependencies, and INDEX.md |
| **Design mode** | `docs/superpowers/specs/*-design.md` | `/claude-tweaks:specify`, prerequisite checks, INDEX.md | Quick builds where the design doc is clear enough to execute directly |

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
        [Common Steps 1-7]
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
- If the plan is still valid and work remains, skip to Common Step 2
- If the plan is stale (spec changed, codebase diverged), proceed to Spec Step 3

#### If no plan exists:

Proceed to Spec Step 3.

### Spec Step 2.5: Classify and Seed Manual Steps

If the spec has a "Manual Steps" section, classify each item before deciding what to do with it. "Outside the codebase" is not the same as "human-only" — many such tasks have CLIs and should be executed inline rather than dumped to the ledger.

For each item, probe in this order:

1. **CLI/API check** — infer the relevant tool from the item text, then probe: `which terraform`, `which vercel`, `which gh`, `which fly`, `which wrangler`, `which stripe`, `which ldcli`, `which aws`, `which gcloud`, etc.
2. **Credential check** — if a tool exists, are creds present? Use `{tool} auth status` (or equivalent: `gh auth status`, `vercel whoami`, `fly auth whoami`, expected env var, config file at the documented path).
3. **Triage:**
   - **Auto-executable** (tool + creds present) — execute now via Bash. In `auto` mode, log command, exit code, and one-line outcome to `decisions.md`. In interactive mode, surface the command and result inline. Do NOT seed the ledger.
   - **Auth-gap** (tool present, creds missing) — in interactive mode, surface the one-time `{tool} login` command and wait; on success, fall through to auto-execute. In `auto` mode, seed as `ops` with `(reason-not-auto: auth-not-configured)` so the user can resolve at the wrap-up Review Console.
   - **Truly manual** (no CLI, requires human judgment, requires signoff) — seed as `ops` with the matching `(reason-not-auto: …)` qualifier from `/claude-tweaks:ledger` Required-for-ops section.

If the ledger doesn't exist, create it using the ledger skill's create operation.

**Anti-pattern:** Seeding the entire Manual Steps section verbatim into `ops` without probing. The spec writer cannot know which CLIs are installed on the executing machine — that classification must happen here, at execution time, where probes can actually run.

### Spec Step 3: Create the Plan

Invoke the `/superpowers:writing-plans` skill. After it saves the plan file, **stop the skill and return here** — do not let it present an execution choice or invoke an execution skill. `/build` controls execution strategy.

Context to provide to `/superpowers:writing-plans`:
- The full spec content (including Current State, Gotchas, and acceptance criteria)
- Any existing progress identified in Spec Step 2

The plan will be written to `docs/superpowers/plans/YYYY-MM-DD-{feature}.md`.

**Plan header artifact:** Every plan written by `/superpowers:writing-plans` starts with a "For agentic workers" block that advertises `subagent-driven-development` (recommended) or `executing-plans` as the next step. **Ignore it.** `/build` controls execution strategy — the header is boilerplate from writing-plans's general-purpose handoff. Do not treat it as guidance for this build. (Same rule applies in Design Step 3 below.)

Proceed to **Common Step 2**.

---

## Design Mode

### Design Step 1: Read the Design Doc

- Read the full design doc
- If a brainstorming brief exists (`docs/plans/*-brief.md` for the same topic), read it too — it contains debiased constraints and assumptions from `/claude-tweaks:challenge`
- Scan the codebase for existing files, schemas, APIs, and patterns relevant to the design

### Design Step 2: Check for Existing Plan

Search `docs/superpowers/plans/` for an execution plan matching this design doc (by topic or date).

- If a plan exists and is still valid → skip to Common Step 2
- If no plan or plan is stale → proceed to Design Step 3

### Design Step 3: Create the Plan

Invoke the `/superpowers:writing-plans` skill. After it saves the plan file, **stop the skill and return here** — do not let it present an execution choice or invoke an execution skill. `/build` controls execution strategy.

Context to provide to `/superpowers:writing-plans`:
- The full design doc content
- The brainstorming brief (if it exists) — especially constraints and assumptions
- Relevant codebase context (existing files, patterns, schemas)

<IMPORTANT>
Design mode has no spec with structured acceptance criteria. When providing context to `/superpowers:writing-plans`, extract testable outcomes from the design doc's decisions and recommendations. If the design doc lacks clear success criteria, ask the user to confirm what "done" looks like before proceeding.
</IMPORTANT>

The plan will be written to `docs/superpowers/plans/YYYY-MM-DD-{feature}.md`. Same plan-header artifact rule as Spec Step 3 applies (ignore the "For agentic workers" boilerplate).

Proceed to **Common Step 2**.

---

## Common Steps (both modes)

### Common Step 1: Set Up Worktree (worktree strategy only)

If the user specified `worktree`, set up the isolated workspace via `/superpowers:using-git-worktrees` after a pre-flight merge check and (when in auto mode) pre-authorizing the consent prompt.

For the full procedure (pre-flight merge check with auto-mode behavior, consent prompt handling, and worktree-creation failure recovery table), read `worktree-setup.md` in this skill's directory.

If the user did not specify `worktree`, skip this step.

### Common Step 1.5: Plan Audit

Audit the plan against the actual repo before dispatching execution. Two checks:
- **Check A (always):** verify every path in the plan's Files: sections exists (or its parent directory exists for Create).
- **Check B (conditional):** when the plan declares `Scope keywords:`, grep the repo for each keyword and list any matched files not in the plan.

**Auto mode:** apply the `scope-creep` policy from `config.yml` (default `add-to-plan`). **Interactive mode:** present a numbered prompt with "Add to plan / Continue without / Stop."

**Skip this step entirely when** the plan has fewer than 3 file references AND no `Scope keywords:` field is present.

For the full procedure (Check A failure handling, Check B scope-keyword sweep command, `scope-keywords-required` setting, auto-mode policy table, interactive prompt), read `plan-audit.md` in this skill's directory.

### Common Step 1.7: Design Pre-Build (Impeccable references)

Before dispatching implementation, invoke the design wrapper to lazy-load Impeccable's reference files plus any project-specific design context (root `PRODUCT.md` from `/impeccable:impeccable teach`, root `DESIGN.md` from `/impeccable:impeccable document`). The wrapper handles its own detection (non-frontend specs skip cleanly) and availability checks (no Impeccable installed → skip cleanly).

**Skip this step entirely when:**
- The build is in design mode with no spec to inspect (the wrapper needs spec context for surface detection — pure design-mode builds proceed without pre-load)
- The plan is trivial (< 3 file references, no UI files in the plan)

**Invocation:**

Invoke `/claude-tweaks:design pre-build <spec>`. Pass the spec number for spec mode, or the design doc path as a fallback.

**Result handling:**

| Wrapper return | Build behavior |
|----------------|----------------|
| `{result: "ok", loaded: [...], context_size: <n>}` | Inject the loaded reference paths and contents into the implementer subagent's prompt as additional context. When `context_size` exceeds the implementer's budget (rough threshold: 8000 tokens), summarize the references rather than passing them whole. |
| `{skipped: ...}` (non-frontend, no Impeccable, kill-switch disabled) | Note the skip in the build log and proceed without lazy-loaded design references. **Skip is not a failure.** |
| `{deferred: ...}` (should not happen for `pre-build` in Phase 2 — only `survey` is deferred) | Treat as skip and proceed. |

**Why skips don't fail:** Lazy-loaded design references are *enrichment* for the build subagent, not a hard prerequisite. A backend spec, a project without Impeccable installed, or a project with `design-integration: disabled` should still build cleanly without the references.

**Where the loaded references go:**
- **Subagent execution strategy** — the loaded reference text is appended to the implementer subagent's system prompt for each task that touches a UI file (paths matched against the spec's Key Files entries with frontend extensions/path patterns).
- **Batched execution strategy** — the loaded references are summarized and surfaced in the batch handoff message so the human reviewer sees what design context is in play.

### Common Step 2: Execute the Plan

Execution depends on the chosen execution strategy.

> **Working Directory Discipline:** Before any commit (and before dispatching subagents that run `git` or `node --test`), explicitly anchor the working directory. CWD does not propagate reliably to subagents — without this check, commits and test runs can land in the wrong checkout. The minimum gate before every commit is:
>
> ```bash
> pwd
> git rev-parse --show-toplevel
> ```
>
> Both should match the worktree path (or, in `current-branch` strategy, the project root). When dispatching subagents, pass the worktree path explicitly and require them to run `cd "$WORKTREE"` (or use `git -C "$WORKTREE"`) plus the same `pwd` + `git rev-parse --show-toplevel` check before any commit. See "Working Directory Discipline" in `skills/_shared/subagent-output-contract.md` for the full pattern.

**subagent** (default):

Invoke `/superpowers:subagent-driven-development`. After the final code review completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps (simplification, alignment, verification) before any branch finishing.

This runs the full automated execution chain:
1. Per task: **implementer** subagent builds the code
2. Per task: **spec reviewer** subagent verifies it matches requirements
3. Per task: **code quality reviewer** subagent evaluates implementation excellence
4. After all tasks: **final overall code review**

No human in the loop — the review chain is fully automated.

**batched**:

Invoke `/superpowers:executing-plans`. After the last batch completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps (simplification, alignment, verification) before any branch finishing.

This runs execution in human-reviewed batches:
1. Executes 3 tasks per batch
2. Pauses after each batch for human review
3. User reviews the batch output and approves, requests changes, or skips tasks
4. Continues to the next batch after approval

#### Superpowers Failure Handling

If the execution skill (or `/superpowers:writing-plans` in Step 3) fails:

| Failure | Recovery |
|---------|----------|
| **Not installed** (command not found) | Stop. Tell the user: "Superpowers plugin is required. Install: `/plugin install superpowers@claude-plugins-official`" |
| **Timeout or partial output** | Re-run the specific step that failed. If `/superpowers:writing-plans` timed out, re-invoke it with the same context. If `subagent-driven-development` or `executing-plans` timed out mid-task, check which tasks completed (scan git log) and resume from the next incomplete task. |
| **Malformed plan** (`/superpowers:writing-plans` produced output that the execution skill can't parse) | Re-run `/superpowers:writing-plans` with the same context. If it fails again, fall back to manual planning: break the spec into 3-5 implementation tasks, present them to the user, and implement each task directly without the Superpowers execution chain. |
| **Subagent failures** (individual tasks fail within `subagent-driven-development`) | Let the skill's built-in retry handle it first. If the task fails repeatedly, implement that task directly in the main thread and continue. |
| **Batch rejection** (user rejects a batch in `executing-plans`) | Review the feedback, adjust the failing tasks, and re-run the rejected batch. If the user rejects the same batch twice, implement those tasks directly in the main thread. |

#### Project-Specific Context

The implementer subagents will pick up project conventions from CLAUDE.md, `.claude/rules/`, and loaded skills. Ensure your CLAUDE.md documents:
- Import conventions (shared types packages, etc.)
- Error handling patterns
- Logging conventions
- Validation approach
- Naming conventions

### Common Steps 3 + 4.5: Simplification and Alignment (Concurrent)

> **Parallel execution:** After implementation completes, run code simplification (`/claude-tweaks:simplify`) and architecture alignment check (main thread) concurrently — they operate on independent concerns. Common Step 5 (Final Verification) gates after both complete.

### Common Step 3: Code Simplification

After all implementation tasks are complete, run `/claude-tweaks:simplify` on the recently modified code (files changed during this build session).

The simplify skill handles scope resolution, running the code-simplifier subagent, and re-verification after changes. See `/claude-tweaks:simplify` for details.

If the simplifier makes changes, commit them separately.

### Common Step 4: Handle Blocked Work

If any part of the plan is blocked (missing infrastructure, unresolved dependencies, pending external work):

1. Document blocked items:
   - **Spec mode:** add to the spec file under a "Blocked / Future Work" section
   - **Design mode:** create an INBOX entry via `/claude-tweaks:capture`
2. Note what unblocks them
3. Append blocked items to the open items ledger (see `/claude-tweaks:ledger`) with phase `build/*` and status `open`
4. These will be picked up by `/claude-tweaks:help` when scanning for actionable work

### Common Step 4.5: Architecture Alignment Check

Compare what was actually built to what the spec or design doc said to build. Implementation often drifts from the plan — sometimes for good reasons, sometimes not. Catch it here before verification locks it in.

**Check:**
1. Read the spec (or design doc) and identify its stated architectural approach — the "how" decisions: patterns chosen, boundaries defined, data flow described
2. Compare against the actual implementation — scan the files created/modified for structural alignment
3. Note any deviations

**Classify every deviation, then present ONE batch decision table** (per CLAUDE.md "Multi-item decisions" convention). Pre-fill a recommended classification per row and offer "apply all / override."

For each deviation, the three valid classifications are:

| Classification | Meaning | Effect on the spec | Effect on the implementation |
|---|---|---|---|
| **Beneficial** | The deviation is an improvement on the spec's intent | Update spec to match reality; document why in commit message so /wrap-up can reflect | Keep as-built |
| **Fix now** | The deviation contradicts the spec's intent | Spec unchanged | Revert/fix the implementation to match the spec |
| **Update the spec** | The spec was wrong or incomplete; reality is correct | Update spec to match reality | Keep as-built |

**Interactive mode — single batch table:**

```
Architecture deviations — {N} found. Recommended classifications pre-filled:

| # | Deviation | What the spec said | What was built | Recommended |
|---|-----------|--------------------|----------------|-------------|
| 1 | {short label} | {spec text} | {actual} | {Beneficial / Fix now / Update the spec} |
| 2 | ... | ... | ... | ... |

1. Apply all **(Recommended)**
2. Override specific rows (tell me which #s to reclassify and to what)
```

After resolution, apply each row's classification per the table above. "Beneficial" still requires action — never just "note it"; that loses the insight.

**In `auto` mode:** auto-apply rows classified as "Beneficial" (update spec silently, commit-message insight). Rows classified "Fix now" or "Update the spec" are staged to `staged/build-deviation-{N}.md` and surfaced at the Wrap-Up Review Console — per `_shared/auto-mode-contract.md`, `auto` does not silence destructive or spec-altering decisions. Log every auto-applied and staged row to the auto-decision log.

**Skip this step if:**
- Design mode with no formal spec (no stated architecture to compare against)
- The plan was trivial (< 3 tasks, single-file changes)

#### Skill Observation

While checking architectural alignment, also compare against relevant project skills:

1. Identify 0-3 skill files in `.claude/skills/` covering patterns related to what was built
2. Quick-scan their Key Patterns and Project Conventions sections only
3. If the implementation diverges from or extends what the skill documents, append a ledger entry with phase `build/skill`
4. Keep it light — one sentence per entry; `/claude-tweaks:wrap-up` does the deep analysis
5. Skip if no `.claude/skills/` directory exists or the build is trivial

### Common Step 5: Final Verification

After code simplification, run the shared verification procedure from `verification.md` in the `/claude-tweaks:test` skill's directory. This runs type checking, linting, and tests using the project's commands from CLAUDE.md.

If anything fails, fix it and commit the fix.

### Common Step 5.5: Operational Checklist

After verification passes, check for operational tasks that are easy to forget. These are not code quality issues — they're deployment and environment concerns that slip through code review.

**Triggers:**

- **Category A** — `git diff` touches schema/migration files, shared constants, env access patterns (`process.env.*`, `import.meta.env.*`, `os.environ`, `ENV[...]`), or `package.json` `exports` field.
- **Category B** — repo signals indicate a deployment platform or infrastructure-as-code (`vercel.json`, `fly.toml`, `wrangler.toml`, `*.tf`, `.github/workflows/`, `prisma/migrations/`, `Dockerfile*`, etc.) modified in this build's diff.

**Skip this step entirely when** the diff matches no Category A or B trigger.

When at least one trigger matches, read `operational-checklist.md` in this skill's directory for the full check tables (Category A in-code fixes, Category B platform probes), the probe-then-classify procedure, and the ledger format for auto-executed / auth-gap / truly-manual items.

> **Parallel execution:** Use parallel tool calls — all checks are independent Grep/Glob operations.

### Common Step 6: User Journey Capture

After verification passes, run `/claude-tweaks:journeys`. Pass:
- **Changed files** — files modified during this build session
- **Spec or design doc context** — what was built and why

The journeys skill handles scanning existing journeys, creating new journey files, updating existing ones, and committing. See `/claude-tweaks:journeys` for details.

This is not optional and does not require user input — if you built a feature that any persona interacts with (end user, admin, developer, internal tooling user), the journeys skill documents it.

### Common Step 6.5: Documentation Sync

After journey capture, check if the build's code changes affect documented areas.

1. **Read registry** — Read `docs/REGISTRY.md`. If it doesn't exist, skip this step entirely.
2. **Get changed files** — `git diff --name-only` since build start (same file list used by Step 6).
3. **Match patterns** — For each registry entry, check if any changed file matches its Auto-detect glob patterns.
4. **For each matched doc:**

> **Parallel execution:** Use parallel tool calls — all Read operations on matched docs and their source files are independent.

   a. Read the doc file
   b. Read the relevant changed source files
   c. Determine the update using the doc update patterns from `docs-structure.md` in the `/claude-tweaks:init` skill's directory. Each doc type has specific triggers and update actions:
      - API endpoint added/changed/removed → add/update/remove rows in the endpoint table
      - New env variable or config → add to prerequisites or env setup section
      - New dependency or tool → update stack or prerequisites
      - Broken file path references → fix paths to new locations
      - Architectural change → flag for wrap-up (too big for inline)
   d. **Update inline** when the change is clearly scoped (adding a table row, updating a command, fixing a path — < 5 minutes of editing). Commit separately:
      `git commit -m "Update {doc} — {what changed}"`
   e. **Defer to wrap-up** when the change is structural (doc needs reorganization, new section, or requires reading multiple files to understand impact). Append to ledger with phase `build/docs` and status `open`:
      "{doc} may need updates — {what changed in code}. Review in wrap-up."
5. **No matches** — skip silently. No output.

### Common Step 7: Handoff

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

### Documentation
- Updated: {doc} ({what changed})
- Flagged for wrap-up: {doc} ({reason})
(or: No documentation changes needed.)

### Blocked items (if any)
- {item} — blocked by {reason}

### Manual Steps Required
| # | What | Where |
|---|------|-------|
| 1 | {description} | {spec section / detected in `{file}`} |
(or: No manual steps — nothing to do outside the codebase.)

> Populated from ledger entries with phase `ops`. **In `/flow` pipeline context:** Skip this section — flow's pipeline summary handles it.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Implemented | {feature} — `{file}` | `{hash}` |
| Bug fix | {what was fixed} — `{file}` | `{hash}` |
| Simplified | {what} — `{file}` | `{hash}` |
| Operational | {schema push, env update} | `{hash}` |
| Journey | {created/updated} {name} — `{file}` | `{hash}` |
| Doc update | {doc} — {what changed} | `{hash}` |
| Ledger fix | {item} ({phase}) — `{file}` | `{hash}` |

Generate from: `git log --oneline` since build start, `git diff --stat` against pre-build state, ledger entries with status `fixed`, journey files from Step 6, operational fixes from Step 5.5.
```

### Next Actions

Generate 2-4 numbered options based on context (these are emitted by the skill, not the template):

| Signal | Option |
|--------|--------|
| UI changed + browser available | `/claude-tweaks:review {N} full` — code + visual review **(Recommended)** |
| No browser or no UI | `/claude-tweaks:review {N}` — code review **(Recommended)** |
| QA stories exist (`stories/*.yaml`) | `/claude-tweaks:test qa` — validate {X} QA stories before review |
| Worktree mode | `/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch |

## Git Strategy

**worktree** (default): Before any work begins, `/superpowers:using-git-worktrees` creates an isolated workspace on a feature branch. All commits land in the worktree. At handoff, `/superpowers:finishing-a-development-branch` handles merge, PR, or discard — do NOT auto-merge or auto-PR.

**current-branch**: Commit directly on the current branch. No isolation.

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

**Merge conflict resolution:** If you encounter a merge conflict, resolve it — do not reset or discard. Read both sides of the conflict, understand the intent of each change, and produce a merged result that preserves both. After resolving, run verification (Common Step 5) to confirm the resolution didn't break anything. If the conflict is too complex to resolve confidently, present both versions to the user and ask which to keep.

## Autonomy Rules

These apply in **subagent** execution strategy. In **batched** strategy, autonomy rules apply within each batch but execution pauses between batches for human review.

- **Do not ask for feedback** during execution. Make reasonable decisions and keep moving.
- **Do not ask "should I proceed?"** — yes, you should. Always.
- **Do not present options** — pick the best one and implement it.
- **If ambiguous**, choose the simpler approach and note the alternative in a code comment.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Building without a spec or design doc | No clear scope leads to scope creep and unverifiable results |
| Asking for feedback during subagent execution | Subagent strategy is fully automated — make reasonable decisions and keep moving |
| Using `git reset` or `git checkout .` | Other processes may be committing concurrently — destroys their work |
| Skipping code simplification | Iterative implementation accumulates unnecessary complexity across tasks |
| Building a spec with unmet prerequisites | Downstream specs depend on upstream work — check the dependency graph first |
| Skipping journey capture for features with an interaction surface | Journeys give visual review a structured path to walk — but visual review is valuable even without journeys (page-level inspection catches layout, styling, and interaction issues). This applies to all personas: end users, admins, developers, internal tooling users. |
| Writing journeys with vague "should feel" | "Good" and "intuitive" are not testable. "Low commitment" and "like an accomplishment" are. |
| Asking the user whether to create a journey | Journey capture is automatic. The user didn't know they needed the spec either — that's why the workflow exists. |
| Ignoring architectural deviations from the spec | Drift happens during implementation — catch it in Step 4.5 before it becomes tech debt. Every deviation must be explicitly classified. |
| Using `batched` execution within `/flow` | Flow's purpose is hands-off automation — batched pauses for human review after every 3 tasks, contradicting flow's no-stopping design. Use `subagent` with `/flow`. |
| Rewriting docs from scratch during build | Build doc updates are incremental — add/change what the build touched. Full rewrites belong in /wrap-up or /init. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Runs BEFORE /claude-tweaks:build in spec mode — creates the spec. Can be skipped using design mode. |
| `/superpowers:brainstorming` | Produces the design doc that design mode consumes directly |
| `/superpowers:writing-plans` | Invoked BY /claude-tweaks:build to create the execution plan |
| `/superpowers:subagent-driven-development` | Invoked BY /claude-tweaks:build (subagent execution strategy) to execute the plan with automated review chain |
| `/superpowers:executing-plans` | Invoked BY /claude-tweaks:build (batched execution strategy) to execute the plan with human-reviewed batches |
| `/superpowers:using-git-worktrees` | Invoked BY /claude-tweaks:build (worktree git strategy) to create an isolated workspace before execution |
| `/superpowers:finishing-a-development-branch` | Invoked BY /claude-tweaks:build (worktree git strategy) at handoff to merge, PR, or discard the feature branch |
| `/claude-tweaks:simplify` | Invoked BY /claude-tweaks:build after implementation (Common Step 3). Handles code simplification and re-verification. |
| `/claude-tweaks:journeys` | Invoked BY /claude-tweaks:build after verification (Common Step 6). Creates/updates journey files for built features. |
| `/claude-tweaks:stories` | Runs AFTER /claude-tweaks:build — auto-triggered by `/flow` when UI files change, or run manually. /build creates journey files via /journeys (`docs/journeys/*.md`) that /stories ingests for journey-aware story generation — stories reference their source journey via the `journey:` field. Stories are validated by `/test qa`. |
| `/claude-tweaks:test` | Runs AFTER /claude-tweaks:build (in pipeline: receives `VERIFICATION_PASSED=true`, skips types/lint/tests, runs QA if stories exist). Standalone: runs the same checks as /build Common Step 5. |
| `/claude-tweaks:review` | Runs AFTER /claude-tweaks:test — gates on `TEST_PASSED=true`. In design mode, uses git diff instead of spec compliance. Standalone /review auto-triggers /test if no recent pass. |
| `/claude-tweaks:review` (visual modes) | Tests the user journeys that /build creates — visual review modes are the bridge between build and visual QA |
| `/claude-tweaks:wrap-up` | Runs AFTER /claude-tweaks:review — cleans up and captures learnings. `build/skill` ledger entries from Step 4.5 feed into wrap-up's skill update analysis (Step 7). |
| `/claude-tweaks:capture` | Design mode may create INBOX items for blocked work (Step 4); after build, /build calls /capture to file follow-up ideas ("while I'm here" observations) before they're lost — INBOX entries instead of inflating the current spec |
| `/claude-tweaks:tidy` | Reviews specs from /claude-tweaks:build for staleness — periodic cleanup complement |
| `/claude-tweaks:init` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync |
| `/claude-tweaks:ledger` | Manages the open items ledger file. /build creates and appends items during Steps 2.5, 4, 4.5, 5.5, and 6.5. |
| `/claude-tweaks:design` | /build invokes `/claude-tweaks:design pre-build <spec>` as Common Step 1.7 to lazy-load Impeccable reference files and project design context (root `PRODUCT.md`, root `DESIGN.md`) into the implementer subagent. Skips cleanly on non-frontend specs or when Impeccable is not installed. |
| `/claude-tweaks:flow` | Invoked BY /flow as the implementation step — flow constrains /build to `subagent` execution (batched pauses contradict flow's hands-off contract) and passes the pipeline run directory via `PIPELINE_RUN_DIR` so /build's auto-mode decisions land in the shared decision log |
| `/claude-tweaks:help` | /help recommends specific specs to /build based on dependency graph + INDEX.md status; /build's spec resolution rules mirror /help's selection logic |
| `/claude-tweaks:reflect` | /reflect is invoked BY /wrap-up after /build completes; reflection insights tagged for skills/CLAUDE.md feed back into /build's future runs via updated project conventions |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
