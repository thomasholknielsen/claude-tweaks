# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## What this does

Claude Code is powerful but unstructured. Give it a vague request and it'll produce code — but without a system for capturing ideas, challenging assumptions, decomposing work, reviewing quality, and learning from what was built.

claude-tweaks adds that system. It's a set of skills that guide Claude through a complete development lifecycle:

- **Capture** ideas before they're lost
- **Challenge** assumptions before committing to an approach
- **Specify** work into agent-sized units with clear acceptance criteria
- **Build** with automatic journey capture and architectural alignment
- **Test** independently with targeted or full-suite verification
- **Browse** web pages with unified automation (playwright-cli or Chrome MCP)
- **Stories** — generate QA story YAML files by browsing your app
- **Review** with batched code review findings, visual browser inspection, QA story validation, and simplification
- **Wrap up** with reflection, knowledge routing, and artifact cleanup

Every finding is explicitly routed — fixed now, deferred with context, or explicitly accepted. Nothing silently drops.

## Installation

### Step 1: Add the marketplace and install claude-tweaks

Inside Claude Code:

```
/plugin marketplace add thomasholknielsen/claude-tweaks-marketplace
/plugin install claude-tweaks@claude-tweaks-marketplace
```

### Step 2: Install dependencies

The workflow system depends on the **Superpowers** plugin for brainstorming, planning, and subagent-driven development.

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

### Step 3: Bootstrap a project

```
/claude-tweaks:setup
```

This will:
- Verify plugin dependencies (Superpowers, code-simplifier)
- Create `specs/`, `docs/plans/`, `docs/journeys/`, and starter files (`INBOX.md`, `INDEX.md`)
- Check for `CLAUDE.md` and git
- Optionally set up browser integration (playwright-cli and/or Chrome MCP)
- Present a status report

## Workflow Lifecycle

```
/setup → /codebase-onboarding → /capture → /challenge → /brainstorm → /specify → /build → [/stories] → /review → /wrap-up
                                                                                       ╰──────── /flow automates ────────╯
                                                                           /test ↕    /browse ↕    /review visual + qa modes
```

### Lifecycle Skills

| # | Command | Purpose |
|---|---------|---------|
| 1 | `/claude-tweaks:setup` | Bootstrap workflow directories, dependencies, browser integration |
| 2 | `/claude-tweaks:codebase-onboarding` | Generate CLAUDE.md, skills, and rules for a project |
| 3 | `/claude-tweaks:capture` | Brain-dump ideas into INBOX |
| 4 | `/claude-tweaks:challenge` | Debias a problem statement before brainstorming |
| 5 | `/claude-tweaks:specify` | Decompose design doc into agent-sized specs with implicit dependency detection |
| 6 | `/claude-tweaks:build` | Implement a spec end-to-end (subagent/batched execution, current-branch/worktree git strategy) |
| 6b | `/claude-tweaks:test` | Standalone verification — types, lint, tests |
| 6c | `/claude-tweaks:stories` | Generate or update QA story YAML files by browsing a site |
| 7 | `/claude-tweaks:review` | Quality gate — code review + optional visual/QA review |
| 8 | `/claude-tweaks:wrap-up` | Reflection, knowledge capture, artifact cleanup |

### Utility Skills

| Command | Purpose |
|---------|---------|
| `/claude-tweaks:help` | Quick reference, workflow status dashboard, recommendations |
| `/claude-tweaks:tidy` | Batch backlog hygiene with cross-spec pattern detection |
| `/claude-tweaks:flow` | Automated pipeline: build → [stories →] review → wrap-up with gates |
| `/claude-tweaks:browse` | Unified browser automation — playwright-cli or Chrome MCP |

## Common Workflows

### Feature from scratch (full pipeline)

```
/claude-tweaks:capture "users need meal planning"
/claude-tweaks:challenge meal planning
/brainstorm
/claude-tweaks:specify meal planning
/claude-tweaks:build 73
/claude-tweaks:review 73
/claude-tweaks:wrap-up 73
```

