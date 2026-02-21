---
name: claude-tweaks:codebase-onboarding
description: Use when setting up Claude Code for a new or existing project — generates skills, CLAUDE.md, and rules. Re-run to find drift, gaps, and stale configuration.
---
> **Interaction style:** Present choices as numbered options (1, 2, 3…) so the user can reply with just a number. Do the same when suggesting the next skill to run.


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
- Age — earliest commit date (git log --reverse --format='%ai' | head -1)
- Activity — commits in last 90 days, number of contributors
```

### 1b: Stack Detection

Analyze package manifests, lock files, and config files to build a stack profile.

| Signal File(s) | Detects |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json` | JS/TS monorepo tooling |
| `tsconfig.json` | TypeScript config (strict mode, paths, module resolution) |
| `next.config.*`, `nuxt.config.*`, `vite.config.*`, `svelte.config.*`, `astro.config.*`, `remix.config.*` | Web framework |
| `angular.json` | Angular |
| `app.json`, `expo` in deps | React Native / Expo |
| `manifest.json` (with `manifest_version`) | Browser extension |
| `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py`, `uv.lock` | Python stack |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `Gemfile` | Ruby |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | Java/Kotlin |
| `.csproj`, `*.sln`, `global.json` | .NET |
| `mix.exs` | Elixir |
| `Package.swift` | Swift |
| `docker-compose.yml`, `Dockerfile`, `compose.yaml` | Containerization |
| `terraform/`, `*.tf` | Terraform IaC |
| `pulumi/`, `Pulumi.yaml` | Pulumi IaC |
| `cdk.json` | AWS CDK |
| `.env.example`, `.env.local`, `.env.sample` | Environment variable patterns |

For each detected technology, note the **version** (from lock file or config).

### 1c: Architecture Detection

```
Detect:
- Directory structure (flat vs layered vs feature-based vs domain-driven)
- API layer (REST, GraphQL, tRPC, gRPC — check routes, resolvers, routers)
- Database (ORM config: Prisma schema, Drizzle config, TypeORM entities,
  SQLAlchemy models, ActiveRecord migrations, EF Core, GORM, Ecto)
- Auth (NextAuth/Auth.js, Passport, custom JWT, OAuth, Keycloak, Auth0,
  Clerk, Supabase Auth, Firebase Auth, Lucia)
- State management (Redux, Zustand, MobX, Jotai, Recoil, Pinia, Vuex, Signals)
- Styling (Tailwind config, CSS modules, styled-components, Sass, Emotion, Panda CSS)
- Queue/messaging (Bull, BullMQ, SQS, Service Bus, RabbitMQ, Kafka, Celery, Sidekiq)
- Caching (Redis config, Memcached, in-memory patterns)
- Search (Elasticsearch, OpenSearch, Algolia, Meilisearch, Typesense, AI Search)
- Realtime (Socket.io, SignalR, Pusher, Ably, SSE, Phoenix Channels, ActionCable)
- AI/ML (OpenAI, Anthropic, HuggingFace, Vercel AI SDK, LangChain, LlamaIndex)
- Observability (Sentry, DataDog, New Relic, Application Insights, Pino, Winston,
  structlog, OpenTelemetry)
- Payments (Stripe, Paddle, LemonSqueezy — check for webhook handlers)
- Email (SendGrid, Resend, Postmark, SES, Mailgun — check for templates)
```

### 1d: Convention Detection

Scan for patterns the team actually follows (not what they aspire to). Sample **at least 5 files** per pattern to distinguish one-off deviations from real conventions.

```
Detect:
- Naming: files (PascalCase vs kebab-case vs camelCase), DB tables, API routes
- Exports: default vs named (grep for "export default" frequency)
- Error handling: custom error classes, error boundaries, try/catch patterns,
  Result types, Either monads
- Validation: Zod, Yup, Joi, class-validator, io-ts, Valibot, ArkType
- Logging: structured vs console.log, logger library and call signature
- Testing: framework (Jest, Vitest, Pytest, Go test, RSpec, ExUnit),
  co-located vs separate test dirs, naming convention (.test.ts, .spec.ts, _test.go)
- Linting: ESLint/Biome config, Prettier, custom rules, auto-fix on save
- Git: conventional commits (check recent 20 commit messages), branch naming,
  PR templates, CODEOWNERS
- Code organization: barrel exports (index.ts), shared utils location,
  constants/config patterns, dependency injection
- Import style: absolute vs relative, path aliases, barrel re-exports
```

### 1e: Workflow Detection

