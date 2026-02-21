# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

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

Run the setup skill in any project to create the directory structure and verify everything is wired up:

```
/claude-tweaks:setup
```

This will:
- Verify plugin dependencies (Superpowers, code-simplifier)
- Create `specs/`, `docs/plans/`, and starter files (`INBOX.md`, `INDEX.md`)
- Check for `CLAUDE.md` and git
- Present a status report

## Workflow Lifecycle

```
/claude-tweaks:setup → /claude-tweaks:codebase-onboarding → /claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
```

### Core Skills

| # | Skill | Command | Purpose |
|---|-------|---------|---------|
| 1 | setup | `/claude-tweaks:setup` | Bootstrap the workflow system |
| 2 | codebase-onboarding | `/claude-tweaks:codebase-onboarding` | Generate skills, CLAUDE.md, and rules for a project |
| 3 | capture | `/claude-tweaks:capture` | Brain-dump ideas into INBOX |
| 4 | challenge | `/claude-tweaks:challenge` | Debias a problem statement before brainstorming |
| 5 | specify | `/claude-tweaks:specify` | Decompose design doc into agent-sized work units |
| 6 | build | `/claude-tweaks:build` | Implement a spec end-to-end |
| 7 | review | `/claude-tweaks:review` | Quality gate — spec compliance, code review, simplification |
| 8 | wrap-up | `/claude-tweaks:wrap-up` | Reflection, knowledge capture, artifact cleanup |

### Utility Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| next | `/claude-tweaks:next` | Dashboard + recommendation for what to do next |
| tidy | `/claude-tweaks:tidy` | Periodic backlog hygiene |

### Artifact Lifecycle

```
INBOX item ──→ Brief ──→ Design Doc ──→ Spec ──→ Code
  /capture    /challenge  brainstorming  /specify  /build
                                           ↓
                                    (deletes brief
                                     + design doc)

Code ──→ Review Summary ──→ Learnings routed ──→ Clean slate
 /build      /review            /wrap-up
                                  ↓
                           (deletes spec
                            + plans)
```

## Dependencies

| Plugin | Source | Required for |
|--------|--------|-------------|
| [Superpowers](https://github.com/obra/superpowers-marketplace) | `obra/superpowers-marketplace` | `brainstorming`, `writing-plans`, `subagent-driven-development` |
| code-simplifier | Built-in subagent | Code simplification in `/claude-tweaks:review` and `/claude-tweaks:build` |

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
