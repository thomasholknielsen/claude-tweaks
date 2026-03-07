---
name: claude-tweaks:init
description: Use when initializing the workflow system for a project — bootstraps structure, analyzes the codebase, generates CLAUDE.md with adaptive philosophy, skills, and rules. Re-run to find drift, gaps, and stale configuration.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Init — Project Bootstrap + Intelligent Configuration

Bootstrap the workflow system for a project AND generate intelligent configuration from codebase analysis. Handles everything from directory creation to CLAUDE.md generation, skills, rules, and journey discovery — in one command.

```
[ /claude-tweaks:init ] → /claude-tweaks:capture → /claude-tweaks:challenge → /brainstorm → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
  ^^^^ YOU ARE HERE ^^^^
```

This skill works for both greenfield and brownfield projects, operating in two modes:

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Initial** | No `.claude/` directory or CLAUDE.md | Full bootstrap + reconnaissance → generate everything from scratch |
| **Update** | Existing `.claude/` config found | Skip bootstrap (idempotent) + diff-based audit → propose targeted patches |

<HARD-GATE>
Do NOT generate generic skills. Every skill you produce must be grounded in patterns you actually observed in the codebase. If the project doesn't use WebSockets, don't create a realtime skill. If it has no tests, create a testing skill that describes what testing *should* look like for this specific stack — but mark it as aspirational.
</HARD-GATE>

## When to Use

- First time using the workflow system on a project
- After cloning a repo that uses this workflow (to verify dependencies + audit config)
- You've been handed a project you've never worked on before
- You want to audit/refresh an existing Claude Code setup after the codebase has evolved
- When `/claude-tweaks:help` or `/claude-tweaks:build` fails because something is missing
- The user says "set up the workflow," "get me started," "set up Claude Code for this repo," or "update my Claude config"

## Inputs

If `$ARGUMENTS` is provided, treat it as:
- A path to a repository (e.g., `~/projects/their-app`) — `cd` there first
- A GitHub URL — clone it first, then analyze
- A description of the project context (e.g., "Ruby on Rails monolith, team of 5")
- `--update` or `update` — force Update mode even if the config looks minimal
- `bootstrap` — run Phase 0 only (structure + deps), then stop
- `config` — run Phases 0 + 2 + 3 + 5 (bootstrap + recon + CLAUDE.md)
- `skills` — run Phases 0 + 2 + 3 + 4 + 6 (bootstrap + recon + skills)
- `journeys` — run Phases 0 + 8 (bootstrap + journey discovery)
- `docs` — run Phases 0 + 2 + 3 + 8.5 (bootstrap + doc registry)

If no arguments, analyze the current working directory. Phase 0 runs first, then a scope selection gate determines which remaining phases to run (see "Scope Selection Gate" below).

## Phases at a Glance

| Phase | What Happens | Output |
|-------|-------------|--------|
| **0** | Bootstrap structure (dirs, files, deps, git, browser) | Workflow infrastructure ready |
| **1** | Determine mode (Initial vs Update) | Mode decision + existing config inventory |
| **2** | Codebase reconnaissance (8 detection steps) | Raw findings: stack, architecture, conventions, pain points, maturity |
| **3** | Build profile (Initial) or drift report (Update) | Stack Profile or Configuration Health Report |
| **4** | Generate skill manifest | Scored + prioritized skill candidates. Priority 2-3 → INBOX |
| **5** | Generate / update CLAUDE.md | CLAUDE.md (how to work here). Improvement pain points → INBOX |
| **6** | Generate / update skills | SKILL.md files for approved skills. Aspirational skills → INBOX |
| **7** | Generate / update rules (optional) | Path-scoped `.claude/rules/` files |
| **8** | Discover user journeys (optional) | Journey files or skeleton INBOX items |
| **8.5** | Create doc registry | `docs/REGISTRY.md`. Doc work → INBOX |
| **9** | Present summary and confirm | Final confirmation before writing files |

---

## Phase 0: Bootstrap Structure

Fast, idempotent structural setup. Creates directories, starter files, and verifies dependencies. Skips anything that already exists.

### Step 0.1: Check Plugin Dependencies

#### Required: Superpowers

Provides `/brainstorm`, `/write-plan`, `/subagent-driven-development`, `/executing-plans`, `/using-git-worktrees`, `/finishing-a-development-branch`, and `/dispatching-parallel-agents`.

```
Check if installed — use the Glob tool to search for *superpowers* under the user's ~/.claude/plugins/ directory.
```

If missing, install:
```bash
/plugin install superpowers@claude-plugins-official
```

#### Required: Code Simplifier

Provides the `code-simplifier` subagent used by `/claude-tweaks:build` and `/claude-tweaks:review`.