```
Detect:
- CI/CD pipeline (what it runs: lint, test, build, deploy, type check)
- Deployment target (Vercel, AWS, Azure, GCP, Fly.io, Railway, Render, Netlify,
  Cloudflare, self-hosted k8s)
- Database migrations (tool + location of migration files)
- Seeding (seed scripts, fixture data)
- Environment management (how many envs, how secrets are managed)
- Pre-commit hooks (Husky, lint-staged, lefthook)
- Package scripts (all scripts in root package.json + key workspace scripts)
- Release process (semantic-release, changesets, manual tags)
```

### 1f: Pain Point Detection

Look for signs of technical debt or friction:

```
Detect:
- TODO/FIXME/HACK comments (count and categorize top 5 themes)
- Disabled lint rules (eslint-disable counts by rule — top 10)
- Type assertions (as any, as unknown, @ts-ignore, @ts-expect-error — counts + hotspot files)
- Dead code signals (unused exports, commented-out code blocks >5 lines)
- Dependency freshness (major versions behind on key deps)
- Test coverage gaps (dirs with code but no tests — list the dirs)
- Missing types (JS files in a TS project, untyped areas)
- Copy-paste patterns (near-duplicate files or functions — sample 3 if found)
- Inconsistency signals (same thing done 2+ different ways — e.g., both fetch and axios,
  both default and named exports in similar files)
```

### 1g: Existing AI Configuration (Initial Mode only)

Check for non-Claude AI config that might contain useful conventions to migrate:

```
Detect:
- .cursorrules, .cursor/ (Cursor IDE rules)
- .github/copilot-instructions.md (GitHub Copilot)
- .ai/, .aider*, coderabbit.yaml (other AI tools)
- Any of these contain useful conventions to preserve or migrate
```

If found, ask the user whether to **migrate and enhance** or **ignore**.

---

## Phase 2: Build the Profile / Diff Report

### Initial Mode → Stack Profile

Synthesize Phase 1 findings into a structured profile:

```markdown
## Stack Profile: {project name}

### Identity
- **Domain:** {what the project does}
- **Type:** {monorepo | single app | library | CLI tool | API service}
- **Age:** {first commit date}
- **Activity:** {commits last 90 days, approx contributors}
- **Size:** {approximate file count, lines of code if easily available}

### Stack Table
| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Language | {e.g., TypeScript 5.x} | {version} | {strict mode, etc.} |
| Runtime | {e.g., Node 22, Python 3.12} | {version} | {from .node-version, etc.} |
| ... | ... | ... | ... |

### Architecture
- **Pattern:** {MVC, Clean Architecture, feature-based, hexagonal, etc.}
- **API style:** {REST, GraphQL, tRPC, etc.}
- **Data flow:** {brief description}

### Conventions (observed)
- **Naming:** {patterns detected}
- **Testing:** {framework, co-located vs separate, naming}
- **Commits:** {conventional? format?}
- **Errors:** {custom classes? raw throws?}
- **Imports:** {absolute/relative, aliases, barrel files}

### Workflows
- **CI/CD:** {what runs, where}
- **Deploy:** {target, method}
- **Key scripts:** {list most important}

### Health Indicators
- **Type safety:** {strict TS? assertion count? JS files in TS project?}
- **Test coverage:** {rough estimate — which dirs have tests, which don't}
- **Debt signals:** {TODO count, disabled rules, type assertion hotspots}
- **Inconsistencies:** {patterns done multiple ways}

### Existing AI Config
- {what was found, or "None"}

### Skill Candidates
{Prioritized list — see Phase 3}
```

Present as numbered options:

```
Does this profile look accurate?
1. Looks good — proceed to skill generation
2. Needs corrections — I'll tell you what to fix
3. Missing context — let me add team conventions you can't see in the code
```

Also ask: **"Are there team conventions or preferences that aren't visible in the code?"** (e.g., PR review process, deploy cadence, on-call expectations, style preferences debated but never codified)

Wait for confirmation before proceeding.

### Update Mode → Drift Report

Compare the Phase 0u inventory against Phase 1 findings. Classify every finding:

