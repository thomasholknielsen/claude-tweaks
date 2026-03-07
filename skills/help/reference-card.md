# Skill Reference Card

Quick reference for all claude-tweaks skills. For full details, run `/claude-tweaks:help commands`.

## Lifecycle (run in order)

| Command | What it does | Takes |
|---------|-------------|-------|
| `/claude-tweaks:init` | Bootstrap structure, generate CLAUDE.md, skills, rules | path, URL, update |
| `/claude-tweaks:capture` | Brain-dump idea into INBOX | idea text |
| `/claude-tweaks:challenge` | Debias assumptions before brainstorming | `quick`, INBOX item, topic |
| `/superpowers:brainstorm` | Brainstorm solutions (Superpowers plugin) | topic |
| `/claude-tweaks:specify` | Decompose design doc into agent-sized specs | design doc, topic |
| `/claude-tweaks:build` | Implement a spec or design doc | spec #, doc path + `auto`, `batched`, `worktree` |
| `/claude-tweaks:stories` | Generate or update QA story YAML files (journey-aware) | URL (auto-detected if omitted) + `persona=`, `dir=`, `focus=`, `journey=`, `browser=`, `refine=`, `negative=` |
| `/claude-tweaks:test` | Verification gate — types, lint, tests, QA stories | `types`, `lint`, `unit`, path, `affected`, `qa`, `qa journey={name}`, `qa affected`, `all` |
| `/claude-tweaks:review` | Analytical quality gate: code review, UX analysis (when QA data available), visual + creative ideas (default in `/claude-tweaks:flow`). Gates on `/claude-tweaks:test`. | spec #, files + `full`/`visual`/`journey:{name}`/`discover` |
| `/claude-tweaks:wrap-up` | Reflect, capture learnings, clean up | spec # |

## Component (standalone or called by lifecycle skills)

| Command | What it does | Takes |
|---------|-------------|-------|
| `/claude-tweaks:reflect` | Structured evaluation: hindsight, surprises, near-misses | `hindsight`/`full`, spec #, file paths |
| `/claude-tweaks:simplify` | Code simplification via code-simplifier subagent | file paths or auto from git diff |
| `/claude-tweaks:journeys` | Create/update user journey documentation | spec #, file paths |
| `/claude-tweaks:visual-review` | Browser-based UI inspection, journey walks, discovery | URL, `journey:{name}`, `discover` |

## Utility

| Command | What it does | Takes |
|---------|-------------|-------|
| `/claude-tweaks:help` | Dashboard: commands + status + recommendations | `status`, `commands`, spec/topic |
| `/claude-tweaks:tidy` | Batch backlog hygiene | — |
| `/claude-tweaks:flow` | Automated pipeline: build → [stories →] test → review → wrap-up | spec #(s), doc path + `auto` `worktree` `no-stories` `[step]` (single = resume) |
| `/claude-tweaks:browse` | Unified browser automation (utility) | URL or task + `browser=`, `headless`, `vision` |
| `/claude-tweaks:ledger` | Open items tracking — query, resolve ledger entries | *(none)*, `resolve`, `{feature-name}` |

## Common Workflows

### Feature from scratch
```
/claude-tweaks:capture "users need meal planning"
/claude-tweaks:challenge meal planning
/superpowers:brainstorm
/claude-tweaks:specify meal planning
/claude-tweaks:build 73
/claude-tweaks:review 73
/claude-tweaks:wrap-up 73
```

### Fast pipeline (spec ready)
```
/claude-tweaks:flow 42
/claude-tweaks:flow 42 review              → resume from review onward
```

### Visual QA after build
```
/claude-tweaks:review 42 full
```
or standalone:
```
/claude-tweaks:visual-review journey:checkout-flow
```

### Verify before commit
```
/claude-tweaks:test
```

### Parallel specs (separate terminals with worktree)
```
# Terminal 1                                # Terminal 2                                # Terminal 3
/claude-tweaks:flow 42 worktree             /claude-tweaks:flow 45 worktree             /claude-tweaks:flow 48 worktree
```

### Sequential multi-spec
```
/claude-tweaks:flow 42,45,48
```

### QA pipeline (automatic in /claude-tweaks:flow)
```
/claude-tweaks:flow 42                                → stories auto-generated if UI changed (journey-aware), validated in test step
/claude-tweaks:stories                                → auto-detects dev server, ingests journeys, generates stories
/claude-tweaks:stories journey=checkout               → generate/update stories scoped to the checkout journey
/claude-tweaks:test qa                                → validate stories standalone
/claude-tweaks:test qa journey=profile-settings       → validate only stories for the profile-settings journey
/claude-tweaks:test all                               → full suite + QA stories
```

### Brownfield onboarding
```
/claude-tweaks:init
/claude-tweaks:visual-review discover
```

## Artifact Lifecycle

```
INBOX → Brief → Design Doc → Spec → Code → Stories → TEST_PASSED → Review → Done
```

| Skill | Creates | Deletes |
|-------|---------|---------|
| `/claude-tweaks:capture` | INBOX item | — |
| `/claude-tweaks:challenge` | Brief | — |
| `/superpowers:brainstorm` | Design Doc | — |
| `/claude-tweaks:specify` | Spec | Brief, Design Doc |
| `/claude-tweaks:build` | Code (+ Journeys via /journeys) | — |
| `/claude-tweaks:journeys` | Journey files | — |
| `/claude-tweaks:stories` | Story YAML files | — |
| `/claude-tweaks:test` | TEST_PASSED flag | — |
| `/claude-tweaks:review` | Review summary | — |
| `/claude-tweaks:wrap-up` | Learnings (CLAUDE.md) | Spec, plans, ledger |

Consumed artifacts are deleted — specs and code are the durable outputs.

## Key Principles

- **Every finding is routed** — fix now, defer, or capture. Nothing drops silently.
- **Batch decisions** — multi-item findings are one table with "apply all / override."
- **Artifacts are context** — skills communicate through files on disk, not session state.
- **Minimal ceremony** — use `/claude-tweaks:flow` for automated, full pipeline for planned work.
