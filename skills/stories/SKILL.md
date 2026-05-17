---
name: claude-tweaks:stories
description: Use when generating or updating user story YAML files for UI testing — browses a site with agent-browser, discovers flows, creates structured stories using semantic locators (schema v2) with diff-aware updates, negative testing, source-aware contracts, journey awareness, and self-validation. Keywords - stories, generate, create, user journey, persona, QA, testing, semantic-locators.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Stories — Generate or update user-story YAML for UI testing

Browse a website, understand its structure and flows, and generate user story YAML files for UI testing. Stories describe journeys for any persona — customers, admins, developers, operators.

```
/claude-tweaks:init → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → [ /claude-tweaks:stories ] → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                                                                                 ^^^^ YOU ARE HERE ^^^^
                                                                                                                                 (conditional — only when UI files change)
```

## When to Use

- After `/claude-tweaks:build` when UI files changed (lifecycle recommendation)
- Against any URL to create regression suites (standalone)
- When existing stories need updating after UI changes (diff-aware)
- The user says "generate stories," "create user stories," or "write QA stories"

## Input

Parse `$ARGUMENTS` to extract:

- **URL:** (required, auto-detected if omitted) the site to browse and generate stories for. When no URL is provided, auto-detect using `dev-url-detection.md` in `skills/_shared/`.
- **PERSONA:** (optional) `persona=<name>` — the type of user to generate stories for (e.g. "customer", "admin", "developer"). If not specified, infer appropriate personas from the site's structure.
- **OUTPUT_DIR:** (optional) `dir=<path>` — directory to write stories to. Default: `stories/`
- **FOCUS:** (optional) `focus=<area>` — specific area or flow to focus on (e.g. "checkout", "settings", "onboarding")
- **REFINE:** (optional) `refine=true|false` — validate sample stories and self-correct. Default: `true`.
- **NEGATIVE:** (optional) `negative=true|false` — generate failure-path negative stories. Default: `true`.
- **JOURNEY_FILTER:** (optional) `journey=<name>` — scope generation to pages covered by the named journey. When set, only generates stories for pages documented in that journey file (`docs/journeys/{name}.md`).

**Keyword detection rules (applied to $ARGUMENTS):**
- `refine=false` → REFINE = `false` (default is `true`)
- `negative=false` → NEGATIVE = `false` (default is `true`)
- `dir=<path>` → OUTPUT_DIR = `<path>`
- `persona=<name>` → PERSONA = `<name>`
- `focus=<area>` → FOCUS = `<area>`
- `journey=<name>` → JOURNEY_FILTER = `<name>`
- Remaining non-keyword argument → URL

### URL Resolution

If no URL is provided in `$ARGUMENTS`, run the dev URL detection procedure from `dev-url-detection.md` in `skills/_shared/`. This probes common ports, checks project configuration, and resolves `APP_URL` automatically. If no server can be detected or started, stop and ask the user for a URL.

**Auto-detected behavior:**
- **Update mode:** If `{OUTPUT_DIR}/*.yaml` files already exist, automatically enter diff-aware mode. No keyword needed — the skill detects existing stories and only generates new or changed ones.
- **v1 detection:** If any existing YAML lacks `schema_version: 2` at the top, the v1 detection / regeneration UX (see below) runs before update-mode comparison.

## Story schema (v2)

All generated stories use `schema_version: 2`. Locators are semantic only — no CSS, no XPath:

```yaml
schema_version: 2
stories:
  - id: checkout-happy-path
    description: Complete a purchase from cart to confirmation
    journey: checkout
    auth: { vault: "default-user" }   # optional — see Auth Vault section
    steps:
      - action: click
        locator: { role: button, name: "Add to cart" }
      - action: fill
        locator: { testid: "email-input" }
        value: "user@example.com"
      - action: assert_visible
        locator: { text: "Order confirmed", exact: true }
```

Locators are always semantic (one of: ARIA role, `data-testid`, visible text, form label, input placeholder) — never CSS, XPath, or `@eN` snapshot refs. At runtime, locators resolve to session-scoped `@eN` refs via `agent-browser --session <name> find <type> <args>`; refs are NEVER stored in the YAML — they regenerate each snapshot. See `agent-browser-reference.md` in the `/claude-tweaks:browse` skill directory for the full operation vocabulary.

See locator types and preference order in `story-examples.md`.

## Auth Vault

Stories that require login reference an Auth Vault entry via the story-level `auth: { vault: "<name>" }` field. The vault stores credentials encrypted, locally. The LLM never sees passwords.

**Setup (user runs once):**

```
agent-browser auth set <vault-name> <username> <password>
```

**In the story runtime, after `open` and before the first action:**

```
agent-browser --session <story-id> auth use <vault-name>
```

