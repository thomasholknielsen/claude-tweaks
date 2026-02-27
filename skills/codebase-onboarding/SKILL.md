---
name: claude-tweaks:codebase-onboarding
description: Use when setting up Claude Code for a new or existing project — generates skills, CLAUDE.md, and rules. Re-run to find drift, gaps, and stale configuration.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Codebase Onboarding — Intelligent Skill Generation

## Overview

You are analyzing a codebase to produce (or update) a complete Claude Code configuration: a CLAUDE.md file, targeted rules, and a prioritized set of skills that encode the project's actual patterns — not generic best practices.

This skill works for both greenfield and brownfield projects, operating in two modes:

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Initial** | No `.claude/` directory or CLAUDE.md | Full reconnaissance → generate everything from scratch (greenfield or existing project without Claude Code) |
| **Update** | Existing `.claude/` config found | Diff-based audit → propose targeted patches |

<HARD-GATE>
Do NOT generate generic skills. Every skill you produce must be grounded in patterns you actually observed in the codebase. If the project doesn't use WebSockets, don't create a realtime skill. If it has no tests, create a testing skill that describes what testing *should* look like for this specific stack — but mark it as aspirational.
</HARD-GATE>

## Phases at a Glance

| Phase | What Happens | Output |
|-------|-------------|--------|
| **0** | Determine mode (Initial vs Update) | Mode decision + existing config inventory |
| **1** | Codebase reconnaissance (7 detection steps) | Raw findings: stack, architecture, conventions, pain points |
| **2** | Build profile (Initial) or diff report (Update) | Stack Profile or Configuration Health Report |
| **3** | Generate skill manifest | Scored + prioritized skill candidates |
| **4** | Generate / update CLAUDE.md | CLAUDE.md with Stack, Commands, Conventions, Don'ts |
| **5** | Generate / update skills | SKILL.md files for each approved skill |
| **6** | Generate / update rules (optional) | Path-scoped `.claude/rules/` files |
| **7** | Discover user journeys (optional) | Journey files in `docs/journeys/` for existing user flows |
| **8** | Present summary and confirm | Final confirmation before writing files |

## When to Use

- You've been handed a project you've never worked on before
- The project has no `.claude/` directory or CLAUDE.md
- You're onboarding to a team's existing codebase
- You want to audit/refresh an existing Claude Code setup after the codebase has evolved
- The user says "set up Claude Code for this repo" or "update my Claude config"
- The user invokes `/claude-tweaks:codebase-onboarding`

## Inputs

If `$ARGUMENTS` is provided, treat it as:
- A path to a repository (e.g., `~/projects/their-app`) — `cd` there first
- A GitHub URL — clone it first, then analyze
- A description of the project context (e.g., "Ruby on Rails monolith, team of 5")
- `--update` or `update` — force Update mode even if the config looks minimal

If no arguments, analyze the current working directory.

---

## Phase 0: Determine Mode

Before any deep analysis, check what already exists:

```
Check:
- CLAUDE.md exists? Read it.
- .claude/skills/ directory? List all skills, read each SKILL.md frontmatter.
- .claude/rules/ directory? List all rules, read each.
- .claude/settings.json? Read it.
```

### If nothing exists → **Initial Mode** (skip to Phase 1)

### If config exists → **Update Mode** (proceed to Phase 0u)

### Phase 0u: Audit Existing Configuration

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

Then proceed to Phase 1 as normal — but carry this inventory forward. Every Phase 1 finding will be compared against the inventory to classify it as:

- **Covered** — existing config accurately describes this
- **Stale** — existing config references something that has changed or no longer exists
- **Drifted** — existing config describes a pattern but the codebase has moved away from it
- **Gap** — codebase has this pattern but no config covers it

---

## Phase 1: Codebase Reconnaissance

Work through these detection steps systematically. Use parallel tool calls aggressively — all glob/grep operations within a substep are independent and should run concurrently.

### 1a: Project Identity

```
Detect:
- README.md, CONTRIBUTING.md, docs/ — project purpose and domain
- LICENSE — open source vs proprietary
- .github/, .gitlab-ci.yml, Jenkinsfile, .circleci/ — CI/CD platform
- Monorepo vs single app (workspaces config, multiple package.json, apps/, packages/)
- Age — earliest commit date (`git log --reverse --format="%ai" -1`)
- Activity — commits in last 90 days, number of contributors
```

Steps 1b–1g cover stack detection, architecture detection, convention detection, workflow detection, pain point detection, and existing AI configuration detection. For the complete detection tables and checklists, read `detection-tables.md` in this skill's directory.

---

## Phase 2: Build the Profile / Diff Report

**Initial Mode** produces a Stack Profile (identity, stack table, architecture, conventions, workflows, health indicators, skill candidates). **Update Mode** produces a Drift Report (covered, stale, drifted, gap classifications). Both require user confirmation before proceeding.

For the complete profile and drift report templates, read `profile-templates.md` in this skill's directory.

---

## Phase 3: Generate Skill Manifest

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

---

## Phase 4: Generate / Update CLAUDE.md

**Initial Mode** generates CLAUDE.md from scratch with sections for Stack, Structure, Commands, Conventions, Testing, Environment, Git, and Don'ts. **Update Mode** produces targeted patches, not rewrites. The Don'ts section is the highest-ROI output — mine it from inconsistencies, pain points, and convention violations.

For the complete CLAUDE.md template, patch format, Don'ts mining guide, and principles, read `claude-md-template.md` in this skill's directory.

