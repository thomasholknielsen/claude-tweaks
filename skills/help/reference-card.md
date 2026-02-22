# Skill Reference Card

Quick reference for all claude-tweaks skills. For full details, run `/claude-tweaks:help commands`.

## Lifecycle (run in order)

| Command | What it does | Takes |
|---------|-------------|-------|
| `/setup` | Bootstrap directories and dependencies | — |
| `/codebase-onboarding` | Generate CLAUDE.md, skills, rules | path, URL, `update` |
| `/capture` | Brain-dump idea into INBOX | idea text |
| `/challenge` | Debias assumptions before brainstorming | INBOX item, topic |
| `/specify` | Decompose design doc into agent-sized specs | design doc, topic |
| `/build` | Implement a spec or design doc | spec #, doc path + `autonomous`/`guided`/`branched` |
| `/test` | Run verification checks standalone | `types`, `lint`, `unit`, path, `affected` |
| `/review` | Quality gate: code + optional visual review | spec #, files + `full`/`visual`/`journey:{name}`/`discover` |
| `/hotfix` | Emergency fast path: fix, test, ship | issue description, error, file path |
| `/wrap-up` | Reflect, capture learnings, clean up | spec # |

## Utility

| Command | What it does | Takes |
|---------|-------------|-------|
| `/help` | Dashboard: commands + status + recommendations | `status`, `commands`, spec/topic |
| `/tidy` | Batch backlog hygiene | — |
| `/flow` | Automated pipeline: build → review → wrap-up | spec #(s), doc path + `[steps]` |

## Common Workflows

### Quick fix (no spec)
```
/hotfix "login returns 500 error"
```

### Feature from scratch
```
/capture "users need meal planning"
/challenge meal planning
brainstorming
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

### Parallel specs
```
/flow 42,45,48
```

### Brownfield onboarding
```
/setup
/codebase-onboarding
/review discover
```

## Artifact Lifecycle

```
INBOX → Brief → Design Doc → Spec → Code + Journey → Review → Learnings → Clean Slate
```

Each arrow means "consumed by the next skill." Consumed artifacts are deleted — specs and code are the durable outputs.

## Key Principles

- **Every finding is routed** — fix now, defer, or capture. Nothing drops silently.
- **Batch decisions** — multi-item findings are one table with "apply all / override."
- **Artifacts are context** — skills communicate through files on disk, not session state.
- **Minimal ceremony** — use `/hotfix` for urgent, `/flow` for automated, full pipeline for planned work.