This replaces the cookie-injection path used in earlier versions and removes the need for `auth.yml` profile files in new projects. Stories generated against an existing project that already has `{OUTPUT_DIR}/auth.yml` continue to work — Step 2's auth resolution detects the legacy file and offers to migrate vault entries from it.

## Step 1: Ingest

**Legacy v1 detection:** If any existing YAML lacks `schema_version: 2` at the top, read `migration.md` in this skill's directory for the full migration procedure (auto-mode staging, interactive prompt, per-story diff, regeneration rules) BEFORE continuing. Do NOT silently parse legacy v1 files — they use CSS selectors which schema v2 forbids.

Gather pre-existing information before browsing.

### Diff-Aware Ingestion (auto-detected)

1. Use the Glob tool to check for existing YAML files in OUTPUT_DIR matching `{OUTPUT_DIR}/*.yaml`.
2. If YAML files exist, enter **update mode**:
   a. Read each YAML file. Check the top of each file for `schema_version: 2`. If any file lacks it, run the v1 detection / regeneration UX described in the "v1 detection" section above before continuing — DO NOT silently parse legacy files. Resolve the v1 prompt before proceeding.
   b. Parse the `stories` array.
   c. Build an EXISTING_STORIES map: `{ storyId -> { url, locators[], steps[], sourceFile } }` — extract all semantic locators from each story's steps.
   d. Build an EXISTING_URLS set: all unique `url` values across existing stories.
   e. Log: "Update mode: found {N} existing stories across {M} files in {OUTPUT_DIR}."
3. If no YAML files found, log: "No existing stories in {OUTPUT_DIR}. Generating all stories from scratch." Proceed with full generation.

## Step 1.1: Journey Ingest

Read journey files to bootstrap story design with known flows, personas, and source files. Journey data prevents redundant discovery — pages already documented in journeys are enriched (selectors, assertions) rather than rediscovered from scratch.

> **Parallel execution:** Use parallel tool calls aggressively — all Glob and Read operations across journey files are independent and should run concurrently.

### Discover Journeys

1. Use the Glob tool to find all files matching `docs/journeys/*.md`.
2. If no journey files exist, log: "No journey files found in docs/journeys/. Proceeding with full discovery mode." Skip the rest of Step 1.1.
3. If JOURNEY_FILTER is set, filter to only the matching journey file (`docs/journeys/{JOURNEY_FILTER}.md`). If the file does not exist, log: "Journey '{JOURNEY_FILTER}' not found in docs/journeys/. Proceeding with full discovery." and skip the rest of Step 1.1.

### Parse Journey Files

For each journey file, read and extract:

- **Journey name:** derived from the filename (e.g., `profile-settings.md` → `profile-settings`)
- **Files:** from the YAML frontmatter `files:` array — the source files implementing this journey
- **Persona:** from the `**Persona:**` field
- **Goal:** from the `**Goal:**` field
- **Entry point:** from the `**Entry point:**` field (URL or trigger)
- **Success state:** from the `**Success state:**` field
- **Steps:** parse each numbered step section to extract:
  - Step name
  - URL (from `**URL:**` field)
  - Action (from `**Action:**` field)
  - "Should feel" (from `**Should feel:**` field)
  - "Should understand" (from `**Should understand:**` field)
  - Red flags (from `**Red flags:**` field)

### Build Journey Map

Assemble findings into a JOURNEY_MAP:

```
JOURNEY_MAP = {
  journey_name: {
    persona: string
    goal: string
    entry_point: string
    success_state: string
    files: string[]
    steps: [{ name, url, action, should_feel, should_understand, red_flags }]
    step_urls: string[]   // all unique URLs extracted from steps
  }
}
```

Also build a JOURNEY_URL_INDEX — a reverse map from URL to journey name(s), so Step 2 can quickly look up whether a visited page belongs to a journey.

4. Log: "Journey ingest: found {N} journey(s) covering {M} unique URLs."

### Cross-reference with Existing Stories (update mode only)

When update mode is active (Step 1 found existing YAML files):

5. For each existing story WITHOUT a `journey:` field, check whether its URL matches any entry in JOURNEY_URL_INDEX.
6. If a match is found, add to JOURNEY_LINK_SUGGESTIONS: `{ storyId, storyFile, storyUrl, suggestedJourney }`.
7. These suggestions are presented in Step 6 (Report) as a batch decision — they are not auto-applied.

## Step 1.5: Source Analysis

Identify and read component source files to extract behavioral contracts that are not visible from the rendered DOM alone — input constraints, validation schemas, state transitions, conditional rendering, error handling, and API patterns. Produces a per-page SourceContract that feeds into Step 3 design.

For the full procedure (component-file identification, journey-seeded source files, behavioral-signal extraction, graceful degradation), read `source-aware-design.md` in this skill's directory. For framework-specific extraction patterns (Zod/yup/Joi schemas, JSX heuristics, React introspection) and the SourceContract schema, read `source-analysis.md` in this skill's directory.

