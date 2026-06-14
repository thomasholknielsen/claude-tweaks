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

## Build Options (summary)

Two orthogonal axes (execution × git) combine freely. Default is `subagent` + `worktree`.

| Axis | Options | Default |
|------|---------|---------|
| **Execution** | `subagent` (automated review chain) / `batched` (3-task human-reviewed batches) | `subagent` |
| **Git** | `worktree` (isolated branch) / `current-branch` (direct commits) | `worktree` |
| **Auto** | `auto` keyword — applies CLAUDE.md / fallback defaults, skips confirmation prompts, routes deviations per `_shared/auto-mode-contract.md` | off |

Read `build-options.md` in this skill's directory for the full options matrix, invocation grammar (six combinations), default-resolution order, the build-options prompt template, the spec-vs-design mode table, and the input-resolution rules. `$ARGUMENTS` = spec number / design doc path / topic name, optionally followed by execution strategy, git strategy, and/or `auto`.

## Workflow

```
Resolve input
    ↓
Spec mode? ──yes──→ [Spec Steps 1, 2, 2.5 (Manual Steps classification), 3]
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

**Auto mode:** apply the `scope-creep` policy from `config.yml` (default `add-to-plan`). **Interactive mode:** present a numbered prompt with "Add to plan and continue / Continue without / Stop."

**Skip this step entirely when** the plan has fewer than 3 file references AND no `Scope keywords:` field is present.

> **Project setting:** When CLAUDE.md declares `scope-keywords-required: true` under a `## Build` section, plans without a `Scope keywords:` field are treated as failed audits (require the field, not just optional). See `plan-audit.md` for the policy table.

For the full procedure (Check A failure handling, Check B scope-keyword sweep command, `scope-keywords-required` setting, auto-mode policy table, interactive prompt), read `plan-audit.md` in this skill's directory.

### Common Step 1.7: Design Pre-Build (frontend specs)

For frontend specs (when `surface` ∈ `web | mobile | desktop`), invoke `/claude-tweaks:design pre-build <spec>` to lazy-load relevant design references into the implementer subagent's context. For the full skip conditions, invocation rules, result handling, and where loaded references go, see `design-prebuild.md` in this skill's directory.

### Common Step 2: Execute the Plan

Execution depends on the chosen execution strategy (see Build Options).

> **Working Directory Discipline:** Before any commit (and before dispatching subagents that run `git` or `node --test`), anchor the working directory explicitly — `pwd` + `git rev-parse --show-toplevel` must match the worktree path (or the project root in `current-branch` strategy). When dispatching subagents, require them to use `cd "$WORKTREE" && …` or `git -C "$WORKTREE" …`. See the Working Directory Discipline section of `_shared/subagent-output-contract.md` for the full pattern.

**subagent** (default): Invoke `/superpowers:subagent-driven-development`. After the final code review completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps (simplification, alignment, verification) before any branch finishing.

**batched**: Invoke `/superpowers:executing-plans`. After the last batch completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps before any branch finishing.

#### Superpowers Failure Handling

If the execution skill (or `/superpowers:writing-plans` in Step 3) fails, read `failure-recovery.md` in this skill's directory for the full recovery table (not-installed, timeout/partial output, malformed plan, subagent failures, batch rejection) and the project-specific context CLAUDE.md should document for implementer subagents.

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

Compare what was actually built to what the spec or design doc said. For the full diff procedure, mismatch categorization (Beneficial / Fix now / Update the spec), the batch decision table format (interactive vs. auto-mode handling), and the Skill Observation sub-step, read `architecture-alignment.md` in this skill's directory.

**Skip this step if:** design mode with no formal spec, or the plan was trivial (< 3 tasks, single-file changes).

### Common Step 5: Final Verification

After code simplification, run the shared verification procedure (`skills/test/verification.md`). This runs type checking, linting, and tests using the project's commands from CLAUDE.md.

**Note:** `/build` always runs verification (it is the *producer* of `VERIFICATION_PASSED`). The skip-if-recent rule in `test/verification.md` applies only to `/test` callers — never to this step.

If anything fails, fix it and commit the fix. **When a failure is a behavioral bug — not a mechanical type/lint error — invoke `/superpowers:systematic-debugging` before changing code:** reproduce the bug on command (a deterministic, runnable pass/fail signal) first, then fix the confirmed cause. Do not guess at fixes and re-run tests hoping they pass. If the bug cannot be reproduced, stop and escalate (state what you tried and what you need) rather than flailing — see `failure-recovery.md`.

### Common Step 5.5: Operational Checklist

After verification passes, check for operational tasks that are easy to forget — deployment and environment concerns that slip through code review (schema/migration files, env access patterns, IaC, CI/CD, container configs).

If your build's diff matches schema/env/IaC/CI/platform-config files, read `operational-checklist.md` in this skill's directory for the full Category A/B trigger lists, check tables, probe-then-classify procedure, and ledger format. Otherwise skip this step entirely.

> **Parallel execution:** Use parallel tool calls — all checks are independent Grep/Glob operations.

### Common Step 6: User Journey Capture

After verification passes, run `/claude-tweaks:journeys`. Pass:
- **Changed files** — files modified during this build session
- **Spec or design doc context** — what was built and why

The journeys skill handles scanning existing journeys, creating new journey files, updating existing ones, and committing. See `/claude-tweaks:journeys` for details.

