# Skill Reference Card

Quick reference for all claude-tweaks skills. For full details, run `/claude-tweaks:help commands`.

## Lifecycle (run in order)

| Command | What it does | Takes |
|---------|-------------|-------|
| `/claude-tweaks:init` | Bootstrap structure, generate CLAUDE.md, skills, rules | path, URL, update |
| `/claude-tweaks:capture` | Brain-dump idea into INBOX | idea text |
| `/claude-tweaks:challenge` | Debias assumptions before brainstorming | `quick`, INBOX item, topic |
| `/superpowers:brainstorming` | Brainstorm solutions (Superpowers plugin) | topic |
| `/claude-tweaks:specify` | Decompose design doc into agent-sized specs | design doc, topic |
| `/claude-tweaks:build` | Implement a spec or design doc | spec #, doc path + `auto`, `batched`, `worktree` |
| `/claude-tweaks:stories` | Generate or update QA story YAML files (journey-aware) | URL (auto-detected if omitted) + `persona=`, `dir=`, `journey=`, `browser=`, `refine=`, `negative=` |
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
| `/claude-tweaks:flow` | Automated pipeline: build → [stories →] test → review → polish → wrap-up | spec #(s), doc path + `auto` `worktree`/`current-branch` `no-stories` `no-polish` `keep-going` `[step]` (single = resume) |
| `/claude-tweaks:browse` | Unified browser automation (utility) | URL or task + `browser=`, `headless`, `vision` |
| `/claude-tweaks:design` | Wrapper that lets lifecycle skills invoke Impeccable design-quality commands. Modes: `pre-build`, `test`, `review`, `shape`, `polish`, `survey`, `reset-recommendations` | mode + spec/files + flags |
| `/claude-tweaks:ledger` | Open items tracking — query, resolve ledger entries | *(none)*, `resolve`, `{feature-name}` |
| `/claude-tweaks:research` | Deep web research with citation-audited reports — 4 runtime modes from quick to ultradeep. | topic + `quick`, `standard`, `deep`, `ultradeep`, `output=` |
| `/claude-tweaks:version` | Print the installed plugin version | *(none)*, `plain`, `full` |

## Common Workflows

### Feature from scratch
```
/claude-tweaks:capture "users need meal planning"
/claude-tweaks:challenge meal planning
/superpowers:brainstorming
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
INBOX → Brief → Design Doc → Spec → Code → Stories → TEST_PASSED → Review → Polish (frontend) → Done
```

| Skill | Creates | Deletes |
|-------|---------|---------|
| `/claude-tweaks:capture` | INBOX item | — |
| `/claude-tweaks:challenge` | Brief | — |
| `/superpowers:brainstorming` | Design Doc | — |
| `/claude-tweaks:specify` | Spec | Brief, Design Doc |
| `/claude-tweaks:build` | Code (+ Journeys via /journeys) | — |
| `/claude-tweaks:journeys` | Journey files | — |
| `/claude-tweaks:stories` | Story YAML files | — |
| `/claude-tweaks:test` | TEST_PASSED flag | — |
| `/claude-tweaks:review` | Review summary | — |
| `/claude-tweaks:wrap-up` | Learnings (CLAUDE.md) | Spec, plans, ledger |

Consumed artifacts are deleted — specs and code are the durable outputs.

## Bookend Architecture (v4.6+)

In `auto` mode (`/flow … auto` or `auto-mode: default-on` in CLAUDE.md), the pipeline has **two user-facing stops** and everything else is logged automation:

| Stop | Where | What |
|---|---|---|
| **Pipeline Config Manifesto** | `/flow` Step 3 | One table pre-fills every policy lever (scope-creep, overlap, design-intent, leftover-routing, auto-fix-threshold, review-severity-floor, tidy-aggressiveness). Hit "1. Approve all recommendations" or override specific items. |
| **Wrap-Up Review Console** | `/wrap-up` Step 8.6 | One consolidated batch: auto-applied items + pending-review items + skill updates + config changes. Hit "1. Approve all" or override. |

**Mid-flow:** skills look up policy from `.claude-tweaks/pipelines/{run-id}/config.yml` and log every auto-decision to `decisions.md`. Skills MUST NOT invent new mid-flow stops in auto.

**Per-pipeline run directory** (collision-safe across parallel agents):
```
.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/
├── config.yml        ← Manifesto answers
├── decisions.md      ← Auto-decision log (AUTO / STAGED / KEPT-PROMPT)
└── staged/           ← Patches awaiting Review Console
```

**Project policy defaults** live in CLAUDE.md under `## Auto-mode policy` — the Manifesto pre-fills from there so the user can hit "Approve all" with zero overrides on a properly-configured project.

**Doctrine preserved (still per-item user input, even in auto):**
- Ledger resolve gate Phase 2 (open items)
- `specs/INBOX.md` / `specs/DEFERRED.md` writes
- `/challenge` lenses
- `/init` Phase 4 / 8 / 9 governance gates
- All HARD-GATE / BLOCKED / STOP conditions

Reference: `skills/_shared/auto-mode-contract.md` + `skills/_shared/auto-decision-log.md`.

## Token Saver (v4.2+)

claude-tweaks v4.2 ships token-saving infrastructure that runs silently:

- **Bash output filter** — `PostToolUse[Bash]` hook compacts noisy test/build/CI output (>16KB), preserves failure lines, writes raw output to `~/.claude-tweaks/logs/bash-{ts}.log`. The summary returned to Claude includes a `[full output: ...]` path you can `Read` for unfiltered detail.
- **9-segment statusline** — `bin/claude-tweaks-statusline.js` renders `model | ctx% | effort | git | session | weekly | saved | spec | ledger`. Auto-hides empty segments. Semantic ANSI 8-color (red/yellow/green) with `NO_COLOR` respect. Wired up by `/claude-tweaks:init` Step 0.8.
- **Telemetry ledger** — `~/.claude-tweaks/logs/filter.jsonl` accumulates filter events. `cat | jq` for stats; the statusline's `saved:` segment reads from it.
- **Subagent output contract** — `skills/_shared/subagent-output-contract.md` defines Templates A/B/C for parallel-dispatched Task agents. Currently used by `/browse`, `/help`, `/review`, `/tidy`.

To disable colors: `export NO_COLOR=1`. To inspect raw filtered output: `cat ~/.claude-tweaks/logs/bash-{ts}.log` (path appears in the filter footer).

## Key Principles

- **Every finding is routed** — fix now, defer, or capture. Nothing drops silently.
- **Batch decisions** — multi-item findings are one table with "apply all / override."
- **Artifacts are context** — skills communicate through files on disk, not session state.
- **Minimal ceremony** — use `/claude-tweaks:flow` for automated, full pipeline for planned work.
