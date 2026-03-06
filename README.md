# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## What this does

Claude Code is powerful but unstructured. claude-tweaks adds a complete development lifecycle: capture ideas, challenge assumptions, decompose into specs, build with quality gates, and learn from what was built. Every finding is explicitly resolved — nothing silently drops.

## Installation

```
/plugin marketplace add thomasholknielsen/claude-tweaks-marketplace
/plugin install claude-tweaks@claude-tweaks-marketplace
/plugin install superpowers@claude-plugins-official
/claude-tweaks:init
```

## How it works

```
  SKILL                      ARTIFACT                 SUPERPOWERS USED
  ─────                      ────────                 ────────────────

  capture ──────────────►  INBOX item
     │
  challenge ────────────►  Brief
     │
     │                     Design Doc          ◄───  brainstorm
     │
  specify ──────────────►  Spec
     │                     (deletes Brief + Design Doc)
     │
  ┈┈ /claude-tweaks:flow automates below (worktree mode optional) ┈┈
     │
  build ────────────────►  Code + Journeys    ◄───  subagent-driven-development
     ┊  (if UI changed)                             executing-plans
  stories ──────────────►  Story YAML                using-git-worktrees ⚙
     │
  test ─────────────────►  TEST_PASSED
     │
  review ───────────────►  Review Summary     ◄───  dispatching-parallel-agents
     │
  wrap-up ──────────────►  Done               ◄───  finishing-a-dev-branch ⚙
                           (deletes Spec, plans, ledger)
```