This is not optional and does not require user input — if you built a feature that any persona interacts with (end user, admin, developer, internal tooling user), the journeys skill documents it.

### Common Step 6.5: Documentation Sync

If `docs/REGISTRY.md` exists, read `docs-sync.md` in this skill's directory for the full procedure (read registry, match changed files against registered patterns, update inline or defer to wrap-up per doc type). If `docs/REGISTRY.md` does not exist, skip this step entirely.

### Common Step 7: Handoff

After successful build, read `handoff-template.md` in this skill's directory and render the handoff using that template. The template covers verification status, what was built, simplification summary, journeys, documentation changes, blocked items, manual steps, and the Actions Performed table.

## Git Strategy

**worktree** (default): Before any work begins, `/superpowers:using-git-worktrees` creates an isolated workspace on a feature branch. All commits land in the worktree. At handoff, `/superpowers:finishing-a-development-branch` handles merge, PR, or discard — do NOT auto-merge or auto-PR.

**current-branch**: Commit directly on the current branch. No isolation.

## Git Rules

These rules apply in ALL modes. See `_shared/git-discipline.md` for the canonical Git Rules table (never reset, never force push, stage specific files only, verify commits landed, etc.) and the merge conflict resolution procedure. After resolving a merge conflict, run verification (Common Step 5) to confirm the resolution didn't break anything.

## Autonomy Rules

These apply in **subagent** execution strategy. In **batched** strategy, autonomy rules apply within each batch but execution pauses between batches for human review.

- **Do not ask for feedback** during execution. Make reasonable decisions and keep moving.
- **Do not ask "should I proceed?"** — yes, you should. Always.
- **Do not present options** — pick the best one and implement it.
- **If ambiguous**, choose the simpler approach and note the alternative in a code comment.

## Next Actions

Generate 2-4 numbered options based on context. Example rendering (the signal-to-option table below is the lookup the generator uses to populate the numbered list):

```
1. /claude-tweaks:review 42 full — code + visual review **(Recommended)**
2. /claude-tweaks:test qa — validate 7 QA stories before review
3. /superpowers:finishing-a-development-branch — merge, PR, or discard the feature branch
```

Signal-to-option lookup:

| Signal | Option |
|--------|--------|
| UI changed + browser available | `/claude-tweaks:review {N} full` — code + visual review **(Recommended)** |
| No browser or no UI | `/claude-tweaks:review {N}` — code review **(Recommended)** |
| QA stories exist (`stories/*.yaml` or `stories/*.yml`) | `/claude-tweaks:test qa` — validate {X} QA stories before review |
| Worktree mode | `/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch **(Recommended in worktree mode)** |

## Component-Skill Contract

`/claude-tweaks:build` is invoked by `/claude-tweaks:flow` as the implementation stage of the pipeline. Parent invocation is signaled by the `PIPELINE_RUN_DIR` env var (set by `/flow` when it spawns this skill — also resolvable via the most-recent matching run under `.claude-tweaks/pipelines/`). When `PIPELINE_RUN_DIR` is set, omit the `## Next Actions` block at the end of Step 7 — the parent `/flow` owns the handoff and renders its own Pipeline Summary + Next Actions. When invoked directly by a user (no `PIPELINE_RUN_DIR`), render Next Actions as documented in Step 7. The Manual Steps section likewise defers its rendering to the parent's summary when invoked under `/flow` (see Step 5.5).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Building without a spec or design doc | No clear scope leads to scope creep and unverifiable results |
| Asking for feedback during subagent execution | Subagent strategy is fully automated — make reasonable decisions and keep moving |
| Using `git reset` or `git checkout .` | Other processes may be committing concurrently — destroys their work |
| Skipping code simplification | Iterative implementation accumulates unnecessary complexity across tasks |
| Building a spec with unmet prerequisites | Downstream specs depend on upstream work — check the dependency graph first |
| Skipping journey capture for features with an interaction surface | Journeys give visual review a structured path to walk and feed `/stories` for QA generation. This applies to all personas: end users, admins, developers, internal tooling users. |
| Writing journeys with vague "should feel" | "Good" and "intuitive" are not testable. "Low commitment" and "like an accomplishment" are. |
| Asking the user whether to create a journey | Journey capture is automatic. The user didn't know they needed the spec either — that's why the workflow exists. |
| Ignoring architectural deviations from the spec | Drift happens during implementation — catch it in Step 4.5 before it becomes tech debt. Every deviation must be explicitly classified. |
| Guessing at fixes for behavioral bugs without reproducing them | Edit-and-pray debugging turns a 30-minute bug into a 3-hour one — reproduce on command first via `/superpowers:systematic-debugging`, then fix the confirmed cause (Common Step 5). |
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
| `/superpowers:systematic-debugging` | Invoked BY /claude-tweaks:build (Common Step 5) when a behavioral bug surfaces during verification — reproduce-first discipline before fixing, escalate when the bug can't be reproduced |
| `/claude-tweaks:simplify` | Invoked BY /claude-tweaks:build after implementation (Common Step 3). Handles code simplification and re-verification. |
| `/claude-tweaks:deepen` | Produces the modules /deepen evaluates. Architectural deviations build catches in Common Step 4.5 can route to /deepen for a dedicated module-depth pass (distinct from /simplify's line-level cleanup). |
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