## Step 2: Explore

1. Create the output directory if it doesn't exist (use `mkdir -p` via the Bash tool — `-p` creates parent directories and silently no-ops if the directory already exists; plain `mkdir` does NOT create parents on macOS/Linux).
2. Use the `/claude-tweaks:browse` skill to open the site. The concrete command is `agent-browser --session <session-name> open <url>`. Choose `<session-name>` per the kebab-case convention (e.g., `stories-explore`, `stories-checkout`). Consider `agent-browser batch --session <name>` to bundle open + initial snapshot + reconnaissance screenshot in one process invocation when exploring multiple pages.
3. Capture an accessibility-tree snapshot via `agent-browser --session <name> snapshot -i -c` to understand the page structure. The snapshot returns elements with role, accessible name, text, label, placeholder, and `data-testid` — these are the only attributes used to build v2 locators.
4. Identify the main navigation, key pages, and interactive elements from the snapshot.
5. Follow links to discover major sections (limit to 5-8 pages to stay efficient).

### Per-Page Data Capture

6. For each page visited, note:
    - What the page is for
    - Key interactive elements (forms, buttons, links, menus)
    - **Semantic locator candidates** for each interactive element. See locator types and preference order in `story-examples.md`. Do NOT capture CSS classes, IDs, or XPath — schema v2 forbids them.
    - What a user would do here
    - What success/failure looks like
    - Whether the page has forms (for negative story generation)
    - Whether the page requires authentication

### Journey-Aware Exploration

When JOURNEY_MAP is non-empty (Step 1.1 found journeys):

For each page visited during exploration, check JOURNEY_URL_INDEX:

- **Page matches a journey step URL:** This page is already documented. Browsing is **enrichment-only**:
  - Capture semantic locator candidates from the accessibility-tree snapshot (same as standard exploration)
  - Verify the page structure matches the journey step description
  - Do NOT re-discover what the page is for, what success/failure looks like, or what the user does here — use the journey step's `action`, `should_feel`, and `should_understand` fields for that context
  - Log: "Page {url} matches journey '{journey_name}' step {N} — enrichment mode."

- **Page does NOT match any journey step URL:** Full discovery (existing behavior). This page has no journey context and gets standard exploration.

**Journey-guided navigation:** When a journey has step URLs that the standard exploration (items 4-5) would not naturally visit, add those URLs to the exploration queue. This ensures all journey-documented pages get enrichment passes. Journey enrichment pages are counted separately from the 5-8 page discovery cap — they are verification, not discovery.

### Auth Resolution (Auth Vault)

If any discovered page requires authentication, resolve a vault entry per the Auth Vault section above. Procedure:

1. **List existing vaults:** Run `agent-browser auth list`. Each row is a vault name plus a username.
2. **Vault matches the project** (e.g., `default`, `default-user`, project slug, admin/customer name): use that name. Stories reference it via `auth: { vault: "<name>" }`.
3. **No matching vault:** print the one-time command for the user to run in their own shell — do NOT search the project for credentials and do NOT ask the LLM:
   ```
   No matching auth vault found. To create one (the LLM will never see the password):

       agent-browser auth set <vault-name> <username> <password>

   Recommended vault name: `default-user` (or `<project-slug>-user`).

   When done, reply "ready" and I'll continue. To skip auth-gated stories for now, reply "skip".
   ```
   On `ready`: re-run `agent-browser auth list`, confirm, continue. On `skip`: tag stories needing auth as `needs-auth-vault` and skip them in Step 5 refinement.
4. **Multiple vaults exist** (e.g., `default-user`, `admin-user`): map each story's persona to the matching vault; fall back to `default-user` with a comment when no clean match.

### Legacy `auth.yml` detection

**Trigger:** `{OUTPUT_DIR}/auth.yml` exists from a v3 install.

When detected: read `migration.md` in this skill's directory for the split procedure (credentials → Auth Vault, server URLs → `servers.yml`).

### URL-to-Source-File Mapping

For each page visited during exploration, map its URL to the source files that render it. The mapping produces a `SOURCE_FILES` array per URL (relative paths, empty `[]` if none identified) that feeds into Step 3 design.

For the full procedure (route-path extraction, framework detection for Next.js App/Pages Router and SvelteKit/Remix, local-import discovery) and the gotchas (route groups, dynamic routes, monorepo subdirectories), read `source-aware-design.md` in this skill's directory.

## Step 3: Design Stories