> **Left column:** `/claude-tweaks:{name}` — **Right column:** `/superpowers:{name}` ([Superpowers plugin](https://github.com/obra/superpowers))
> **⚙** = worktree mode only — **┊** = conditional step
> `/claude-tweaks:init` runs once per project, before entering the pipeline.

## Skills

### Plan phase

**`/claude-tweaks:init`** — One-time project bootstrap. Scans the codebase, generates a CLAUDE.md with project-specific conventions and philosophy, creates workflow directories (`specs/`, `docs/plans/`, `docs/journeys/`), sets up browser integration (playwright-cli and/or Chrome MCP), builds a documentation registry (`docs/REGISTRY.md`) mapping docs to code areas for automatic updates, and discovers existing user journeys.

**`/claude-tweaks:capture`** — Brain-dump an idea into `specs/INBOX.md`. Accepts free-text — no structure needed. Ideas are triaged later by `/claude-tweaks:tidy` or pulled into the pipeline by `/claude-tweaks:challenge`.

**`/claude-tweaks:challenge`** — Takes an INBOX item or topic and pressure-tests it before committing to an approach. Surfaces hidden assumptions, identifies risks, explores alternatives. Produces a Brief that feeds into brainstorming.

**`/superpowers:brainstorm`** *(Superpowers plugin)* — Generates solution approaches from the Brief. Explores multiple directions, evaluates tradeoffs, and produces a Design Doc with a recommended approach.

**`/claude-tweaks:specify`** — Decomposes a Design Doc into agent-sized specs with clear acceptance criteria. Each spec gets a numbered file in `specs/`. Detects implicit dependencies between specs (two specs touching the same files) and builds a file-to-spec map. Deletes the Brief and Design Doc after absorbing them. Uses `/superpowers:write-plan` to structure the execution plan.

### Pipeline (automated by `/claude-tweaks:flow`)

**`/claude-tweaks:build`** — Implements a spec end-to-end. Two orthogonal choices:

| | **Current branch** | **Worktree** |
|---|---|---|
| **Subagent** (default) | Fast solo work | Isolated feature branch |
| **Batched** | Hands-on review per chunk | Full control + full isolation |

Uses `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` for autonomous execution. In worktree mode, `/superpowers:using-git-worktrees` manages the isolated branch. Automatically creates user journey files (`docs/journeys/`) for user-facing features, updates docs matched by the documentation registry, and tracks deferred items in the open items ledger.

```
/claude-tweaks:build 42                    → subagent + current branch (default)
/claude-tweaks:build 42 worktree           → subagent + isolated feature branch
/claude-tweaks:build 42 batched            → human-reviewed batches + current branch
/claude-tweaks:build 42 auto               → subagent + worktree, no confirmations
```

**`/claude-tweaks:stories`** — Generates QA story YAML files by browsing your running app. Auto-detects the dev server, reads existing journey files as a skeleton, and extracts behavioral contracts from component source code (validation rules, state transitions, error paths) to generate tests that cover the full behavioral surface — not just what's visible on first render.

Stories include `source_files:` and `journey:` fields for change-aware scoping and coverage tracking. Supports auth profiles (`stories/auth.yml`), self-healing CSS selectors, and parallel orchestration across browser sessions. Auto-triggered by `/claude-tweaks:flow` when UI files changed.

**`/claude-tweaks:test`** — Mechanical "does it work?" gate. Runs types, lint, and tests from your project. In QA mode, validates story YAML files against the running app with enriched reporting — 5 finding categories (code-bug, stale-selector, ux-issue, flaky-env, story-bug), severity levels, and suggested fixes. Supports scoping by journey, tag, affected files, or retry of previous failures.

```
/claude-tweaks:test                        → standard suite (types + lint + tests)
/claude-tweaks:test qa                     → QA story validation
/claude-tweaks:test qa journey=checkout    → stories for one journey
/claude-tweaks:test all                    → full suite + QA stories
```

**`/claude-tweaks:review`** — Analytical "is it good?" gate. Gates on `/claude-tweaks:test` passing. Runs multiple review lenses in parallel — spec compliance, code quality, UX analysis, hindsight, and simplification. Detects journey regressions when changed files overlap with existing journey `files:` frontmatter. Uses `/superpowers:dispatching-parallel-agents` to fix 3+ independent issues in parallel. Every finding must be explicitly resolved — fix now, defer, or accept with reason.

| Mode | What it does |
|------|-------------|
| **code** (default) | Code review + UX analysis (when QA data available) + simplification |
| **full** (default in /flow) | Code review + visual browser review + idea generation |
| **visual** | Browser review only — single page |
| **journey** | Browser review only — walk a documented journey |
| **discover** | Scan and document all user journeys |

**`/claude-tweaks:wrap-up`** — Reflection and cleanup. Routes learnings to CLAUDE.md and skill files, captures deferred work with triggers for re-activation, resolves every open ledger item. In worktree mode, uses `/superpowers:finishing-a-development-branch` to merge and clean up the feature branch. Deletes the spec, plan files, and ledger — leaving a clean slate.

### Utility skills

**`/claude-tweaks:flow`** — Automated pipeline: build → [stories →] test → review → wrap-up in one command. Add `worktree` for isolated branches, `no-stories` to skip QA generation. Resume from any step with `/claude-tweaks:flow 42 review`. Run multiple specs sequentially (`/claude-tweaks:flow 42,45,48`) or in parallel across terminals with worktree mode.

**`/claude-tweaks:help`** — Dashboard with workflow status, command reference, and context-aware recommendations. Warns about dependency conflicts between in-progress specs.

**`/claude-tweaks:tidy`** — Batch backlog hygiene. Triages INBOX items, scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes.

**`/claude-tweaks:browse`** — Unified browser automation. Auto-detects the best backend: playwright-cli (recommended, headless, parallel) or Chrome MCP (observable, real profile). Used internally by stories, test, and review.

**`/claude-tweaks:ledger`** — Query and resolve the open items ledger (`docs/plans/*-ledger.md`) that tracks findings across all pipeline phases. The ledger is a file on disk — it survives context window compression so findings from one phase aren't lost before a later phase can act on them.

## Common workflows

```
# New repo — bootstrap and start capturing ideas
/claude-tweaks:init
/claude-tweaks:help                    # verify setup, see what's next
/claude-tweaks:capture "first feature idea"

# Full pipeline — idea to clean slate
/claude-tweaks:capture "users need meal planning"
/claude-tweaks:challenge meal planning
/superpowers:brainstorm
/claude-tweaks:specify meal planning
/claude-tweaks:flow 73

# Fast — spec already exists
/claude-tweaks:flow 42

# Resume from a specific step
/claude-tweaks:flow 42 review

# Parallel specs in separate terminals (worktree mode)
/claude-tweaks:flow 42 worktree       # Terminal 1
/claude-tweaks:flow 45 worktree       # Terminal 2
/claude-tweaks:flow 48 worktree       # Terminal 3

# Check pipeline status (navigation hub)
/claude-tweaks:help                    # what's ready, what's blocked, what's next

# Visual QA
/claude-tweaks:review 42 full
/claude-tweaks:review journey:checkout-flow
/claude-tweaks:review discover
```

## Dependencies

| Plugin / Tool | Source | Required |
|---------------|--------|----------|
| [Superpowers](https://github.com/obra/superpowers) | `/plugin install superpowers@claude-plugins-official` | Yes — brainstorming, planning, subagent execution, worktree management |
| playwright-cli | `npm install -g @playwright/cli@latest` | Optional — browser automation for stories, test qa, review visual |
| Chrome MCP | Chrome extension + `claude --chrome` | Optional — alternative browser backend using real Chrome profile |

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
