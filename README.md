# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## What this does

Claude Code is powerful but unstructured. Give it a vague request and it'll produce code — but without a system for capturing ideas, challenging assumptions, decomposing work, reviewing quality, and learning from what was built.

claude-tweaks adds that system. It's a set of skills that guide Claude through a complete development lifecycle:

- **Capture** ideas before they're lost
- **Challenge** assumptions before committing to an approach
- **Specify** work into agent-sized units with clear acceptance criteria
- **Build** with automatic journey capture and architectural alignment
- **Review** with batched code review findings, visual browser inspection, and simplification
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
- Optionally set up browser integration (Chrome Extension or Playwright MCP)
- Present a status report

## Workflow Lifecycle

```
/setup → /codebase-onboarding → /capture → /challenge → brainstorming → /specify → /build → /review → /wrap-up
                                                                                       ╰── /flow automates ──╯
                                                                                                 ↕
                                                                                          /browser-review
```

### Lifecycle Skills

| # | Command | Purpose |
|---|---------|---------|
| 1 | `/claude-tweaks:setup` | Bootstrap workflow directories, dependencies, browser integration |
| 2 | `/claude-tweaks:codebase-onboarding` | Generate CLAUDE.md, skills, and rules for a project |
| 3 | `/claude-tweaks:capture` | Brain-dump ideas into INBOX |
| 4 | `/claude-tweaks:challenge` | Debias a problem statement before brainstorming |
| 5 | `/claude-tweaks:specify` | Decompose design doc into agent-sized specs with implicit dependency detection |
| 6 | `/claude-tweaks:build` | Implement a spec end-to-end (autonomous, guided, or branched mode) |
| 7 | `/claude-tweaks:review` | Quality gate — spec compliance, batched code review, simplification |
| 7b | `/claude-tweaks:browser-review` | Visual inspection — test the running app against user journeys |
| 8 | `/claude-tweaks:wrap-up` | Reflection, knowledge capture, artifact cleanup |

### Utility Skills

| Command | Purpose |
|---------|---------|
| `/claude-tweaks:help` | Quick reference, workflow status dashboard, recommendations |
| `/claude-tweaks:tidy` | Batch backlog hygiene with cross-spec pattern detection |
| `/claude-tweaks:flow` | Automated pipeline: build → review → wrap-up with gates |

## Key Features

### Build Modes

```
/claude-tweaks:build 42                → autonomous (default)
/claude-tweaks:build 42 guided         → pause at key checkpoints
/claude-tweaks:build 42 branched       → feature branch, autonomous
```

### Browser Review

Visual inspection with a creative framework: reaction → experience → analysis → imagination. Three modes:

- **Journey mode** — walk a documented user journey, testing each step against "should feel" expectations
- **Page mode** — review a single URL through persona rotation and structured analysis
- **Discover mode** — scan a brownfield codebase for routes, walk the app in a browser, create journey files

### User Journeys

Persistent markdown files in `docs/journeys/` that describe how personas accomplish goals. Created automatically during `/build` for user-facing features, tested by `/browser-review`, discovered in bulk via `/browser-review discover` or `/codebase-onboarding`.

Each journey tracks its implementing source files via `files:` frontmatter. During `/review`, changed files are checked against all journeys — if a build touches files that an existing journey depends on, the review flags it for visual regression testing.

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
- **Dependency intelligence** — `/specify` builds a file→spec map from Key Files sections and detects implicit dependencies (two specs modifying the same files). `/help` uses this to warn before building specs that conflict with in-progress work

### No Implicit Drops

Every surfaced finding — code review issues, browser observations, wrap-up insights, tidy items — must be explicitly resolved: fix now, defer with context, or accept with a stated reason. Nothing silently disappears.

## Artifact Lifecycle

```
INBOX item ──→ Brief ──→ Design Doc ──→ Spec ──→ Code + Journey
  /capture    /challenge  brainstorming  /specify  /build
                                           ↓           ↓       ↓
                                    (deletes brief  Deferred  docs/journeys/
                                     + design doc)  Work

Code ──→ Review Summary ──→ Learnings routed ──→ Clean slate
 /build      /review            /wrap-up
            ↕        ↓                ↓
   /browser-review  Deferred Work  (deletes spec
   (walks journeys)                 + plans)
```

## Dependencies

| Plugin | Marketplace | Required for |
|--------|-------------|-------------|
| [Superpowers](https://github.com/obra/superpowers) | [`obra/superpowers-marketplace`](https://github.com/obra/superpowers-marketplace) | `brainstorming`, `writing-plans`, `subagent-driven-development` |
| code-simplifier | Built-in subagent | Code simplification in `/review` and `/build` |

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