1. Based on the exploration, design user stories grouped by persona. Each story must have:
    - **`id`** — a stable kebab-case identifier (e.g. `front-page-loads`, `checkout-flow-completes`)
    - **`description`** — a human-readable description of the journey (also accepted as `name` for back-compat)
    - **`url`** — the starting URL (the qa-agent auto-navigates here, so no "Navigate to X" step needed)
    - **`tags`** — categorize by type: `navigation`, `core`, `form`, `error-handling`, `smoke`, `critical`
    - **`priority`** — `high` for happy-path core flows, `medium` for secondary flows, `low` for edge cases
    - **`source_files`** — array of relative file paths from the URL-to-Source-File Mapping (Step 2). Populate from the `SOURCE_FILES` data collected during exploration for the story's URL. Use an empty array `[]` if no mapping was found.
    - **`auth`** — (optional) `{ vault: "<vault-name>" }` for stories that require login. See Auth Vault section.
    - **`steps`** — structured step array with `action`, semantic `locator`, optional `value`, and optional `verify` per the v2 schema

### Source-Aware Story Design

When a page has a non-empty SourceContract (from Step 1.5), use its signals to generate deeper stories — boundary-value stories for input constraints, state-transition stories, error-path stories, and conditional-rendering coverage. When the SourceContract is empty, generate stories from DOM exploration data only.

For the full per-signal generation rules (input boundaries, state transitions, error paths, conditional rendering), read `source-aware-design.md` in this skill's directory.

### Journey-Aware Story Design

When JOURNEY_MAP is non-empty (Step 1.1 found journeys), use journey data to inform story design for pages with journey context:

**a. Map journey steps to stories.** Each journey becomes a candidate for one or more stories. Prefer creating one story per journey that walks the full flow (entry point → success state) rather than one story per step — journeys are meant to be walked end-to-end. For journeys with many steps (6+), split into logical segments (e.g., "signup flow" and "first-project flow" from a longer onboarding journey).

**b. Set the `journey:` field.** Stories derived from a journey MUST include `journey: {journey-name}` in the YAML output. This field references `docs/journeys/{journey-name}.md` and enables coverage tracking and filtered test execution.

**c. Inherit source files.** When a story has `journey:` set, its `source_files` starts with the journey's `files:` frontmatter array, extended by component-level files from source analysis (Step 1.5) and URL-to-Source-File Mapping (Step 2). De-duplicate the merged list.

**d. Use journey step descriptions for assertions.** Transform journey step expectations into concrete verify assertions:
- `should_feel: "fast and effortless"` → verify assertions about page responsiveness, absence of loading spinners after action, minimal click count
- `should_understand: "their profile is saved"` → verify assertions for success feedback (toast, status message, redirect to expected page)
- `red_flags: "form clears on error"` → verify that form state is preserved after validation error

**e. Preserve journey step ordering.** Story steps should follow the journey step order. If a journey has steps 1 through N, the generated story should walk them in that sequence.

**f. Still generate negative stories.** Journey-aware pages still get negative story generation (when NEGATIVE=true). The journey's `red_flags` field provides additional negative scenarios beyond the standard form validation / 404 / auth negatives.

**When a page has NO journey context** (its URL does not appear in JOURNEY_URL_INDEX), generate stories from DOM exploration + source analysis only — the same behavior as before journey integration.

### Diff-Aware Design (when update mode is active)

2. Compare discovered pages against EXISTING_STORIES to classify each as **NEW**, **EXISTING** (unchanged → skip), or **STALE** (locators unresolvable, source files modified, or behavioral contracts changed → regenerate). Log the diff summary and emit STALE_LOCATORS / STALE_SOURCE_FILES warnings.

For the full staleness procedure (locator-resolution checks via `agent-browser find`, `git diff` source-file checks, behavioral-contract comparison against re-extracted SourceContract) and the warning templates, read `source-aware-design.md` in this skill's directory.

### Negative Story Generation (when NEGATIVE=true)

4. For each page discovered during exploration that has interactive elements, generate failure-path stories:

    **Form validation negatives** (for pages with forms):
    - Submit every discovered form with all required fields empty.
    - Enter injection test strings into text inputs: `<script>alert(1)</script>`, `'; DROP TABLE users; --`, `" onmouseover="alert(1)"`.
    - Enter extremely long strings (500+ characters) into text fields.
    - Submit forms with invalid formats (e.g. `notanemail` in email fields, `abc` in numeric fields).

    **Navigation negatives:**
    - Navigate to non-existent URLs derived from the site's URL pattern (e.g. `{URL}/this-page-does-not-exist-404`).
    - Verify the site shows a proper 404 or error page, not a blank screen or crash.

    **Interaction negatives:**
    - Click disabled buttons (if any were discovered) and verify nothing changes.
    - Attempt to interact with elements behind modals or overlays.

    **Auth negatives** (if auth-gated pages were discovered):
    - Access auth-required URLs without being logged in.
    - Verify redirect to login or an appropriate access-denied message.

    **Search negatives** (if search functionality exists):
    - Search with empty query.
    - Search with special characters and injection strings.
    - Search with extremely long query strings.