```markdown
## Configuration Health Report

### Summary
- **Covered:** {N} patterns accurately documented
- **Stale:** {N} references to things that changed or no longer exist
- **Drifted:** {N} documented patterns the codebase has moved away from
- **Gaps:** {N} codebase patterns with no config coverage

### Stale (fix or remove)

Things the config references that no longer match reality:

| Location | What's Stale | Current Reality |
|----------|-------------|-----------------|
| CLAUDE.md line {N} | Lists `{command}` | Script removed/renamed to `{new}` |
| Skill `{name}` | References `{path}` | File moved to `{new path}` / deleted |
| Skill `{name}` | Describes `{pattern}` | Pattern replaced by `{new pattern}` |
| Rule `{name}` | Scoped to `{path}` | Directory renamed/restructured |

### Drifted (update to match reality)

The config describes something correctly as of when it was written, but the codebase has evolved:

| Location | Documented Convention | Actual Current Practice | Evidence |
|----------|----------------------|------------------------|----------|
| CLAUDE.md | "{convention}" | Now does "{new way}" | {N} files sampled |
| Skill `{name}` | Uses `{old pattern}` | Codebase migrated to `{new}` | grep count |

### Gaps (new config needed)

Patterns found in the codebase with no corresponding config:

| Pattern | Category | Why It Needs a Skill/Rule | Suggested Action |
|---------|----------|--------------------------|------------------|
| {pattern} | {stack/convention/workflow} | {reason} | New skill / CLAUDE.md addition / new rule |

### Healthy (no action needed)

| Config Item | Status |
|------------|--------|
| CLAUDE.md Stack table | Accurate |
| Skill `{name}` | Patterns match codebase |
| ... | ... |
```

Ask: **"Here's what I found. Which items should I fix? All stale + drifted? Specific ones?"**

Wait for confirmation before proceeding.

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
- `finalize-work` — captures learnings after completing features (keeps skills alive)
- `review-plan` — validates implementation plans against project conventions
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

### Initial Mode

Produce CLAUDE.md from scratch following this template:

```markdown
# {project name}

{One-line description of what the project does.}

## Stack

| Layer | Tech |
|-------|------|
| ... | ... |

## Structure

{Directory tree showing key directories and their purpose — max 15 lines}

## Commands

{Key package scripts — what developers actually run daily.
Verify every command exists in package.json / Makefile / scripts before listing.}

## Conventions

{Observed naming, patterns, and rules — max 10 bullets}

## Testing

{Framework, run commands, file location, naming convention}

## Environment

{How to set up locally, where secrets live, required services}

## Git

{Commit convention, branch strategy, PR process}

## Don't

{Anti-patterns observed or inferred — things that would break the project's conventions.
This section is the highest-ROI output. See "Mining Don'ts" below.}
```

### Update Mode

Produce a **patch** — not a full rewrite. For each stale/drifted item the user approved:

```markdown
## CLAUDE.md Patches

### Patch 1: {description}
**Location:** Line {N}, section "{section}"
**Current:** `{current text}`
**Proposed:** `{new text}`
**Reason:** {why — e.g., "script renamed", "convention changed", "new stack added"}

### Patch 2: ...
```

Apply patches using Edit tool calls with precise `old_string` → `new_string` replacements. Never rewrite the entire file in Update Mode unless the user explicitly asks for it.

### Mining Don'ts

The Don'ts section prevents more mistakes than any amount of positive guidance. Source them from:

1. **Inconsistencies found in 1f** — if the codebase uses both patterns, codify which is correct
2. **Common mistakes for this stack** — e.g., "don't use `getServerSideProps` in App Router" for Next.js 13+
3. **Pain points found in 1f** — if there are 50 `eslint-disable` for the same rule, that's a "don't disable rule X" candidate
4. **Convention violations** — if 95% of files use named exports, "don't use default exports" is a don't
5. **Security footguns** — any auth, input validation, or data handling patterns that must not be violated

### Principles

- **Observed, not aspirational** — document what the codebase actually does
- **Under 150 lines** — if it doesn't fit, it belongs in a skill or rule
- **Commands must work** — verify scripts exist before listing them
- **Don'ts are cheap insurance** — if you see a pattern that would be easy to violate, add it

---

## Phase 5: Generate / Update Skills

### Initial Mode

For each approved skill, produce a SKILL.md:

```markdown
---
name: {kebab-case-name}
description: {When to use this skill — action-oriented, starts with "Use when..."}
---

# {Skill Title}

## Overview
{What this skill covers and why it exists for this project.}

## Key Patterns

### {Pattern 1 Name}
{Description + code example extracted/adapted from the actual codebase.
Include file path where the canonical example lives.}

### {Pattern 2 Name}
{Description + code example.}

## Decision Framework
{When to choose between approaches — ASCII flowchart or table if applicable.}

## Project Conventions
{Project-specific rules for this domain — the stuff that's different from the
generic approach. This is the most valuable section.}

## Common Operations
{Step-by-step for the most frequent tasks in this domain.
Include actual commands that work in this project.}

## Anti-Patterns
| Pattern | Why It Fails in This Project |
|---------|------------------------------|
| ... | {Project-specific reason, not generic advice} |

## Reference
{Links to relevant project files, external docs, or related skills.}
```