### Fast pipeline (spec ready, fully automated)

```
/claude-tweaks:flow 42
```

Or run multiple specs sequentially in one terminal:

```
/claude-tweaks:flow 42,45,48
```

For true parallel execution, use separate terminals with worktree mode:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:flow 42 worktree       /claude-tweaks:flow 45 worktree       /claude-tweaks:flow 48 worktree
```

### Visual QA session

Run a full code + visual review:

```
/claude-tweaks:review 42 full
```

Or standalone visual modes:

```
/claude-tweaks:review journey:checkout-flow    → walk a documented journey
/claude-tweaks:review visual http://localhost:3000/settings    → review a single page
/claude-tweaks:review discover    → find and document all user journeys
```

## Key Features

### Build Options

Two orthogonal choices: **execution strategy** (subagent/batched) and **git strategy** (current-branch/worktree).

| | **Current branch** | **Worktree** |
|---|---|---|
| **Subagent** (default) | Fast solo work. | Isolated automated build. |
| **Batched** | Hands-on review, no isolation. | Full control + full isolation. |

```
/claude-tweaks:build 42                    → subagent + current branch (default)
/claude-tweaks:build 42 worktree           → subagent + worktree feature branch
/claude-tweaks:build 42 batched            → human-reviewed batches + current branch
/claude-tweaks:build 42 batched worktree   → human-reviewed batches + worktree
```

### Review Modes

Code review with optional visual inspection and QA validation. Six modes:

| Mode | What it does |
|------|-------------|
| **code** (default) | Spec compliance, verification, code review, hindsight, simplification |
| **full** | Code review + visual browser review |
| **visual** | Browser review only — single page |
| **journey** | Browser review only — walk a documented journey |
| **discover** | Browser review only — scan and document all user journeys |
| **qa** | Structured YAML story execution — parallel agents, dependency tiers, pass/fail report |

### User Journeys

Persistent markdown files in `docs/journeys/` that describe how personas accomplish goals. Created automatically during `/build` for user-facing features, tested by `/review` visual modes, discovered in bulk via `/review discover` or `/codebase-onboarding`.

Each journey tracks its implementing source files via `files:` frontmatter. During `/review`, changed files are checked against all journeys — if a build touches files that an existing journey depends on, the review flags it for visual regression testing.

### Browser Automation

`/browse` provides unified browser automation that auto-detects the best available backend:

- **playwright-cli** (recommended) — headless CLI automation, parallel sessions, token-efficient
- **Chrome MCP** (optional) — observable automation using your real Chrome with existing profile and cookies

```
/claude-tweaks:browse http://localhost:3000                    → auto-detect backend, explore site
/claude-tweaks:browse screenshot http://example.com            → capture visual state
/claude-tweaks:browse browser=chrome http://localhost:3000     → force Chrome backend
```

### QA Pipeline

Generate user stories by browsing your app, then validate them with parallel agents:

```
/claude-tweaks:stories http://localhost:3000                   → browse site, generate story YAML files
/claude-tweaks:review qa                                       → validate all stories against running app
/claude-tweaks:review qa tag=smoke                             → validate smoke tests only
/claude-tweaks:review qa retry=screenshots/qa/20260210_143022  → re-run only failed stories
```

Or include stories in the automated pipeline:

```
/claude-tweaks:flow 42 stories                                 → build → stories → review qa → review code → wrap-up
```

### Standalone Testing

`/test` runs verification checks independently — useful for quick sanity checks, targeted testing, or reproducing CI failures:

```
/claude-tweaks:test                    → full suite (types + lint + tests)
/claude-tweaks:test types lint         → type checking and linting only
/claude-tweaks:test affected           → tests affected by uncommitted changes
/claude-tweaks:test src/api/           → tests scoped to a directory
```

### Batch Decisions

Multi-item findings (code review, tidy, wrap-up insights) are presented as a single table with pre-filled recommendations:

```
| # | Finding              | Severity | Recommended        |
|---|----------------------|----------|--------------------|
| 1 | Missing validation   | High     | Fix now            |
| 2 | Naming inconsistency | Low      | Don't fix — legacy |

