# Visual Review — Discover Mode

Loaded by `/claude-tweaks:visual-review` when the resolved mode is `discover`. The goal is to identify all user and developer journeys in an existing application and create journey files for them. This is the brownfield bootstrapping mode — used when a project has features but no documented journeys.

Requires the shared prerequisites from `browser-review.md` (session naming, screenshot path convention, dev URL resolution) — load this file only AFTER those have been processed.

## Phase 1: Codebase Scan

Scan the codebase to build a map of what exists before opening the browser.

> **Parallel execution:** Use parallel tool calls aggressively — all glob/grep operations across the four scan categories below are independent and should run concurrently. Front-load all codebase reads before browser interaction.

**Routes and pages:**
- Search for route definitions (React Router, Next.js pages/app directory, Express routes, Rails routes, etc.)
- Search for navigation components (navbars, sidebars, menus) to understand the information architecture
- Search for page/view components or templates

**Entry points:**
- Public pages (landing, login, signup, pricing)
- Authenticated pages (dashboard, settings, profile)
- Admin/internal pages
- API documentation pages
- Developer-facing entry points (CLI commands, setup scripts, config files)

**User-facing features:**
- Forms (signup, settings, create/edit flows)
- CRUD operations (lists, detail views, create, edit, delete)
- Workflows (multi-step processes, wizards, checkout flows)
- Search, filtering, sorting interfaces

**Personas (infer from the codebase):**
- Are there user roles? (admin, user, guest, developer)
- Is there an onboarding flow? (implies first-time user persona)
- Is there a public-facing site vs. authenticated app? (implies visitor vs. user)
- Is there API documentation or a developer portal? (implies developer persona)

## Phase 2: Journey Candidates

From the codebase scan, compile a list of candidate journeys. Each candidate is a hypothesis: "a {persona} probably does {goal} by going through {these pages}."

Present the candidates as numbered options:

```
Found {N} potential user journeys in the codebase:

1. New user signup → onboarding → first project
   Persona: First-time visitor
   Pages: /, /signup, /onboarding, /projects/new

2. Returning user creates a {thing}
   Persona: Authenticated user
   Pages: /dashboard, /{things}/new, /{things}/{id}

3. Admin manages users
   Persona: Admin
   Pages: /admin, /admin/users, /admin/users/{id}

4. Developer sets up local environment
   Persona: New developer
   Entry: README.md → install → config → first run

...

Proceeding to walk all {N} journeys in the browser. Say "skip {numbers}" to exclude any.
```

Include developer journeys when the project has CLI tools, APIs, or developer-facing setup.

## Phase 3: Browser Walkthrough

**Dispatcher column mapping (discover-mode use):** When assembling agent output for Phase 4 (journey file creation) and Phase 5 (coverage report), map the agent's `| Severity | Path:Line | Finding | Evidence |` columns as follows: Severity = recommendation urgency (`info` for documented page, `low` for nice-to-have journey, `medium` for canonical journey worth writing, `high` for broken/missing critical flow), Path:Line = the discovered route/page (`/checkout/payment`, `/admin/users/{id}`), Finding = the candidate journey + persona (`Returning user creates a new project`), Evidence = the screenshot path + key observations (`screenshots/browse/discover-public-pages/03_payment.png; LCP 1.8s; primary CTA at [3]`). The dispatcher merges all agents' tables into Phase 4 (journey file creation) and Phase 5 (coverage report).

> **Parallel execution (conditional):** When multiple candidate journeys share no pages, dispatch each as a parallel Task agent — each agent runs its own session and `batch` invocation independently. Journeys that share state (login, form data) must remain sequential to avoid interference. A single journey's steps are always sequential within its batch.
>
> **Model tier:** Standard (Sonnet) — discover-mode journey walkers do multi-step navigation, snapshot interpretation, and "should feel" inference from live experience. Upgrade to Capable (Opus) only when the candidate journey hinges on subjective UX synthesis that Standard would flatten.
>
> **Output template (each agent must follow exactly):**
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY a markdown table, no preamble:
>
> | Severity | Path:Line | Finding | Evidence |
> |---|---|---|---|
> | critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |
> | medium | src/api.ts:180 | Unhandled rejection | line 184: `await fetch(...)` no try/catch |
>
> Severity scale: critical / high / medium / low / info
> If no findings: return literal text "No findings."
> Do not add narration, headers, or summaries before or after the table.
> ```
>
> Each agent's first reply line must be one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`, then the table.

For each approved candidate, open a session and walk the candidate journey via a `batch` invocation that bundles `open`, `snapshot -i -c`, annotated `screenshot`, and `vitals` per page (same shape as the worked example in `journey-mode.md`). This is where the codebase skeleton gets filled with experiential details.

For each step in the candidate journey (review the batched output):

1. **Apply the First Impressions test** (Step 2 in `browser-review.md`) — capture the raw "should feel" for this step from the annotated screenshot
2. **Note interaction needs as the persona** — when the candidate requires actual interaction (form fill, click flow), perform those ops in the live session outside the batch; restart the batch for subsequent pages
3. **Discover adjacent steps** — the codebase scan may have missed steps. If a page leads naturally to another page not in the candidate, add it to the next batch slice.
4. **Write the "should feel" and "red flags"** — these come from actually experiencing the page (snapshot + annotated screenshot + vitals), not guessing from code

## Phase 4: Write Journey Files

For each walked journey, create a file at `docs/journeys/{journey-name}.md` using the standard journey format (see `/build` Common Step 6 for the template).

Key differences from build-created journeys:
- **Origin section** says "Created during journey discovery (brownfield)" instead of referencing a spec
- **"Should feel" comes from actual browser experience**, not from spec intentions
- **Steps may reference features built across many past commits** — no single spec to reference

## Phase 5: Coverage Report

After creating all journey files, present a coverage report:

```markdown
## Journey Discovery Report

### Journeys Created
| Journey | Persona | Steps | Coverage |
|---------|---------|-------|----------|
| {name} | {persona} | {count} | {which pages/features are covered} |

### Pages Not Covered by Any Journey
| Page/Route | Reason |
|-----------|--------|
| {route} | {no clear user goal identified / admin-only / deprecated / utility page} |

### Gaps Identified
| Gap | Description |
|-----|-------------|
| {what's missing} | {e.g., "no error recovery journey", "no mobile journey", "no developer onboarding journey"} |
```

Present uncovered pages and gaps as a batch:

```
| # | Gap | Recommended |
|---|-----|-------------|
| 1 | {page/route} | Not a journey — utility page |
| 2 | {missing flow} | Capture to INBOX |
| 3 | {page/route} | Create a journey — needs exploration |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

## Phase 6: Handoff

Commit journey files with message: "Add {N} user journeys from discovery (brownfield)"

## Next Actions (discover mode)

1. `/claude-tweaks:visual-review journey:{name}` — test a specific journey against its expectations **(Recommended)**
2. `/claude-tweaks:visual-review {url}` — review a specific page