5. Negative story conventions:
    - IDs prefixed with `neg-` (e.g. `neg-empty-form-submit`, `neg-404-handling`, `neg-search-injection`).
    - Tagged with `negative` in addition to other relevant tags (e.g. `[negative, form]`, `[negative, error-handling]`).
    - Priority: `medium` by default. Security-related negatives (injection, XSS) get `priority: high`.
    - Verify assertions describe the EXPECTED graceful behavior (error message shown, form not submitted, redirect occurs, page doesn't crash).
    - If no negative scenarios are applicable for a page (purely static, no forms, no auth), skip negative generation for that page.

### Standard Design (all modes)

6. For stories that share common prerequisites:
    - Identify shared setup steps (e.g. authentication, navigation to a section)
    - Extract these into a file-level `setup` block
    - Use `requires` labels to indicate prerequisites (e.g. `requires: [auth]`)

    **Auth Vault references (v2):** When the story requires authentication, set the story-level `auth: { vault: "<vault-name>" }` field. This causes the runtime to invoke `agent-browser --session <story-id> auth use <vault-name>` after `open` and before the first action. The vault must already be set via `agent-browser auth set <vault-name> <username> <password>` (one-time, by user). Do NOT inline credentials in story YAML — the LLM never sees passwords.

    When the project's auth came from a legacy `auth.yml` and the user opted not to migrate (Step 2 Auth Resolution), continue to use the legacy `setup.auth: <profile>` reference. Do not invent vault names that do not exist.

7. Identify `depends_on` relationships between stories:
    - If story B only makes sense after story A passes (e.g. "view cart" depends on "add to cart"), set `depends_on: add-to-cart` on story B
    - Keep dependency chains short — prefer independent stories where possible

8. Story categories to consider:
    - **Navigation flows** — can the user find their way around?
    - **Core workflows** — the main thing each persona does (purchase, configure, create)
    - **Form interactions** — search, login, signup, data entry
    - **State transitions** — adding to cart, changing settings, submitting forms
    - **Error handling** — what happens with bad input, missing pages, unauthorized access

9. If PERSONA was specified, focus stories on that persona. If not, generate stories for the most obvious personas the site serves.

## Step 4: Write

1. Write one YAML file per persona or logical grouping. Every file starts with `schema_version: 2` at the top. Use this exact format:

```yaml
schema_version: 2

# Optional file-level blocks
setup:
  viewport: "1440x900"
  # Auth Vault reference (v2 — vault stores credentials encrypted, locally):
  auth: { vault: "default-user" }
  # Or use the file-level `setup.steps` for non-auth setup actions:
  steps:
    - action: navigate
      target: "https://example.com/setup-page"

teardown:
  steps:
    - action: click
      locator: { role: button, name: "Log out" }

# Story array
stories:
  - id: story-kebab-id
    description: "Descriptive name of the journey"
    url: "https://example.com/starting-page"
    journey: profile-settings                      # optional — refs docs/journeys/profile-settings.md
    auth: { vault: "default-user" }                # optional — overrides file-level setup.auth
    tags: [core, smoke]
    priority: high
    source_files:                                  # relative paths to source files that render this page
      - app/(dashboard)/starting-page/page.tsx
      - app/(dashboard)/starting-page/components/hero.tsx
    steps:
      - action: assert_visible
        locator: { role: heading, name: "Welcome" }
      - action: click
        locator: { role: button, name: "Add to cart" }
        verify: "Cart shows 1 item"
      - action: fill
        locator: { testid: "email-input" }
        value: "user@example.com"
        verify: "Email field accepts the value"
      - action: assert_visible
        locator: { text: "Order confirmed", exact: true }
```

**Locators** in `locator:` must be semantic. CSS selectors, XPath, and snapshot refs (`@eN`) are forbidden in YAML. See locator types and preference order in `story-examples.md`.

### Update Mode Write Rules

2. When update mode is active (existing stories detected in Step 1):
    - **EXISTING stories (unchanged):** Do NOT rewrite. Leave as-is in the YAML file.
    - **STALE stories (regenerated):** Read the existing YAML file. Replace only the regenerated stories, preserving unchanged stories in the same file. Preserve file-level `setup` and `teardown` blocks unless exploration found they need updating.
    - **NEW stories:** If a file for the same persona/grouping already exists, append the new stories to that file's `stories` array. If no file exists for this grouping, create a new file.
    - **NEVER** delete existing stories that were not regenerated — they may cover flows the exploration didn't re-encounter.
    - **ALWAYS** preserve existing story IDs exactly — they may be referenced in CI pipelines or dependency chains.

### Negative Story Write Rules

3. When NEGATIVE is true:
    - Place negative stories AFTER all positive stories in the `stories` array.
    - If there are more than 5 negative stories for a single persona/grouping, write them to a separate file: `{OUTPUT_DIR}/{site-name}-{persona}-negative.yaml`.
    - In update mode, existing negative stories (IDs starting with `neg-`) are included in the diff comparison — they get the same stale-selector treatment as positive stories.

4. File naming: `{OUTPUT_DIR}/{site-name}-{persona-or-area}.yaml`
    - Examples: `stories/myapp-customer.yaml`, `stories/myapp-admin.yaml`, `stories/myapp-customer-negative.yaml`

5. Close all browser sessions when done writing.

## Step 4.5: Story Self-Review

After writing, look at the YAML with fresh eyes. Fix issues inline — this is the cheap pass before Step 5's DOM-validation pass.

1. **Selector quality** — every locator should be semantic (`role`, `label`, `text`) or testid, never a brittle structural path (`div > div:nth-child(3) > button`). Brittle locators caught here are saved from breaking in CI.
2. **Assertion specificity** — every step asserts something concrete. "Page loads" is too vague; "URL contains `/dashboard` and `text:Welcome` is visible" is actionable.
3. **Persona coherence** — each story's actions are consistent with its persona's permissions. Don't have a logged-out persona clicking a settings link that requires auth.
4. **Source-aware integrity** — when stories are source-aware (Step 1.5 ran), the asserted outcomes match what the SourceContract said the code does. A story that asserts a behavior the source doesn't implement is a placeholder story.

If REFINE=true, Step 5 will catch DOM-level issues this pass missed. If REFINE=false, this is your only check — fix anything you find.

## Step 5: Refine (when REFINE=true)

Skip entirely if `refine=false`.

### 5a. Quick Validation Pass

1. Select a sample of stories to validate from the stories just written or regenerated (not unchanged existing stories):
    - All `priority: high` stories.
    - Up to 3 randomly selected `priority: medium` stories.
    - Skip `priority: low` stories in the validation sample.
    - Maximum 10 stories total.
    - When NEGATIVE is also active, include a mix of positive and negative stories.

2. For each selected story, validate against the live app using agent-browser:
    a. `agent-browser --session <story-id> open <story.url>` (kebab-case session, derived from the story id).
    b. If the story declares `auth: { vault: "<name>" }`: `agent-browser --session <story-id> auth use <name>`.
    c. `agent-browser --session <story-id> snapshot -i -c` to get the accessibility tree.
    d. For each step, attempt execution:
       - **Locator resolution:** Run `agent-browser --session <story-id> find <type> <args>` for the step's semantic locator. If `find` returns 0 matches, record failure: `{ storyId, stepIndex, issue: "locator_unresolved", locator }`. If `find` returns >1 matches, record: `{ storyId, stepIndex, issue: "locator_ambiguous", locator, matchCount }` — flag for disambiguation. If exactly 1, capture the resulting `@eN` ref and proceed.
       - **Action execution:** Run the action against the resolved ref (e.g., `click @e3`, `fill @e7 "user@example.com"`). If it fails, record: `{ storyId, stepIndex, issue: "action_failed", action, error }`.
       - **Verify assertion:** If the step has `verify` or is `assert_visible`, evaluate against the post-action snapshot. If the expected element/text is not present, record: `{ storyId, stepIndex, issue: "assertion_mismatch", expected, actual }`.
    e. **On any step failure:** capture trace before closing — `agent-browser --session <story-id> trace save traces/<story-id>/<timestamp>.zip`. Attach the trace path to the failure record. Then close the session.
    f. **On success:** `agent-browser --session <story-id> close`.

3. Collect all validation failures into a FAILURES list. Each failure record includes the trace path when one was captured.

### 5b. Self-Correction Round

4. If FAILURES is empty:
    - Log: "Refinement: All {N} sampled stories validated successfully. No corrections needed."
    - Skip to Step 6.

5. If FAILURES is non-empty:
    - For each failed story:
      a. Log the failure details: "Story '{storyId}' failed validation — Step {stepIndex}: {issue}. Trace: {tracePath}"
      b. Re-open the story's URL in a fresh session and run `agent-browser --session <story-id> snapshot -i -c` to capture the current accessibility tree.
      c. Regenerate ONLY the failed story with corrected semantic locators, actions, and assertions based on the live snapshot. For ambiguous locators, prefer adding `name` (for `role`-only locators), switching to `testid` if available, or scoping by an enclosing `role: region` / `role: form`.
      d. Rewrite the corrected story into the YAML file, replacing the draft version.

6. Log the correction summary: "Refinement: {N} stories validated, {M} corrected. Trace files captured for {K} initial failures: traces/<story-id>/<timestamp>.zip."

### 5c. Persistent Failure Handling

7. If any stories still fail after the correction round:
    - Do NOT delete them. Keep them in the YAML.
    - Add a YAML comment above the story: `# REFINEMENT_WARNING: This story failed automated validation. Manual review recommended. Trace: traces/<story-id>/<timestamp>.zip`
    - Add tag `needs-review` to the story's tags array.
    - Log: "Refinement: {K} stories still failing after correction — tagged 'needs-review' for manual review. See trace files for inspection: `agent-browser trace view <path>`."

8. Maximum one correction round. Do not loop further. (agent-browser's token-efficient snapshot+find pattern reduces context cost vs. earlier CSS-selector validation, but the cap stays in place to avoid infinite loops on genuinely broken pages.)

## Step 6: Report and Handoff

1. Report what was generated:
    - Number of story files created or updated
    - Number of stories per file
    - Summary of personas/areas covered
    - The output directory path

    **Source analysis additions:**
    - Number of pages with non-empty SourceContracts
    - Number of source-aware stories generated (boundary-value, state transition, error path, conditional rendering)
    - Pages where source analysis was skipped (unsupported framework, no source files found) with reason

    **Update mode additions:**
    - Number of existing stories unchanged
    - Number of stories regenerated (with reasons: stale locators, modified source files, behavioral contract changes)
    - Number of new stories added
    - Stale locator warnings (full list with story IDs and locator specs)
    - Behavioral contract change warnings (full list with story IDs and change descriptions)
    - **v1 → v2 migration:** when v1 detection ran, report the choice the user made (regenerated all / showed diff first / cancelled) and the count of stories migrated.

    **Negative additions:**
    - Number of negative stories generated
    - Categories covered (form validation, 404, auth, search, etc.)
    - Note: "Filter negative stories in validation: `/claude-tweaks:test qa tag=negative`"

    **Refine additions:**
    - Number of stories validated in refinement pass
    - Number corrected
    - Number with persistent failures (tagged `needs-review`) and a list of trace paths for inspection: `agent-browser trace view <path>`

    **Journey coverage (when journeys exist):**

    When JOURNEY_MAP is non-empty, build the coverage report per `coverage-report.md` in this skill's directory — produce the Journey Coverage table, the Orphaned Stories list, and (in update mode) the JOURNEY_LINK_SUGGESTIONS auto/interactive flow as a separate batch decision.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| {Generated/Updated/Deleted} | {story description} — `{yaml file}` | — |

One row per story file written, updated, or deleted. Omit unchanged files.

### Next Actions

Emit 2-4 numbered options based on context — include the smoke option only when at least one story is tagged `smoke`; include the `affected` option only when update mode regenerated stories; include the journey option only when a journey was the dominant story source. One option marked **(Recommended)**.

1. `/claude-tweaks:test qa` — validate all {N} stories against the running app **(Recommended)**
2. `/claude-tweaks:test qa tag=smoke` — quick pass on {N} smoke stories first (when smoke stories exist)
3. `/claude-tweaks:test qa affected` — validate only changed stories (when update mode regenerated stories)
4. `/claude-tweaks:test qa journey={name}` — validate {N} stories for the {name} journey (when journeys exist)

## Examples

For complete YAML examples covering DOM-only stories, source-aware stories (with boundary-value and error-path coverage), and journey-aware stories, read `story-examples.md` in this skill's directory.

## Guidelines

- Keep stories focused — one journey per story, 3-8 steps each
- Always assign an `id` (kebab-case, stable across regeneration) and a `description`
- Use concrete element names and text found during exploration, not generic descriptions
- **Locators are semantic only** — never CSS, never XPath, never `@eN` snapshot refs. Refs are session-scoped and resolved at runtime via `agent-browser find`. See locator types and preference order in `story-examples.md`.
- The `url` field handles initial navigation — do NOT include "Navigate to URL" as a first step
- Prefer verifiable assertions ("Verify at least 3 items visible") over vague ones ("Verify page looks right")
- Tag stories appropriately: `smoke` for quick health checks, `critical` for business-critical flows
- Set `priority: high` for happy-path core flows, `medium` for secondary paths, `low` for edge cases
- Use `depends_on` sparingly — only when story B literally cannot run without story A succeeding first
- Don't generate stories for flows that require real credentials unless an Auth Vault entry exists or the user has agreed to set one
- For auth-gated stories, use `auth: { vault: "<name>" }` referencing a vault the user has set via `agent-browser auth set`. The LLM never sees credentials.
- Negative stories: always prefix IDs with `neg-`, tag with `negative`, and assert on graceful failure behavior
- Always populate `source_files` on every story — use the URL-to-Source-File Mapping from Step 2. If no source files can be identified, use an empty array `[]`. The field must always be present.
- In update mode, never delete existing stories that weren't re-encountered
- In update mode, preserve existing story IDs exactly
- Refinement is capped at one correction round to avoid runaway token usage
- On any step failure during refinement, capture trace via `agent-browser --session <name> trace save traces/<session>/<timestamp>.zip` before closing the session and include the path in the failure record
- When journey files exist in `docs/journeys/`, always ingest them before browsing — journey data bootstraps story design and prevents redundant discovery
- Always set `journey:` on stories derived from a journey file — this enables coverage tracking and filtered test execution via `/test qa journey={name}`
- When a story has `journey:` set, seed `source_files` from the journey's `files:` frontmatter before extending with component-level files from source analysis
- Every generated YAML file starts with `schema_version: 2` at the top — required for v2 compatibility checks

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Generating stories without browsing the site first | Stories must be grounded in actual page structure and the live accessibility-tree snapshot |
| Using CSS selectors, XPath, IDs, or class names in v2 schema | Schema v2 is semantic-only — see locator types in `story-examples.md`. CSS is brittle and forbidden. |
| Storing `@eN` snapshot refs in story YAML | Refs are session-scoped and regenerate every snapshot — they are runtime-only. Always store the semantic locator and resolve to a ref at execution time via `agent-browser find`. |
| Skipping the v1 detection prompt and silently parsing legacy files | v1 stories use CSS selectors that schema v2 forbids — silent parsing produces broken stories. Always run the v1 detection / regeneration UX when `schema_version: 2` is missing. |
| Inlining credentials in story YAML | Use `auth: { vault: "<name>" }` referencing an Auth Vault entry. The LLM never sees passwords. Inline credentials risk accidental commits. |
| Deleting existing stories in update mode | Existing stories may cover flows the exploration didn't re-encounter |
| Vague verify assertions ("page looks right") | QA agents need concrete, testable assertions |
| Including "Navigate to URL" as a first step | The `url` field handles initial navigation automatically |
| Skipping form-page negative coverage when NEGATIVE=true | When negative generation is enabled, forms with user input should always get validation-failure stories — they catch real security and UX issues. (Choosing `negative=false` is an explicit opt-out, not an anti-pattern.) |
| Running more than one refinement correction round | Diminishing returns and high token cost — cap at one round |
| Closing a session on step failure without capturing trace first | Failure records without a trace path are not actionable — always run `agent-browser --session <name> trace save` before `close` on failure |
| Blocking story generation when source analysis fails | Source analysis enhances stories but must never be a hard gate — degrade gracefully to DOM-only |
| Following imports beyond 3 levels of depth | Signal-to-noise ratio drops and analysis time increases — use what you have at the depth limit |
| Generating source-aware stories for non-user-triggerable conditionals | Conditionals based on server config or feature flags cannot be exercised through the browser |
| Browsing from scratch when journey files document the same pages | Journey files already contain URLs, personas, steps, and success states — ingest them in Step 1.1 and enrich with locators and assertions rather than rediscovering everything |
| Auto-linking existing stories to journeys without user confirmation | Journey link suggestions are recommendations presented in Step 6 — the user decides whether to add `journey:` fields to existing stories |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:browse` | /stories speaks /browse's operation vocabulary (open, snapshot, find, click, fill, screenshot, trace, close) and follows /browse's session-naming, screenshot-path, and trace-path conventions. The concrete `agent-browser` syntax lives in `agent-browser-reference.md` in the /browse directory. |
| `/claude-tweaks:visual-review` | /visual-review can share a session with /stories when run back-to-back against the same URL. /visual-review's annotated screenshots reference the same accessibility-tree refs that /stories' locators resolve to. |
| `/claude-tweaks:test` | `/test qa` and `/test all` validate the stories that /stories generates via the `qa-agent`. `/test qa journey={name}` filters to stories for a specific journey. Failed stories surface trace paths captured during /stories refinement. Both skills consume `dev-url-detection.md` from `skills/_shared/` for auto-detection. |
| `/claude-tweaks:review` | /review gates on /test passing (which includes QA when stories exist). /review checks journey-to-story coverage in its code review — uncovered journey steps and orphaned stories are surfaced as informational findings. |
| `/claude-tweaks:journeys` | /journeys creates journey files (`docs/journeys/*.md`) that /stories ingests in Step 1.1 for journey-aware story generation. Stories reference their source journey via the `journey:` field. |
| `/claude-tweaks:build` | Runs BEFORE /stories — recommends /stories when UI files change. /build may create journey files via /journeys that /stories then ingests. |
| `/claude-tweaks:flow` | Auto-triggers /stories between build and test when UI files change (unless `no-stories`). Both consume `dev-url-detection.md` from `skills/_shared/` for URL resolution. |
| `/claude-tweaks:init` | Detects `agent-browser` availability during setup; without it /stories' browse-exploration and refinement steps cannot run (degrades gracefully — generates from journey/source-analysis data only). |
| `qa-agent` (`agents/qa-agent.md`) | Runtime executor for /stories' YAML — opens an agent-browser session per story, uses Auth Vault for `auth: { vault: ... }` references, and captures trace-on-failure. /stories' refinement step prefigures this same execution path. |
| `/claude-tweaks:help` | /help recommends /stories when UI files change and no stories exist; /stories' Next Actions block routes back to `/test qa` which /help surfaces as next-up |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