1. Apply all recommendations (Recommended)
2. Override specific items (tell me which #s to change)
```

### Cross-Spec Intelligence

The workflow learns from its own history:

- **Pattern detection** — `/tidy` scans recent review and wrap-up history for recurring findings across specs (repeated convention violations, responsibility-magnet files, rediscovered gotchas) and recommends project-level fixes
- **Journey regression** — `/review` detects when a build's changed files overlap with existing journey `files:` frontmatter, flagging affected journeys for visual testing
- **Dependency intelligence** — `/specify` builds a file->spec map from Key Files sections and detects implicit dependencies (two specs modifying the same files). `/help` uses this to warn before building specs that conflict with in-progress work

### Context Flow

Skills communicate through **durable artifacts on disk** — specs, briefs, design docs, journey files, review summaries. Each skill reads artifacts produced by upstream skills and writes artifacts consumed by downstream skills. Context survives across sessions, is inspectable as markdown files, and is explicitly consumed (not silently accumulated). For a detailed breakdown of what each skill reads and writes, see `skills/help/context-flow.md`.

### Parallel Execution

Skills include explicit parallelization directives that tell Claude when to run operations concurrently — parallel tool calls for independent reads and searches, parallel Task agents for heavier analytical work like review lenses and pipeline scans, and conditional dispatch for context-dependent parallelism (e.g., `/review` dispatches 3+ independent fixes via `/dispatching-parallel-agents`). For true parallel spec execution, use separate terminals with worktree mode:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:flow 42 worktree       /claude-tweaks:flow 45 worktree       /claude-tweaks:flow 48 worktree
```

### No Implicit Drops

Every surfaced finding — code review issues, visual review observations, wrap-up insights, tidy items — must be explicitly resolved: fix now, defer with context, or accept with a stated reason. Nothing silently disappears.

The **open items ledger** (`docs/plans/*-ledger.md`) tracks all findings and operational tasks across pipeline phases as a file on disk — surviving context compression. `/wrap-up` enforces a nothing-left-behind gate: every item must reach a terminal status before the pipeline completes.

## Artifact Lifecycle

```
INBOX item ──→ Brief ──→ Design Doc ──────→ Spec ──→ Code + Journey
  /capture    /challenge  /brainstorm  /specify  /build
                                           ↓           ↓       ↓
                                    (deletes brief  Deferred  docs/journeys/
                                     + design doc)  Work

Code + Journey ──→ Story YAML ──→ QA Report ──→ Review Summary ──→ Learnings routed ──→ Clean slate
     /build         /stories      /review qa       /review            /wrap-up
               (visual modes)                  ↓                ↓
                                           Deferred Work  (deletes spec
                                                            + plans + ledger)

Open Items Ledger ── tracks findings across all phases ── resolved + deleted by /wrap-up
```

## Dependencies

| Plugin / Tool | Source | Required for |
|---------------|--------|-------------|
| [Superpowers](https://github.com/obra/superpowers) | [`obra/superpowers-marketplace`](https://github.com/obra/superpowers-marketplace) | `/brainstorm`, `/write-plan`, `/subagent-driven-development`, `/executing-plans`, `/using-git-worktrees`, `/finishing-a-development-branch`, `/dispatching-parallel-agents` |
| code-simplifier | Built-in subagent | Code simplification in `/review` and `/build` |
| playwright-cli | `npm install -g @playwright/cli@latest` | `/browse`, `/stories`, `/review qa` (optional — Chrome MCP is an alternative) |
| Chrome MCP | Chrome extension + `claude --chrome` | `/browse` Chrome backend (optional — playwright-cli is the recommended default) |

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