### Update Mode

For each approved drifted skill, produce **targeted edits** — not a full rewrite:

```markdown
## Skill Patches: `{skill-name}`

### Edit 1: {description}
**Section:** {section name}
**Action:** Replace / Add / Remove
**Current:** `{current text or "N/A" for additions}`
**Proposed:** `{new text}`
**Reason:** {what changed in the codebase}
```

For approved gap skills (new patterns needing new skills), generate full SKILL.md as in Initial Mode.

### Quality Gates for Generated Skills

Before finalizing each skill, verify:

- [ ] Every code example is adapted from actual codebase patterns (not generic)
- [ ] File paths referenced actually exist
- [ ] Commands referenced actually work
- [ ] Conventions described match what the codebase actually does
- [ ] No generic advice that adds no project-specific value
- [ ] Anti-patterns cite project-specific reasons, not textbook warnings
- [ ] Description starts with "Use when..." and describes a clear trigger

### Skill Depth Guide

Not every skill needs the same depth. Match depth to complexity score:

| Complexity | Depth | Sections Required |
|------------|-------|-------------------|
| 3 (High) | Full — all sections, multiple code examples, decision trees | All |
| 2 (Medium) | Standard — key patterns, conventions, common operations | Overview, Key Patterns, Conventions, Common Operations |
| 1 (Low) | Minimal — conventions and anti-patterns only | Overview, Conventions, Anti-Patterns |

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

## Phase 7: Present Summary and Confirm

### Initial Mode

```markdown
## Generated Configuration

### CLAUDE.md
- {line count} lines
- Covers: {sections list}

### Skills ({count})
| Skill | Priority | Depth | Files |
|-------|----------|-------|-------|
| {name} | P1 | Full | SKILL.md |
| ... | ... | ... | ... |

### Rules ({count})
| Rule | Scoped to |
|------|-----------|
| {name} | {paths} |

### Not generated (deferred)
- {skill}: {reason to defer}

### Refinement roadmap
After 1 week of use, revisit:
1. {skill most likely to need adjustment and why}
2. {convention most likely to be incomplete}
3. {area where team input would improve the config}

Ready to write these files?
```

### Update Mode

```markdown
## Configuration Update

### CLAUDE.md
- {N} patches ({list: "updated Stack table", "added Don't", etc.})

### Skills Updated ({count})
| Skill | Changes |
|-------|---------|
| {name} | {1-line summary of edits} |

### Skills Created ({count})
| Skill | Priority | Rationale |
|-------|----------|-----------|
| {name} | P1 | {gap it fills} |

### Skills to Consider Removing ({count})
| Skill | Reason |
|-------|--------|
| {name} | {e.g., "project no longer uses Redis"} |

### Rules
- {N} updated, {N} created, {N} to remove

### No changes needed
- {list items that were audited and found healthy}

Ready to apply these changes?
```

Execute only after user confirmation.

---

## Important Notes

- **One session is not enough** — the initial skill set will be ~70% right. Expect to refine skills after the first week of actual use. Tell the user this explicitly.
- **Re-run periodically** — run this skill in Update Mode after major refactors, stack upgrades, or when skills start feeling stale. A quarterly cadence works for active projects.
- **Skills are living documents** — they should evolve as the team's understanding of the project deepens. Recommend creating a `finalize-work` equivalent that reviews and updates skills after completing features.
- **Don't over-generate** — 5 excellent skills beat 15 mediocre ones. Each skill should earn its existence by encoding knowledge that would otherwise be lost or forgotten.
- **Existing docs are gold** — README, CONTRIBUTING, ADRs, wiki pages, onboarding docs — mine these for conventions the code alone doesn't reveal.
- **Ask the team** — if the user can answer questions about team preferences (PR process, deployment flow, naming debates), incorporate those answers. Code archaeology alone misses social conventions.
- **The Don'ts section is the highest-ROI output** — a well-crafted Don'ts list in CLAUDE.md prevents more mistakes than any amount of positive guidance.
- **Preserve what works** — in Update Mode, bias toward patching over rewriting. Existing config often embeds hard-won lessons that aren't visible in the code.
- **Depth over breadth** — a deep skill for the project's most complex domain (usually data access or the API layer) is worth more than shallow skills for 10 domains.
- **Update Mode should be fast** — the value is in catching drift quickly. If the audit finds <3 issues, present them inline instead of going through the full phase ceremony.
