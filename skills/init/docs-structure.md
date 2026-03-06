# Doc Registry and Documentation Structure

Reference content for creating and maintaining the project documentation registry. Lazy-loaded by Phase 8.5 of the init skill.

## Registry Format

The registry is a markdown file at `docs/REGISTRY.md` that maps documentation files to the code areas they cover. When code matching an Auto-detect pattern changes, the corresponding doc should be reviewed and updated.

```markdown
# Doc Registry

> Maps documentation to the code areas it covers. Created by /init, maintained by /build and /wrap-up.
> When code matching an Auto-detect pattern changes, the corresponding doc should be reviewed and updated.

## Tier: {1|2|3}

| Doc | Covers | Auto-detect |
|-----|--------|-------------|
| README.md | Project overview, setup, usage | `package.json`, `docker-compose*`, top-level config |
| docs/api.md | REST API endpoints | `src/routes/**`, `src/controllers/**` |
```

### Column definitions

| Column | Description |
|--------|-------------|
| **Doc** | Relative path to the documentation file |
| **Covers** | Human-readable description of what the doc documents |
| **Auto-detect** | Glob patterns for source files — when these change, the doc may need updating |

### Auto-detect pattern guidelines

- Use the project's actual directory structure, not hypothetical paths
- One entry per doc file — don't split a doc across multiple rows
- Architecture docs (`architecture.md`, `decisions/*.md`) typically have no Auto-detect — they're updated on structural changes caught by `/wrap-up`
- README.md auto-detect should cover top-level config files that affect setup/usage

## Tier Definitions

| Tier | Profile | Structure |
|------|---------|-----------|
| **1** | Small library/tool, single README handles everything | `README.md` + `docs/REGISTRY.md` (2-3 rows) |
| **2** | Growing app, 2+ distinct doc concerns | `README.md` + flat `docs/*.md` files |
| **3** | Large app, multiple API surfaces, team project, infra | `README.md` + organized `docs/` with subfolders |

## Tier Detection Heuristics

Combine signals from Phase 2 reconnaissance and the confirmed maturity classification from Phase 3.

| Signal | Tier |
|--------|------|
| < 10 source files, no web framework, no API layer | 1 |
| README.md > 200 lines | 2+ (split out getting-started, API, etc.) |
| 2+ distinct doc concerns (API + deployment, setup + architecture) | 2+ |
| CONTRIBUTING.md exists or > 3 git contributors | 2+ |
| Multiple packages/apps (monorepo) | 3 |
| Multiple API surfaces (REST + GraphQL, CLI + API) | 3 |
| Infrastructure as code (Terraform, CDK, Docker Compose with services) | 3 |
| Existing `docs/` directory with 5+ files | 3 |

### Maturity → Tier alignment

The maturity classification (confirmed in Phase 3) provides a baseline, but project-specific signals override:

| Maturity | Default Tier | Override signals |
|----------|-------------|------------------|
| Greenfield | 1 | Web framework detected → 2 |
| Pre-launch | 2 | Monorepo or multiple APIs → 3 |
| Early production | 2-3 | Based on API surface count |
| Established | 3 | Almost always |

## Standard Folder Taxonomy

Based on the [Diataxis framework](https://diataxis.fr/) — guides (task-oriented), api (reference), architecture + decisions (explanation), getting-started (learning). Senior engineers will recognize this structure from Django, NumPy, and other well-maintained projects.

### Tier 1 (README-only)

```
README.md
docs/
  REGISTRY.md              ← 2-3 rows
```

### Tier 2 (README + flat docs)

```
README.md
docs/
  REGISTRY.md
  getting-started.md       ← when README outgrows setup instructions
  architecture.md          ← when system design warrants documentation
  contributing.md          ← team projects
  {topic}.md               ← project-specific (api.md, deployment.md, etc.)
  journeys/                ← already exists
  plans/                   ← already exists
```

### Tier 3 (full structure)

```
README.md                  ← high-level overview, links into docs/
docs/
  REGISTRY.md
  getting-started.md
  architecture.md
  contributing.md
  api/                     ← multiple API surfaces
    rest.md
    graphql.md
    webhooks.md
  guides/                  ← how-to guides, runbooks, tutorials
    deployment.md
    monitoring.md
    migration-guide.md
  decisions/               ← ADRs (0001-chose-postgres.md)
  journeys/                ← already exists
  plans/                   ← already exists
```

**Folder rule:** Use a subfolder when you'd have 3+ files on a topic. `api.md` stays flat until you need `rest.md`, `graphql.md`, `webhooks.md`.

## Common Auto-detect Patterns by Project Type

### Web application

| Doc | Auto-detect |
|-----|-------------|
| README.md | `package.json`, `docker-compose*`, top-level config |
| docs/getting-started.md | `Dockerfile`, `.env*`, `Makefile`, `docker-compose*` |
| docs/api.md (or docs/api/) | `src/routes/**`, `src/controllers/**`, `src/api/**`, `app/api/**` |
| docs/architecture.md | — (structural changes, caught by wrap-up) |

### CLI tool

| Doc | Auto-detect |
|-----|-------------|
| README.md | `package.json`, `Cargo.toml`, `pyproject.toml`, CLI entry point |
| docs/api.md | Command definition files, argument parsers |

### Library / SDK

| Doc | Auto-detect |
|-----|-------------|
| README.md | `package.json`, `setup.py`, `Cargo.toml`, public API entry point |
| docs/api.md | Public module files, exported types |
| docs/guides/migration-guide.md | Breaking changes in public API |

### API service

| Doc | Auto-detect |
|-----|-------------|
| README.md | `package.json`, `docker-compose*`, top-level config |
| docs/api/ | Route definitions, schema files, OpenAPI specs |
| docs/guides/deployment.md | `infra/**`, `.github/workflows/*`, `Dockerfile` |

### Monorepo

| Doc | Auto-detect |
|-----|-------------|
| README.md | Root `package.json`, `turbo.json`, `pnpm-workspace.yaml` |
| docs/getting-started.md | Root config, workspace setup files |
| docs/architecture.md | — |
| packages/{name}/README.md | `packages/{name}/src/**` |

## Registry Creation Procedure (Phase 8.5)

Init is about fast-start — get the registry wired up and move on. Doc content work (refreshing stale docs, generating missing docs, reorganizing) is captured as INBOX items with Phase 2 context baked in, so it flows through the normal pipeline.

1. **Inventory existing docs** — Glob for `README.md`, `CONTRIBUTING.md`, `docs/**/*.md`, `*.md` in root. Exclude `CHANGELOG.md`, `LICENSE`, `node_modules`, generated files, and workflow artifacts (`specs/`, `docs/plans/`, `docs/journeys/`).

2. **Use confirmed tier** — Read the tier confirmed by the user in Phase 3. Do not re-detect.

3. **Map Auto-detect patterns** — For each existing doc, use the common patterns tables above as a starting point. Adapt to the project's actual directory structure from Phase 2 reconnaissance.

4. **Quick-assess existing docs** — For each existing doc, do a lightweight cross-reference against Phase 2 findings. This is a scan, not a deep audit:

   > **Parallel execution:** Use parallel tool calls — all Read operations on existing doc files are independent.

   | Check | How | Finding |
   |-------|-----|---------|
   | **Stale commands** | Compare doc's command examples against actual scripts from Phase 2 | "Lists `npm run dev` but project uses `pnpm dev`" |
   | **Stale paths** | Check file/directory references against actual filesystem | "References `src/api/` but directory is `src/routes/`" |
   | **Missing content** | Compare doc's coverage against Phase 2 findings | "API doc lists 8 endpoints but Phase 2 found 13" |
   | **Stale stack** | Compare technology references against actual stack | "Says 'React 17' but project is on React 19" |
   | **Organization** | Check if content matches the standard taxonomy location | "docs/setup.md covers getting-started scope" |
   | **Oversized README** | If README > 200 lines, identify splittable sections | "README has 90-line API reference section" |

   Classify each existing doc:
   - **Accurate** — content matches Phase 2 findings, no significant gaps
   - **Stale** — contains outdated commands, paths, stack info, or missing recent additions
   - **Thin** — covers the right topic but significantly incomplete
   - **Misplaced** — content doesn't match the standard taxonomy location

5. **Identify missing docs** — Based on the confirmed tier, identify gaps:
   - Tier 2+ with no setup doc but complex setup → note `docs/getting-started.md` needed
   - Tier 2+ team project with no contributing guide → note `docs/contributing.md` needed
   - Tier 3 with API but no API docs → note `docs/api.md` needed

6. **Present batch:**

   ```
   ### Doc Registry

   Tier: {N} (confirmed in Phase 3)

   | # | Doc | Status | Assessment | Auto-detect | Action |
   |---|-----|--------|------------|-------------|--------|
   | 1 | README.md | Exists | 3 stale commands | `package.json`, `docker-compose*` | Register |
   | 2 | docs/setup.md | Exists | Misplaced (getting-started scope) | `Dockerfile`, `.env*` | Register |
   | 3 | docs/api.md | Exists | Missing 5 endpoints | `src/routes/**` | Register |
   | 4 | CONTRIBUTING.md | Exists | Accurate | — | Register |
   | 5 | docs/getting-started.md | Missing | — | `Dockerfile`, `.env*` | — |

   1. Apply all **(Recommended)**
   2. Override specific items
   ```

   All existing docs are registered as-is — init does not modify them. The Assessment column captures findings for the INBOX items in step 8.

7. **Create `docs/REGISTRY.md`** with approved entries (existing docs only — missing docs are not added until they're created).

8. **Capture doc work as INBOX items** — For each finding from the assessment (stale, thin, misplaced, missing), create an INBOX entry in `specs/INBOX.md` with the Phase 2 context baked in:

   ```markdown
   ### Refresh docs/api.md — missing 5 endpoints
   API doc lists 8 endpoints but Phase 2 reconnaissance found 13 route handlers.
   Missing: `POST /api/users`, `DELETE /api/users/:id`, `GET /api/settings`, `PUT /api/settings`, `POST /api/webhooks`.
   Source: route files in `src/routes/`.
   ```

   ```markdown
   ### Create docs/getting-started.md
   Project has complex setup (Docker + env vars + database) but no setup doc.
   Content sources: `docker-compose.yml`, `.env.example` (12 vars), `package.json` scripts (`dev`, `db:push`, `seed`).
   Tier 2 project — setup instructions should be split from README.
   ```

   ```markdown
   ### Reorganize docs/setup.md → docs/getting-started.md
   Content matches the getting-started pattern in the standard taxonomy.
   Rename for consistency across projects using the workflow system.
   ```

   **INBOX item rules:**
   - Include specific findings from the assessment (which commands are stale, which endpoints are missing, which sections to split)
   - Include the Phase 2 data sources so the work can be done without re-analyzing the codebase
   - One INBOX item per doc action (don't bundle "refresh api.md + create getting-started.md" into one item)
   - Skip INBOX items for docs classified as **Accurate** — nothing to do
   - Group related items when they depend on each other (e.g., "split README" and "create getting-started.md" reference each other)

   Present the INBOX items as a summary after the registry:

   ```
   ### Doc Work Captured

   {N} items added to INBOX for documentation improvements:
   - Refresh: docs/api.md (missing endpoints), README.md (stale commands)
   - Create: docs/getting-started.md
   - Reorganize: docs/setup.md → docs/getting-started.md

   These will appear in `/claude-tweaks:help` and can be prioritized alongside other work.
   ```

## Doc Update Patterns (for /build Step 6.5)

When `/build` Step 6.5 detects that changed files match a registry entry's Auto-detect patterns, use these patterns to determine what to update:

| Doc type | Trigger | Update action |
|----------|---------|---------------|
| **API docs** | Route/controller/handler file changed | Add new endpoints to the endpoint table. Update changed endpoints (method, path, params, response). Remove deleted endpoints. Use the actual route definition as the source of truth. |
| **Getting started** | Docker, env, dependency, or setup config changed | Update the affected step (new dependency → add to prerequisites, new env var → add to env setup, new Docker service → add to services section). |
| **Architecture** | New top-level directory, new package in monorepo, new service | Add the new component to the system overview. Update the directory responsibilities table. Don't rewrite — append. |
| **README** | Package manifest, top-level config, project description changed | Update the relevant section (new script → add to commands, new dep → add to stack, changed description → update intro). |
| **Contributing** | CI/CD config, linting config, test framework changed | Update the affected section (new CI step → add to PR process, new lint rule → add to code style). |
| **Deployment** | Infra config, deploy workflow, Dockerfile changed | Update the affected section (new env var → add to secrets, new service → add to architecture, changed workflow → update deploy steps). |
| **Any doc** | Referenced file paths no longer exist | Fix broken references — update paths to new locations or remove references to deleted files. |

**Decision threshold for Step 6.5:**
- **Update inline** (commit during build): The change is clearly scoped — adding a row to an endpoint table, updating a command, fixing a broken path. Takes < 5 minutes of doc editing.
- **Defer to wrap-up** (ledger entry): The change is structural — a doc needs reorganization, a new section, or the update requires reading multiple changed files to understand the full impact.

## Update Mode (for /init update)

When running in update mode, diff the existing registry against the current codebase:

- **Stale entries** — doc file deleted but still in registry → recommend removing entry
- **Gap entries** — new doc files not in registry → recommend adding entry with Auto-detect patterns
- **Pattern drift** — Auto-detect patterns reference directories that were renamed or restructured → recommend updating patterns
- **Tier drift** — project complexity has changed (e.g., grew from Tier 1 to Tier 2) → recommend tier upgrade

Present all findings in the same batch format as initial mode.
