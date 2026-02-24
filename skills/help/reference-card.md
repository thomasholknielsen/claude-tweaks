# Skill Reference Card

Quick reference for all claude-tweaks skills. For full details, run `/claude-tweaks:help commands`.

## Lifecycle (run in order)

| Command | What it does | Takes |
|---------|-------------|-------|
| `/setup` | Bootstrap directories and dependencies | — |
| `/codebase-onboarding` | Generate CLAUDE.md, skills, rules | path, URL, `update` |
| `/capture` | Brain-dump idea into INBOX | idea text |
| `/challenge` | Debias assumptions before brainstorming | `quick`, INBOX item, topic |
| `/specify` | Decompose design doc into agent-sized specs | design doc, topic |
| `/build` | Implement a spec or design doc | spec #, doc path + `batched`, `worktree` |
| `/test` | Run verification checks standalone | `types`, `lint`, `unit`, path, `affected` |
| `/stories` | Generate or update QA story YAML files | URL + `persona=`, `dir=`, `focus=`, `browser=`, `refine=`, `negative=` |
| `/review` | Quality gate: code + optional visual/QA review | spec #, files + `full`/`visual`/`journey:{name}`/`discover`/`qa` |
| `/wrap-up` | Reflect, capture learnings, clean up | spec # |

## Utility

| Command | What it does | Takes |
|---------|-------------|-------|
| `/help` | Dashboard: commands + status + recommendations | `status`, `commands`, spec/topic |
| `/tidy` | Batch backlog hygiene | — |
| `/flow` | Automated pipeline: build → review → wrap-up | spec #(s), doc path + `worktree` `stories` `[steps]` |
| `/browse` | Unified browser automation (utility) | URL or task + `browser=`, `headless`, `vision` |

## Common Workflows

### Feature from scratch
```
/capture "users need meal planning"
/challenge meal planning
/superpowers:brainstorm
/specify meal planning
/build 73
/review 73
/wrap-up 73
```

### Fast pipeline (spec ready)
```
/flow 42
```

### Visual QA after build
```
/review 42 full
```
or standalone:
```
/review journey:checkout-flow
```

### Verify before commit
```
/test
```

### Parallel specs (separate terminals with worktree)
```
# Terminal 1              # Terminal 2              # Terminal 3
/flow 42 worktree         /flow 45 worktree         /flow 48 worktree
```

### Sequential multi-spec
```
/flow 42,45,48
```

### QA pipeline
```
/stories http://localhost:3000
/review qa
```

### Brownfield onboarding
```
/setup
/codebase-onboarding
/review discover
```

## Artifact Lifecycle

```
INBOX → Brief → Design Doc → Spec → Code + Journey → Story YAML → QA Report → Review → Learnings → Clean Slate
```

Each arrow means "consumed by the next skill." Consumed artifacts are deleted — specs and code are the durable outputs.

## Key Principles

- **Every finding is routed** — fix now, defer, or capture. Nothing drops silently.
- **Batch decisions** — multi-item findings are one table with "apply all / override."
- **Artifacts are context** — skills communicate through files on disk, not session state.
- **Minimal ceremony** — use `/flow` for automated, full pipeline for planned work.