---

## Phase 5: Generate / Update Skills

**Initial Mode** generates full SKILL.md files for each approved skill. **Update Mode** produces targeted patches for drifted skills and full SKILL.md for gap skills. Each generated skill must pass quality gates (codebase-grounded examples, working commands, project-specific anti-patterns). Skill depth scales with complexity score.

For the complete SKILL.md template, update patch format, quality gates checklist, and depth guide, read `skill-template.md` in this skill's directory.

---

## Phase 6: Generate / Update Rules (optional)

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

## Phase 7: Discover User Journeys (Optional)

If the project has a user-facing application (web app, CLI tool, API with documentation), offer to discover and document user journeys. This is especially valuable for brownfield projects that have features but no documented journeys.

**When to offer:**
- The codebase has routes, pages, views, or CLI commands (detected during Phase 1 reconnaissance)
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

Use the codebase scan from Phase 1 to identify journey candidates. This produces journey skeletons — the structure and steps are defined but "should feel" and "red flags" are inferred from code rather than experienced in the browser.

**Steps:**

1. **Identify routes and pages** from Phase 1 findings (route files, page components, views, navigation structure)
2. **Infer personas** from user roles, auth flows, public vs. authenticated pages, developer-facing features
3. **Map journeys** — group routes into goal-oriented sequences (signup flow, content creation flow, admin workflow, developer setup)
4. **Write skeleton journey files** to `docs/journeys/` using the standard format
5. **Mark as skeleton** — add `**Status:** Skeleton — inferred from code, not yet browser-tested` to each journey file

Skeleton journeys are useful immediately — they document the intended flows. But the "should feel" fields will be weaker since they're inferred, not experienced. Running `/review journey:{name}` later fills in the experiential details and removes the skeleton status.

### Option 2: Hybrid discovery (codebase + browser)

This delegates to `/review discover` — which runs the full 6-phase discovery process (codebase scan → journey candidates → browser walkthrough → write files → coverage report → handoff).

Tell the user:
```
This will scan the codebase for routes and user flows, then open a browser to walk each journey.
The app needs to be running. What's the dev server URL?
```

Then invoke `/claude-tweaks:review discover`.

### Option 3: Skip

Note that the user skipped journey discovery. Suggest running `/review discover` later when they're ready.

---

## Phase 8: Present Summary and Confirm

Present a summary of all generated/updated configuration (CLAUDE.md, skills, rules, journeys) and wait for user confirmation before writing files. **Initial Mode** includes a refinement roadmap. **Update Mode** highlights what changed and what to consider removing.

For the complete summary templates for both modes, read `summary-templates.md` in this skill's directory.

Execute only after user confirmation.

---

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Generating generic skills not grounded in the codebase | Skills must encode observed patterns — generic advice adds noise, not value |
| Rewriting CLAUDE.md in Update Mode | Update Mode produces patches, not rewrites — existing config embeds hard-won lessons |
| Over-generating skills (15 mediocre > 5 excellent) | Each skill must earn its existence by encoding knowledge that would otherwise be lost |
| Skipping team input | Code archaeology alone misses social conventions — PR process, deploy cadence, naming debates |
| Aspirational Don'ts that don't match real pain points | Don'ts should come from observed inconsistencies and pain points, not textbook warnings |
| Skipping journey discovery for projects with user-facing features | Journeys are what `/review` tests against — without them, visual QA has no experiential anchor |
| Writing journey "should feel" without actually using the app | Codebase-only skeletons are a starting point but the "should feel" is weaker — mark them as skeletons |

## Important Notes

- **One session is not enough** — the initial skill set will be ~70% right. Expect to refine skills after the first week of actual use. Tell the user this explicitly.
- **Re-run periodically** — run this skill in Update Mode after major refactors, stack upgrades, or when skills start feeling stale. A quarterly cadence works for active projects.
- **Skills are living documents** — they should evolve as the team's understanding of the project deepens. Use `/claude-tweaks:wrap-up` after completing features to review and update skills.
- **Don't over-generate** — 5 excellent skills beat 15 mediocre ones. Each skill should earn its existence by encoding knowledge that would otherwise be lost or forgotten.
- **Existing docs are gold** — README, CONTRIBUTING, ADRs, wiki pages, onboarding docs — mine these for conventions the code alone doesn't reveal.
- **Ask the team** — if the user can answer questions about team preferences (PR process, deployment flow, naming debates), incorporate those answers. Code archaeology alone misses social conventions.
- **The Don'ts section is the highest-ROI output** — a well-crafted Don'ts list in CLAUDE.md prevents more mistakes than any amount of positive guidance.
- **Preserve what works** — in Update Mode, bias toward patching over rewriting. Existing config often embeds hard-won lessons that aren't visible in the code.
- **Depth over breadth** — a deep skill for the project's most complex domain (usually data access or the API layer) is worth more than shallow skills for 10 domains.
- **Update Mode should be fast** — the value is in catching drift quickly. If the audit finds <3 issues, present them inline instead of going through the full phase ceremony.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:setup` | Bootstraps the directory structure — /claude-tweaks:codebase-onboarding generates the content |
| `/claude-tweaks:review` | Phase 7 (hybrid mode) delegates to `/review discover` for browser-assisted journey discovery |
| `/claude-tweaks:wrap-up` | Captures learnings after features — keeps generated skills alive and accurate |
| `/claude-tweaks:help` | Shows workflow status — useful to verify onboarding produced a working setup |
