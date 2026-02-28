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
| `/test` | Verification gate — types, lint, tests, QA stories | `types`, `lint`, `unit`, path, `affected`, `qa`, `qa journey={name}`, `qa affected`, `all` |
| `/stories` | Generate or update QA story YAML files (journey-aware) | URL (auto-detected if omitted) + `persona=`, `dir=`, `focus=`, `journey=`, `browser=`, `refine=`, `negative=` |
| `/review` | Analytical quality gate: code review, UX analysis (when QA data available), visual + creative ideas (default in /flow). Gates on /test. | spec #, files + `full`/`visual`/`journey:{name}`/`discover` |
| `/wrap-up` | Reflect, capture learnings, clean up | spec # |

## Utility

| Command | What it does | Takes |
|---------|-------------|-------|
| `/help` | Dashboard: commands + status + recommendations | `status`, `commands`, spec/topic |
| `/tidy` | Batch backlog hygiene | — |
| `/flow` | Automated pipeline: build → [stories →] test → review → wrap-up | spec #(s), doc path + `worktree` `no-stories` `[steps]` |
| `/browse` | Unified browser automation (utility) | URL or task + `browser=`, `headless`, `vision` |

## Common Workflows

### Feature from scratch
```
/capture "users need meal planning"
/challenge meal planning
/brainstorm
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

### QA pipeline (automatic in /flow)
```
/flow 42                                → stories auto-generated if UI changed (journey-aware), validated in /test step
/stories                                → auto-detects dev server, ingests journeys, generates stories
/stories journey=checkout               → generate/update stories scoped to the checkout journey
/test qa                                → validate stories standalone
/test qa journey=profile-settings       → validate only stories for the profile-settings journey
/test all                               → full suite + QA stories
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
