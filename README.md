# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## Installation

### Via marketplace

```bash
# Add the marketplace
/plugin marketplace add thomasholknielsen/claude-tweaks-marketplace

# Install the plugin
claude plugin install claude-tweaks
```

### Via direct install

```bash
claude plugin install thomasholknielsen/claude-tweaks
```

## Workflow Lifecycle

```
/setup → /codebase-onboarding → /capture → /challenge → brainstorming → /specify → /build → /review → /wrap-up
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

This plugin works best with the [Superpowers plugin](https://github.com/obra/superpowers-marketplace) which provides `brainstorming`, `writing-plans`, and `subagent-driven-development` skills used by `/challenge`, `/build`, and `/specify`.

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