Note: `code-simplifier` is a built-in subagent type (`subagent_type="code-simplifier:code-simplifier"` in the Task tool). No plugin installation needed — just verify it's available by checking the Task tool's agent type list.

### Step 0.2: Create Directory Structure

Check and create the required directories (only create what's missing):

```
specs/              → Spec files and INBOX
docs/               → Documentation root (REGISTRY.md created in Phase 8.5)
docs/plans/         → Design docs (from /brainstorm) and execution plans (from /write-plan)
docs/journeys/      → User and developer journey files (created by /journeys, tested by /visual-review)
.claude/skills/     → Skill files (should already exist if this skill is running)
```

### Step 0.3: Create Starter Files

Create these files **only if missing** — never overwrite existing content:

**`specs/INBOX.md`:**
```markdown
# INBOX

Ideas and features captured for future specification. Use `/claude-tweaks:capture` to add items, `/claude-tweaks:tidy` to review.

<!-- Add new entries at the bottom using /claude-tweaks:capture -->
```

**`specs/DEFERRED.md`:**
```markdown
# Deferred Work

Work deferred from builds and reviews with context for when to pick it up. Items here came from active implementation — they have origin specs, file references, and timing triggers.

Unlike INBOX (raw ideas), deferred items have rich context and specific triggers for when they should be revisited.

<!-- Items are added by /claude-tweaks:build, /claude-tweaks:review, and /claude-tweaks:wrap-up -->
```

**`specs/INDEX.md`:**
```markdown
# Spec Index

Tiered roadmap of work units. Use `/claude-tweaks:specify` to add specs, `/claude-tweaks:help` to see what's ready to build.

## Tier 1 — Critical Path

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |

## Tier 2 — High Value

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |

## Tier 3 — Differentiators

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |
```

### Step 0.4: Suggest .gitignore Entries

Check if `.gitignore` exists and whether it already covers workflow artifacts. Suggest entries for transient files that shouldn't be committed:

```gitignore
# claude-tweaks: transient artifacts
screenshots/
.claude/worktrees/
stories/auth.yml
```

If `stories/` exists or will be created, ask the user:

```
Should story YAML files be committed to version control?
1. Yes — stories are part of the project's test suite (Recommended)
2. No — add stories/ to .gitignore
```

Do not modify `.gitignore` without asking — the user may have opinions about what to track.

### Step 0.5: Verify Git

The workflow system relies on git for change tracking (`/claude-tweaks:review` uses `git diff`, `/claude-tweaks:wrap-up` checks recent commits).

- Check that the current directory is a git repo
- If not, warn the user — the workflow will partially work but `/claude-tweaks:review` and `/claude-tweaks:wrap-up` will be degraded

### Step 0.6: Worktree Configuration

`/claude-tweaks:build worktree` and `/claude-tweaks:flow worktree` use `/using-git-worktrees` to create isolated workspaces. The standard worktree directory is `.claude/worktrees/` in the project root.

1. Check if `.claude/worktrees/` exists in the project root
2. If it doesn't exist, create it and verify it's in `.gitignore` (suggest adding if not)
3. If a legacy worktree directory exists (`.worktrees/` or `worktrees/`), suggest migrating to `.claude/worktrees/` for consistency

### Step 0.7: Browser Integration

Ask the user if they want to set up browser integration. This lets Claude Code interact with web pages — useful for testing UIs, running QA stories, scraping docs, and verifying deployments.

**Detect existing setup first:**

```
# Check for playwright-cli — run and check if it succeeds
playwright-cli --version

# Check for Chrome MCP tools
# Look for mcp__claude_in_chrome__navigate in available tools
```

If either backend is already available, report the status and skip to the next phase.

**If no browser integration detected, offer:**

```
Browser integration lets Claude Code control a web browser for testing, QA story validation, and scraping.

1. Install playwright-cli **(Recommended)** — Headless CLI automation. Parallel sessions, token-efficient.
2. Both (playwright-cli + Chrome MCP) — Headless + observable Chrome with your real profile.
3. Skip — Set up later. Browser features are optional.
```

**Option 1:** `npm install -g @playwright/cli@latest` then verify with `playwright-cli --version`.

**Option 2:** Install playwright-cli (as above), plus set up Chrome MCP (Chrome extension + `claude --chrome`).

**Option 3:** Note that browser features (`/claude-tweaks:browse`, `/claude-tweaks:stories`, `/claude-tweaks:review qa`) require a browser backend, but all other skills function normally.

---

## Scope Selection Gate

After Phase 0 completes, present the scope selection — unless `$ARGUMENTS` already specified a goal-based scope (e.g., `bootstrap`, `config`, `skills`, `journeys`, `docs`), in which case skip this gate and run the corresponding phases.

```
Bootstrap complete. How much setup do you want?

| Phase | What | Include? |
|-------|------|----------|
| 2 | Codebase reconnaissance | Yes |
| 3 | Profile + classification | Yes |
| 4 | Skill manifest | Yes |
| 5 | CLAUDE.md | Yes |
| 6 | Generate skills | Yes |
| 7 | Rules | Yes |
| 8 | Journey discovery | {Yes / Skip — no UI detected} |
| 8.5 | Doc registry | Yes |

1. Auto — run all included phases without stopping **(Recommended)**
2. Interactive — pause for confirmation between phases
3. Essentials — reconnaissance + CLAUDE.md only (phases 2, 3, 5)
4. Done — just needed the bootstrap structure
```

**Option 1 (Auto):** Run all included phases end-to-end. Phase 3 still presents its classification confirmation gate (this is the only mandatory interaction in auto mode — the maturity/doc-tier decision affects all downstream output). Phase 4 still presents the skill selection. Phase 9 still presents the final summary for confirmation. All other phases run without pausing.

**Option 2 (Interactive):** After each phase completes, present its output and ask:
```
Phase {N} complete. Continue to Phase {N+1} ({description})?
1. Continue **(Recommended)**
2. Skip Phase {N+1} — move to {N+2}
3. Done — stop here
```

**Option 3 (Essentials):** Runs phases 2, 3, 5 only. Produces CLAUDE.md with proper philosophy and Don'ts. Defers skills, rules, journeys, and doc registry for later (suggest re-running `/init` or using goal-based arguments).

**Option 4 (Done):** Stop after Phase 0. The user has the directory structure, starter files, and dependencies — they'll configure manually or run `/init` again later.

### Phase dependencies

When a phase is excluded (by interactive skip, essentials mode, or goal-based argument), handle its dependents:

| If skipped | Impact | Handling |
|------------|--------|----------|
| Phase 2 (recon) | Phases 3-8.5 lose their input | Skip all dependent phases — cannot generate config without reconnaissance |
| Phase 3 (profile) | Phases 4, 5, 8.5 lose maturity/tier classification | Skip dependent phases — philosophy and doc tier need classification |
| Phase 4 (manifest) | Phase 6 has no skill list | Skip Phase 6 |
| Phase 5 (CLAUDE.md) | No downstream dependency | Safe to skip |
| Phase 6 (skills) | No downstream dependency | Safe to skip |
| Phase 7 (rules) | No downstream dependency | Safe to skip |
| Phase 8 (journeys) | No downstream dependency | Safe to skip |
| Phase 8.5 (doc registry) | No downstream dependency | Safe to skip |

When skipping a phase due to a missing dependency, note it: "Skipping Phase {N} ({name}) — requires Phase {dep} which was excluded."

---

## Phase 1: Determine Mode

Before any deep analysis, check what already exists:

```
Check:
- CLAUDE.md exists? Read it.
- .claude/skills/ directory? List all skills, read each SKILL.md frontmatter.
- .claude/rules/ directory? List all rules, read each.
- .claude/settings.json? Read it.
```

### If nothing exists → **Initial Mode** (skip to Phase 2)

### If config exists → **Update Mode** (proceed to Phase 1u)

### Phase 1u: Audit Existing Configuration

Build an inventory of what's currently configured before scanning the codebase:

```markdown
## Existing Configuration Inventory

### CLAUDE.md
- Lines: {count}
- Stack table: {lists these technologies}
- Commands: {lists these scripts}
- Conventions: {count} bullets
- Don'ts: {count} items
- Last meaningful edit: {git log for CLAUDE.md — when, what changed}

### Skills ({count})
| Skill | Description trigger | Key file paths referenced |
|-------|-------------------|--------------------------|
| {name} | {from description field} | {paths mentioned in body} |

### Rules ({count})
| Rule | Scoped to | Content summary |
|------|-----------|-----------------|
| {name} | {paths} | {1-line summary} |
```

Then proceed to Phase 2 as normal — but carry this inventory forward. Every Phase 2 finding will be compared against the inventory to classify it as:

- **Covered** — existing config accurately describes this
- **Stale** — existing config references something that has changed or no longer exists
- **Drifted** — existing config describes a pattern but the codebase has moved away from it
- **Gap** — codebase has this pattern but no config covers it

---

## Phase 2: Codebase Reconnaissance

Work through these detection steps systematically. Use parallel tool calls aggressively — all glob/grep operations within a substep are independent and should run concurrently.

### 2a: Project Identity

```
Detect:
- README.md, CONTRIBUTING.md, docs/ — project purpose and domain
- LICENSE — open source vs proprietary
- .github/, .gitlab-ci.yml, Jenkinsfile, .circleci/ — CI/CD platform
- Monorepo vs single app (workspaces config, multiple package.json, apps/, packages/)
- Age — earliest commit date (`git log --reverse --format="%ai" -1`)
- Activity — commits in last 90 days, number of contributors
```

Steps 2b–2g cover stack detection, architecture detection, convention detection, workflow detection, pain point detection, and existing AI configuration detection. For the complete detection tables and checklists, read `detection-tables.md` in this skill's directory.

### 2h: Project Maturity Detection

Assess the project's maturity stage to inform the Philosophy section in CLAUDE.md. This determines the change philosophy — how aggressively to break, rebuild, and modernize vs. preserve, migrate, and maintain.

**Gather signals:**

> **Parallel execution:** Use parallel tool calls aggressively — all detection operations below are independent and should run concurrently.

| Signal | How to detect | Greenfield indicator | Brownfield indicator |
|--------|---------------|---------------------|---------------------|
| **Age** | `git log --reverse --format="%ai" -1` | < 3 months | > 6 months |
| **Migration history** | Glob for migration directories (prisma/migrations, db/migrate, alembic/, etc.) | None found | Multiple migrations |
| **Production infrastructure** | Glob for k8s/, terraform/, .github/workflows/*deploy*, Dockerfile, docker-compose.yml | None found | Production deploy configs |
| **Monitoring/observability** | Grep for Sentry, DataDog, New Relic, Application Insights, OpenTelemetry | None found | Monitoring configured |
| **Contributor count** | `git shortlog -sn --no-merges \| wc -l` | 1-2 contributors | 3+ contributors |
| **API versioning** | Grep for `/v1/`, `/v2/`, `api-version`, version headers | No versioning | Versioned APIs |
| **Published packages** | Check for npm publish config, PyPI setup, gem spec, crate publish | Not published | Published/consumed |
| **User data signals** | Check for user tables with data, analytics, GDPR tooling, data exports | No user data patterns | User data management |
| **Environment count** | Count distinct environment configs (.env.production, .env.staging, etc.) | 0-1 environments | 2+ environments |
| **Schema management** | Check for `db:push` vs migration commands in scripts | Push-based or none | Migration-based |

**Classify the project:**

| Classification | Criteria | Change philosophy |
|---------------|----------|-------------------|
| **Greenfield** | < 3 months old, no migrations, no production infra, 1-2 contributors, no users | Break freely: rename columns, change types, restructure schemas, delete and rebuild |
| **Pre-launch** | Has structure but no production deploy, no user data, no monitoring | Break freely but with growing caution — foundations are solidifying |
| **Early production** | Has production infra and monitoring, but few users, limited migration history | Prefer correct solutions but be mindful of live data — migrations over push |
| **Established** | Multiple environments, migration history, published APIs, monitoring, user data | Expand-contract, safe migrations, backward compatibility, careful deprecation |

Carry the classification forward to Phase 3, where it is presented alongside the doc tier for unified confirmation. Do NOT present the classification for confirmation here — Phase 3 is the single confirmation gate for all project classifications.

---

## Phase 3: Build the Profile / Drift Report + Project Classification

**Initial Mode** produces a Stack Profile (identity, stack table, architecture, conventions, workflows, health indicators, skill candidates) followed by a unified Project Classification confirmation. **Update Mode** produces a Drift Report (covered, stale, drifted, gap classifications). Both require user confirmation before proceeding.

For the complete profile and drift report templates, read `profile-templates.md` in this skill's directory.

### Project Classification (confirmation gate)

After presenting the Stack Profile (or Drift Report), present the unified Project Classification for confirmation. This is the single gate where the user confirms or overrides all downstream decisions about philosophy and doc structure.

**Determine doc tier** using the heuristics from `docs-structure.md` in this skill's directory, combining Phase 2 reconnaissance findings with the detected maturity.

**Present for confirmation:**

```
### Project Classification

Based on codebase analysis:

| Dimension | Detected | Rationale |
|-----------|----------|-----------|
| Maturity | {greenfield/pre-launch/early-production/established} | {key signals: age, infra, users, migrations} |
| Doc tier | {1/2/3} | {key signals: project size, API surfaces, team size} |

### Philosophy (derived from maturity)
- Change philosophy: {e.g., "Move fast, refactor freely" / "Expand-contract, safe migrations"}
- Schema management: {e.g., "Push directly" / "Migrations with rollback plans"}
- Backward compatibility: {e.g., "Not required" / "Required for published interfaces"}
- Dependencies: {e.g., "Latest versions, update aggressively" / "Pin versions, upgrade deliberately"}

### Doc Structure (derived from tier)
- {list of docs that will be proposed in Phase 8.5, based on tier + what exists}

1. Confirm **(Recommended)**
2. Override maturity (changes philosophy)
3. Override doc tier (changes structure)
4. Override both
```

Wait for confirmation. The user may know things the code doesn't reveal (e.g., "this is 6 months old but we haven't launched yet — treat it as pre-launch"). Carry the confirmed maturity and doc tier forward to Phase 5 (CLAUDE.md Philosophy) and Phase 8.5 (Doc Registry).

---

## Phase 4: Generate Skill Manifest

**Initial Mode:** Score and prioritize all skill candidates.

**Update Mode:** Score only the **gaps**. Existing skills that need updating are handled as patches, not new skills.

### Scoring

**Frequency** (how often will this skill be invoked?):
- 3 = Daily/every session (e.g., data-access for a DB-heavy app)
- 2 = Weekly/regular (e.g., migrations, testing patterns)
- 1 = Occasional (e.g., deployment, CI config changes)

**Complexity** (how much project-specific knowledge does the pattern require?):
- 3 = High — many project-specific conventions, easy to get wrong
- 2 = Medium — some project conventions, some general knowledge
- 1 = Low — mostly standard, little project-specific knowledge needed

**Danger** (how bad is it if you get this wrong without a skill?):
- 3 = Data loss, security holes, broken prod (e.g., migrations, auth, deployment)
- 2 = Bugs, test failures, CI breakage (e.g., testing conventions, API patterns)
- 1 = Style issues, minor friction (e.g., naming, import style)

**Priority = Frequency + Complexity + Danger** (max 9). Generate skills scoring 6+ first.

### Skill Categories

Map detected stack to skill categories:

| Detected Pattern | Skill to Generate |
|---|---|
| ORM + migrations | `data-access` — schema patterns, query conventions, migration workflow |
| API layer (REST/GraphQL/tRPC) | `api` — route structure, middleware, error responses, auth patterns |
| Testing framework | `testing` — test structure, mocking patterns, what to test, running tests |
| Web framework | `{framework}` — routing, SSR/CSR patterns, state, data fetching |
| Mobile framework | `mobile` — navigation, platform-specific, offline patterns |
| CI/CD pipeline | `ci-cd` — pipeline structure, when to modify, environment promotion |
| Infrastructure as Code | `infrastructure` — resource patterns, module structure, env separation |
| Auth system | `security` — auth flow, session handling, RBAC/ABAC, token patterns |
| Styling system | `ui` — component patterns, theme, design tokens |
| State management | `state` — what goes where, cache vs UI state, sync patterns |
| Queue/messaging | `async-processing` — message patterns, idempotency, retry |
| Error handling (custom) | `error-handling` — error class hierarchy, when to use which |
| Logging (structured) | `logging` — log levels, structured fields, what to log |
| Monorepo tooling | `monorepo` — workspace commands, dependency management, build order |
| Feature flags | `feature-flags` — flag lifecycle, naming, rollout patterns |
| Search | `search` — indexing, query building, relevance tuning |
| Forms + validation | `forms` — form patterns, validation schemas, error display |
| i18n | `i18n` — translation workflow, key naming, locale handling |
| Payments | `payments` — checkout flow, webhook handling, subscription lifecycle |
| Email | `email` — template patterns, transactional vs marketing, delivery |

Only generate skills for patterns that **actually exist** in the codebase. Mark aspirational skills (e.g., testing for a project with no tests) as `[aspirational]`.

### Present the Manifest

```markdown
## Skill Manifest

### Priority 1 (score 6+) — Generate now
| Skill | Freq | Cmplx | Danger | Score | Rationale |
|-------|------|-------|--------|-------|-----------|
| data-access | 3 | 3 | 3 | 9 | Heavy DB usage, complex query patterns, migration risk |
| ... | ... | ... | ... | ... | ... |

### Priority 2 (score 4-5) — Generate if time permits
| ... |

### Priority 3 (score 2-3) — Defer
| ... |

### Not needed
- {technology} — too standard, no project-specific patterns to encode

### Meta-skills to consider
- `/claude-tweaks:wrap-up` — captures learnings after completing features (keeps skills alive)
- `/claude-tweaks:review` — validates implementation quality against project conventions
```

Present as numbered options:

```
Which skills should I generate?
1. All Priority 1 skills **(Recommended)**
2. All Priority 1 + Priority 2
3. Let me pick specific ones (list the numbers)
4. None for now — I'll generate them later
```

### Deferred Skills → INBOX

Skills not selected for generation (Priority 2-3, or aspirational skills marked `[aspirational]`) are captured as INBOX items with their scoring rationale and Phase 2 evidence:

```markdown
### Create data-access skill (Priority 2, score 5)
Freq: 2, Complexity: 2, Danger: 1.
Detected: Prisma ORM with 12 models, query patterns in `src/lib/db/`,
custom transaction wrapper in `src/lib/db/transaction.ts`.
Convention: repository pattern with co-located queries.
```

```markdown
### Create testing skill [aspirational]
No tests exist yet. Framework detected: Vitest (in devDependencies, unused).
Test config: `vitest.config.ts` exists but `src/**/*.test.*` returns 0 files.
When tests are added, this skill should encode: {patterns from similar stacks}.
```

This ensures no reconnaissance is wasted — the Phase 2 context is preserved for when the user is ready to create these skills.

---

## Phase 5: Generate / Update CLAUDE.md

CLAUDE.md describes **how to work in this codebase** — the patterns to follow, the commands to run, the conventions to respect, and the mistakes to avoid. Every entry should help someone working in the codebase right now. Things that don't exist yet belong in INBOX, not here.

**Initial Mode** generates CLAUDE.md from scratch with sections for Stack, Structure, Commands, Conventions, Philosophy, Testing, Environment, Git, and Don'ts. **Update Mode** produces targeted patches, not rewrites. The Philosophy section adapts to detected project maturity. The Don'ts section is the highest-ROI output — mine it from convention conflicts and observed anti-patterns (not from missing infrastructure).

For the complete CLAUDE.md template, patch format, Philosophy generation guide, Don'ts mining guide, and principles, read `claude-md-template.md` in this skill's directory.

### Pain Point Routing

Phase 2f findings split into two destinations based on their category (see `detection-tables.md`):

- **Convention conflicts and anti-patterns** → CLAUDE.md Don'ts (guardrails for existing patterns)
- **Missing infrastructure, practices, stale deps, dead code** → INBOX items with Phase 2 context baked in

INBOX items for improvement work follow the same format as doc work items from Phase 8.5:

```markdown
### Set up CI pipeline
Project deploys to {target} using {framework} but has no CI.
Scripts available: `lint` ({tool}), `test` ({framework}), `build`, `typecheck`.
Suggested pipeline: lint → typecheck → test → build.
```

```markdown
### Add test coverage for src/utils/
{N} utility functions with no test coverage. Complex functions: {list with line counts}.
Testing framework: {framework}. Test location convention: {co-located / separate dir}.
```

```markdown
### Upgrade {dependency} (v{current} → v{latest})
{N} major versions behind. Key breaking changes: {list}.
Files importing this dep: {count} across {dirs}.
```

Present a summary of routed pain points after CLAUDE.md generation:

```
### Pain Points Routed

**→ CLAUDE.md Don'ts ({N}):** {list of convention conflicts / anti-patterns added}
**→ INBOX ({N}):** {list of improvement items captured}
```

---

## Phase 6: Generate / Update Skills

**Initial Mode** generates full SKILL.md files for each approved skill. **Update Mode** produces targeted patches for drifted skills and full SKILL.md for gap skills. Each generated skill must pass quality gates (codebase-grounded examples, working commands, project-specific anti-patterns). Skill depth scales with complexity score.

Only generate skills for patterns that **actually exist and are actively used** in the codebase. Aspirational skills (e.g., testing for a project with no tests) should have been captured as INBOX items in Phase 4 — do not generate SKILL.md files for them.

For the complete SKILL.md template, update patch format, quality gates checklist, and depth guide, read `skill-template.md` in this skill's directory.

---

## Phase 7: Generate / Update Rules (optional)

If certain conventions are path-scoped (e.g., "all files in `src/api/` must use the error handler"), generate `.claude/rules/` files:

```markdown
---
paths:
  - src/api/**
---

{Rule content — concise, imperative}
```

Only create rules for conventions that are **path-specific**. Project-wide conventions belong in CLAUDE.md.

**Common rule candidates:**
- API routes with specific middleware/auth requirements
- Test directories with specific mocking conventions
- Migration directories with specific naming/ordering rules
- Component directories with specific prop/style patterns
- Generated code directories that should not be manually edited

**Update Mode:** Check existing rules for stale `paths` globs (directories renamed or restructured). Patch or delete as needed.

---

## Phase 8: Discover User Journeys (Optional)

If the project has a user-facing application (web app, CLI tool, API with documentation), offer to discover and document user journeys. This is especially valuable for brownfield projects that have features but no documented journeys.

**When to offer:**
- The codebase has routes, pages, views, or CLI commands (detected during Phase 2 reconnaissance)
- `docs/journeys/` is empty or doesn't exist
- The project is not a pure library with no user-facing surface

**When to skip:**
- The project is a library or framework with no user-facing application
- Journeys already exist and appear comprehensive
- The user explicitly skips this phase

### Present the option:

```
This project has user-facing features but no documented user journeys.
User journeys help /review test the app against experiential expectations.

Would you like to discover and document journeys?
1. Yes — scan codebase for routes and user flows, create journey files **(Recommended)**
2. Yes, with browser — scan codebase AND walk the app in a browser for richer "should feel" details
3. Skip — I'll add journeys later
```

### Option 1: Codebase-only discovery

Use the codebase scan from Phase 2 to identify journey candidates. This produces journey skeletons — the structure and steps are defined but "should feel" and "red flags" are inferred from code rather than experienced in the browser.

**Steps:**

1. **Identify routes and pages** from Phase 2 findings (route files, page components, views, navigation structure)
2. **Infer personas** from user roles, auth flows, public vs. authenticated pages, developer-facing features
3. **Map journeys** — group routes into goal-oriented sequences (signup flow, content creation flow, admin workflow, developer setup)
4. **Write skeleton journey files** to `docs/journeys/` using the standard format
5. **Mark as skeleton** — add `**Status:** Skeleton — inferred from code, not yet browser-tested` to each journey file

Skeleton journeys are useful immediately — they document the intended flows. But the "should feel" fields will be weaker since they're inferred, not experienced. Running `/review journey:{name}` later fills in the experiential details and removes the skeleton status.

**Capture enrichment as INBOX items** for each skeleton journey:

```markdown
### Browser-test journey: {name}
Skeleton journey inferred from code — "should feel" and "red flags" need browser validation.
Routes covered: {list}. Persona: {persona}. Dev URL: {if known}.
Run `/review journey:{name}` to enrich with experiential details.
```

### Option 2: Hybrid discovery (codebase + browser)

This delegates to `/visual-review discover` — which runs the full 6-phase discovery process (codebase scan → journey candidates → browser walkthrough → write files → coverage report → handoff).

Tell the user:
```
This will scan the codebase for routes and user flows, then open a browser to walk each journey.
The app needs to be running. What's the dev server URL?
```

Then invoke `/claude-tweaks:visual-review discover`.

### Option 3: Skip

Note that the user skipped journey discovery. Suggest running `/visual-review discover` later when they're ready.

---

## Phase 8.5: Create Doc Registry

Create the documentation registry that maps project docs to the code areas they cover. This registry is consumed by `/build` (Step 6.5) to auto-update docs when relevant code changes, and by `/wrap-up` (Step 6) for final sweep and registry maintenance.

**Use the confirmed doc tier** from Phase 3 — do not re-detect.

For the complete registry format, tier definitions, standard folder taxonomy, common Auto-detect patterns, and creation procedure, read `docs-structure.md` in this skill's directory.

**Quick summary of the procedure:**

1. Inventory existing doc files (excluding workflow artifacts)
2. Map Auto-detect patterns using the project's actual directory structure
3. Quick-assess existing docs against Phase 2 findings — classify each as accurate, stale, thin, or misplaced
4. Identify missing docs based on confirmed tier
5. Present batch table — register existing docs as-is (init does not modify them)
6. Create `docs/REGISTRY.md` with approved entries
7. Capture doc work as INBOX items — stale, thin, misplaced, and missing docs become INBOX entries with Phase 2 context baked in, ready for the normal pipeline

**Update Mode:** Diff existing registry against current codebase. Flag stale entries (deleted docs), gap entries (new docs not in registry), pattern drift (renamed directories), and tier drift (project outgrew its tier).

---

## Phase 9: Present Summary and Confirm

Present a consolidated summary of all work done across Phase 0 (bootstrap) and Phases 1-8 (configuration). Wait for user confirmation before writing generated files.

For the complete summary templates for both modes, read `summary-templates.md` in this skill's directory.

Execute only after user confirmation.

---

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Modifying existing INBOX.md or INDEX.md content | Phase 0 is additive — it creates missing files but must not overwrite user content |
| Skipping CLAUDE.md generation | Without CLAUDE.md, /claude-tweaks:review can't find verification commands |
| Running init in a non-git directory without warning | /claude-tweaks:review and /claude-tweaks:wrap-up depend on git — the user should know about degraded behavior |
| Installing browser tools without asking | Browser integration is optional — always let the user choose whether and how to set it up |
| Forcing a restart mid-init for Chrome MCP | Note that a restart is needed but finish the remaining phases first |
| Generating generic skills not grounded in the codebase | Skills must encode observed patterns — generic advice adds noise, not value |
| Rewriting CLAUDE.md in Update Mode | Update Mode produces patches, not rewrites — existing config embeds hard-won lessons |
| Over-generating skills (15 mediocre > 5 excellent) | Each skill must earn its existence by encoding knowledge that would otherwise be lost |
| Skipping team input | Code archaeology alone misses social conventions — PR process, deploy cadence, naming debates |
| Aspirational Don'ts for things that don't exist | Don'ts are guardrails for existing patterns, not wishes for missing infrastructure. "No CI" is an INBOX item, not a Don't. |
| Putting improvement ideas in CLAUDE.md | CLAUDE.md describes how to work in the codebase as it is — improvement opportunities belong in INBOX with Phase 2 context |
| Generating skills for patterns that don't exist yet | Aspirational skills (testing for a project with no tests) become INBOX items with Phase 2 evidence, not SKILL.md files |
| Hardcoding greenfield philosophy for all projects | The Philosophy section must adapt to detected project maturity — what's correct for a greenfield project is dangerous for an established one |
| Creating doc files with only TODO placeholders | Phase 2 reconnaissance has the data — generate real content grounded in actual findings. If a doc would be < 20 lines of real content, it belongs in README instead of its own file. |
| Skipping journey discovery for projects with user-facing features | Journeys are what `/review` tests against — without them, visual QA has no experiential anchor |
| Writing journey "should feel" without actually using the app | Codebase-only skeletons are a starting point but the "should feel" is weaker — mark them as skeletons |

## Important Notes

- **This skill is idempotent** — safe to re-run. Phase 0 only creates what's missing. Phases 1-8 detect whether to generate fresh or patch existing config.
- **One session is not enough** — the initial skill set will be ~70% right. Expect to refine skills after the first week of actual use. Tell the user this explicitly.
- **Re-run periodically** — run in Update Mode after major refactors, stack upgrades, or when skills start feeling stale. A quarterly cadence works for active projects.
- **Skills are living documents** — they should evolve as the team's understanding of the project deepens. Use `/claude-tweaks:wrap-up` after completing features to review and update skills.
- **Don't over-generate** — 5 excellent skills beat 15 mediocre ones. Each skill should earn its existence by encoding knowledge that would otherwise be lost or forgotten.
- **Existing docs are gold** — README, CONTRIBUTING, ADRs, wiki pages, onboarding docs — mine these for conventions the code alone doesn't reveal.
- **Ask the team** — if the user can answer questions about team preferences (PR process, deployment flow, naming debates), incorporate those answers. Code archaeology alone misses social conventions.
- **CLAUDE.md describes how to work here, not what's missing** — every entry should help someone working in the codebase right now. Improvement opportunities go to INBOX with Phase 2 context, so they flow through the normal pipeline.
- **The Don'ts section is the highest-ROI output** — a well-crafted Don'ts list prevents more mistakes than any amount of positive guidance. But Don'ts are guardrails for existing patterns — never aspirational entries for things that don't exist yet.
- **The Philosophy section is the second-highest-ROI output** — it calibrates how aggressively Claude approaches changes, schema management, and backward compatibility.
- **Preserve what works** — in Update Mode, bias toward patching over rewriting. Existing config often embeds hard-won lessons that aren't visible in the code.
- **Depth over breadth** — a deep skill for the project's most complex domain (usually data access or the API layer) is worth more than shallow skills for 10 domains.
- **Update Mode should be fast** — the value is in catching drift quickly. If the audit finds <3 issues, present them inline instead of going through the full phase ceremony.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | First skill to use after /claude-tweaks:init — add ideas to the INBOX |
| `/claude-tweaks:help` | Shows workflow status — useful to verify /claude-tweaks:init worked. Surfaces doc staleness signals from the registry. |
| `/claude-tweaks:review` | /review lens 3i uses the doc registry to check documentation freshness. |
| `/claude-tweaks:visual-review` | Phase 8 (hybrid mode) delegates to `/visual-review discover` for browser-assisted journey discovery. |
| `/claude-tweaks:build` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync |
| `/claude-tweaks:wrap-up` | Captures learnings after features — keeps generated skills alive and accurate. Step 7 references `skill-template.md` from /claude-tweaks:init's directory. /wrap-up Step 6 maintains the doc registry created by /init. |
| `/claude-tweaks:tidy` | /tidy Step 4.6 audits doc registry health — flags stale entries, gaps, pattern drift. Suggests `/init update` for tier drift. |
| `/claude-tweaks:browse` | Depends on the browser backends that /claude-tweaks:init configures in Phase 0 |
| `/using-git-worktrees` | /claude-tweaks:init optionally configures the worktree directory that `using-git-worktrees` needs |
| All workflow skills | Depend on the structure /claude-tweaks:init creates |
