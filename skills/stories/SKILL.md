---
name: claude-tweaks:stories
description: Use when generating or updating user story YAML files for UI testing — browses a site, discovers flows, creates structured stories with diff-aware updates, negative testing, and self-validation. Keywords - stories, generate, create, user journey, persona, QA, testing.
allowed-tools: Bash
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a recommended next step, not a navigation menu.


# Stories

Browse a website, understand its structure and flows, and generate user story YAML files for UI testing. Stories describe journeys for any persona — customers, admins, developers, operators.

```
/claude-tweaks:capture → ... → /claude-tweaks:build → [ /claude-tweaks:stories ] → /claude-tweaks:review → /claude-tweaks:wrap-up
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

- **URL:** (required) the site to browse and generate stories for
- **PERSONA:** (optional) `persona=<name>` — the type of user to generate stories for (e.g. "customer", "admin", "developer"). If not specified, infer appropriate personas from the site's structure.
- **OUTPUT_DIR:** (optional) `dir=<path>` — directory to write stories to. Default: `stories/`
- **FOCUS:** (optional) `focus=<area>` — specific area or flow to focus on (e.g. "checkout", "settings", "onboarding")
- **BROWSER:** (optional) `browser=<value>` — browser backend preference. Default: `auto`. Values: `auto`, `playwright`, `chrome`.
- **REFINE:** (optional) `refine=true|false` — validate sample stories and self-correct. Default: `true`.
- **NEGATIVE:** (optional) `negative=true|false` — generate failure-path negative stories. Default: `true`.

**Keyword detection rules (applied to $ARGUMENTS):**
- `refine=false` → REFINE = `false` (default is `true`)
- `negative=false` → NEGATIVE = `false` (default is `true`)
- `browser=<value>` → BROWSER = `<value>`
- `dir=<path>` → OUTPUT_DIR = `<path>`
- `persona=<name>` → PERSONA = `<name>`
- `focus=<area>` → FOCUS = `<area>`
- Remaining non-keyword argument → URL

**Auto-detected behavior:**
- **Update mode:** If `{OUTPUT_DIR}/*.yaml` files already exist, automatically enter diff-aware mode. No keyword needed — the skill detects existing stories and only generates new or changed ones.

## Step 1: Ingest

Gather pre-existing information before browsing.

### Diff-Aware Ingestion (auto-detected)

1. Use the Glob tool to check for existing YAML files in OUTPUT_DIR matching `{OUTPUT_DIR}/*.yaml`.
2. If YAML files exist, enter **update mode**:
   a. Read each YAML file and parse the `stories` array.
   b. Build an EXISTING_STORIES map: `{ storyId -> { url, selectors[], steps[], sourceFile } }` — extract all selectors from each story's steps.
   c. Build an EXISTING_URLS set: all unique `url` values across existing stories.
   d. Log: "Update mode: found {N} existing stories across {M} files in {OUTPUT_DIR}."
3. If no YAML files found, log: "No existing stories in {OUTPUT_DIR}. Generating all stories from scratch." Proceed with full generation.

## Step 2: Explore

4. Create the output directory if it doesn't exist: `mkdir -p {OUTPUT_DIR}`
5. Use the `/claude-tweaks:browse` skill to open the site.
6. Take a snapshot to understand the page structure.
7. Identify the main navigation, key pages, and interactive elements.
8. Follow links to discover major sections (limit to 5-8 pages to stay efficient).

### Per-Page Data Capture

9. For each page visited, note:
    - What the page is for
    - Key interactive elements (forms, buttons, links, menus)
    - **CSS selectors** for key elements (IDs, classes, data attributes)
    - **ARIA roles and labels** for accessibility-driven elements
    - **Element identifiers** from the snapshot (ref attributes, text content)
    - What a user would do here
    - What success/failure looks like
    - Whether the page has forms (for negative story generation)
    - Whether the page requires authentication

## Step 3: Design Stories

10. Based on the exploration, design user stories grouped by persona. Each story must have:
    - **`id`** — a stable kebab-case identifier (e.g. `front-page-loads`, `checkout-flow-completes`)
    - **`name`** — a human-readable description of the journey
    - **`url`** — the starting URL (the qa-agent auto-navigates here, so no "Navigate to X" step needed)
    - **`tags`** — categorize by type: `navigation`, `core`, `form`, `error-handling`, `smoke`, `critical`
    - **`priority`** — `high` for happy-path core flows, `medium` for secondary flows, `low` for edge cases
    - **`browser`** — (optional) `playwright`, `chrome`, or omit for `auto`. Only set `browser: chrome` on stories that genuinely need the user's real Chrome session.
    - **`steps`** — structured step array with actions, selectors, and assertions

### Diff-Aware Design (when update mode is active)

11. Compare discovered pages against EXISTING_STORIES:
    - For each discovered page URL:
      - If a story with this URL already exists in EXISTING_STORIES -> mark as **EXISTING**.
      - If no story exists for this URL -> mark as **NEW**.
    - For each EXISTING story, compare the selectors noted during exploration against the selectors in the existing story's steps:
      - If a selector from the existing story was NOT found in the current DOM snapshot -> mark as **STALE** and add to STALE_SELECTORS list.
    - **EXISTING** stories with no stale selectors: **SKIP** — do not regenerate.
    - **STALE** stories (existing but selectors don't match): **REGENERATE** with updated selectors from current DOM.
    - **NEW** pages: generate stories as normal.

12. Log the diff summary:
    - "Update mode: {N} existing stories unchanged, {M} stories regenerated (stale selectors), {K} new stories to generate."
    - If STALE_SELECTORS is non-empty, emit a warning:
      ```
      WARNING: The following selectors no longer match the live DOM:
        - Story '{storyId}', step '{stepDescription}': selector '{selector}' — not found in DOM
      ```

### Negative Story Generation (when NEGATIVE=true)

13. For each page discovered during exploration that has interactive elements, generate failure-path stories:

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

14. Negative story conventions:
    - IDs prefixed with `neg-` (e.g. `neg-empty-form-submit`, `neg-404-handling`, `neg-search-injection`).
    - Tagged with `negative` in addition to other relevant tags (e.g. `[negative, form]`, `[negative, error-handling]`).
    - Priority: `medium` by default. Security-related negatives (injection, XSS) get `priority: high`.
    - Verify assertions describe the EXPECTED graceful behavior (error message shown, form not submitted, redirect occurs, page doesn't crash).
    - If no negative scenarios are applicable for a page (purely static, no forms, no auth), skip negative generation for that page.

### Standard Design (all modes)

15. For stories that share common prerequisites:
    - Identify shared setup steps (e.g. authentication, navigation to a section)
    - Extract these into a file-level `setup` block
    - Use `requires` labels to indicate prerequisites (e.g. `requires: [auth]`)

16. Identify `depends_on` relationships between stories:
    - If story B only makes sense after story A passes (e.g. "view cart" depends on "add to cart"), set `depends_on: add-to-cart` on story B
    - Keep dependency chains short — prefer independent stories where possible

17. Story categories to consider:
    - **Navigation flows** — can the user find their way around?
    - **Core workflows** — the main thing each persona does (purchase, configure, create)
    - **Form interactions** — search, login, signup, data entry
    - **State transitions** — adding to cart, changing settings, submitting forms
    - **Error handling** — what happens with bad input, missing pages, unauthorized access

18. If PERSONA was specified, focus stories on that persona. If not, generate stories for the most obvious personas the site serves.

## Step 4: Write

19. Write one YAML file per persona or logical grouping. Use this exact format:

```yaml
# Optional file-level blocks
setup:
  viewport: "1440x900"
  auth:
    url: "https://example.com/login"
    username: "${AUTH_USER}"
    password: "${AUTH_PASS}"
  steps:
    - action: navigate
      target: "https://example.com/setup-page"

teardown:
  steps:
    - action: click
      target: "Logout button"
      selector: "button#logout"

# Story array
stories:
  - id: story-kebab-id
    name: "Descriptive name of the journey"
    url: "https://example.com/starting-page"
    tags: [core, smoke]
    priority: high
    browser: chrome                               # optional — only when Chrome is needed
    steps:
      - verify: "Key element is visible on the page"
      - action: click
        target: "Element description from exploration"
        selector: "css-selector-if-captured"
        verify: "Expected result after clicking"
      - action: fill
        target: "Input field description"
        selector: "input#field-id"
        value: "text to enter"
        verify: "Field shows entered value"
```

### Update Mode Write Rules

20. When update mode is active (existing stories detected in Step 1):
    - **EXISTING stories (unchanged):** Do NOT rewrite. Leave as-is in the YAML file.
    - **STALE stories (regenerated):** Read the existing YAML file. Replace only the regenerated stories, preserving unchanged stories in the same file. Preserve file-level `setup` and `teardown` blocks unless exploration found they need updating.
    - **NEW stories:** If a file for the same persona/grouping already exists, append the new stories to that file's `stories` array. If no file exists for this grouping, create a new file.
    - **NEVER** delete existing stories that were not regenerated — they may cover flows the exploration didn't re-encounter.
    - **ALWAYS** preserve existing story IDs exactly — they may be referenced in CI pipelines or dependency chains.

### Negative Story Write Rules

21. When NEGATIVE is true:
    - Place negative stories AFTER all positive stories in the `stories` array.
    - If there are more than 5 negative stories for a single persona/grouping, write them to a separate file: `{OUTPUT_DIR}/{site-name}-{persona}-negative.yaml`.
    - In update mode, existing negative stories (IDs starting with `neg-`) are included in the diff comparison — they get the same stale-selector treatment as positive stories.

22. File naming: `{OUTPUT_DIR}/{site-name}-{persona-or-area}.yaml`
    - Examples: `stories/myapp-customer.yaml`, `stories/myapp-admin.yaml`, `stories/myapp-customer-negative.yaml`

23. Close all browser sessions when done writing.

## Step 5: Refine (when REFINE=true)

Skip entirely if `refine=false`.

### 5a. Quick Validation Pass

24. Select a sample of stories to validate from the stories just written or regenerated (not unchanged existing stories):
    - All `priority: high` stories.
    - Up to 3 randomly selected `priority: medium` stories.
    - Skip `priority: low` stories in the validation sample.
    - Maximum 10 stories total.
    - When NEGATIVE is also active, include a mix of positive and negative stories.

25. For each selected story, use the `/claude-tweaks:browse` skill to validate:
    a. Navigate to the story's URL.
    b. For each step, attempt execution:
       - If the step has a `selector`: try to locate it on the page. If not found, record failure: `{ storyId, stepIndex, issue: "selector_not_found", selector, target }`.
       - If the step has an `action`: attempt it. If it fails, record: `{ storyId, stepIndex, issue: "action_failed", action, error }`.
       - If the step has a `verify`: evaluate the assertion against page state. If it doesn't match, record: `{ storyId, stepIndex, issue: "assertion_mismatch", expected, actual }`.
    c. Close the session.

26. Collect all validation failures into a FAILURES list.

### 5b. Self-Correction Round

27. If FAILURES is empty:
    - Log: "Refinement: All {N} sampled stories validated successfully. No corrections needed."
    - Skip to Step 6.

28. If FAILURES is non-empty:
    - For each failed story:
      a. Log the failure details: "Story '{storyId}' failed validation — Step {stepIndex}: {issue}"
      b. Re-browse the story's URL to get a fresh snapshot.
      c. Regenerate ONLY the failed story with corrected selectors, actions, and assertions based on the actual page state.
      d. Rewrite the corrected story into the YAML file, replacing the draft version.

29. Log the correction summary: "Refinement: {N} stories validated, {M} corrected."

### 5c. Persistent Failure Handling

30. If any stories still fail after the correction round:
    - Do NOT delete them. Keep them in the YAML.
    - Add a YAML comment above the story: `# REFINEMENT_WARNING: This story failed automated validation. Manual review recommended.`
    - Add tag `needs-review` to the story's tags array.
    - Log: "Refinement: {K} stories still failing after correction — tagged 'needs-review' for manual review."

31. Maximum one correction round. Do not loop further.

## Step 6: Report and Handoff

32. Report what was generated:
    - Number of story files created or updated
    - Number of stories per file
    - Summary of personas/areas covered
    - The output directory path

    **Update mode additions:**
    - Number of existing stories unchanged
    - Number of stories regenerated (with reasons: stale selectors)
    - Number of new stories added
    - Stale selector warnings (full list with story IDs and selectors)

    **Negative additions:**
    - Number of negative stories generated
    - Categories covered (form validation, 404, auth, search, etc.)
    - Note: "Filter negative stories in validation: `/claude-tweaks:review qa tag=negative`"

    **Refine additions:**
    - Number of stories validated in refinement pass
    - Number corrected
    - Number with persistent failures (tagged `needs-review`)

**Recommended next:** `/claude-tweaks:review qa` — validate all stories against the running app.

If update mode: also suggest `/claude-tweaks:review qa tag=smoke` to validate only smoke tests first.

## Example

Input: `/claude-tweaks:stories https://news.ycombinator.com/`

Output file: `stories/hackernews-reader.yaml`
```yaml
stories:
  - id: front-page-loads
    name: "Front page loads with posts"
    url: "https://news.ycombinator.com/"
    tags: [smoke, navigation]
    priority: high
    steps:
      - verify: "At least 10 posts are visible, each with a title and a link"
      - verify: "Each post shows a rank number, score, and comment count"

  - id: navigate-to-page-two
    name: "Navigate to page two and back"
    url: "https://news.ycombinator.com/"
    tags: [navigation]
    priority: medium
    steps:
      - verify: "Front page loads with posts"
      - action: click
        target: "More link at the bottom of the page"
        selector: "a.morelink"
        verify: "Page 2 loads with a new set of posts"
      - action: press
        target: "Browser back"
        value: "Alt+ArrowLeft"
        verify: "Page 1 loads again with the original posts"

  - id: neg-404-handling
    name: "Non-existent page shows error gracefully"
    url: "https://news.ycombinator.com/item?id=9999999999"
    tags: [negative, error-handling]
    priority: medium
    steps:
      - verify: "Page shows an error message or 'No such item' — not a blank screen or crash"
```

## Guidelines

- Keep stories focused — one journey per story, 3-8 steps each
- Always assign an `id` (kebab-case, stable across regeneration) and a `name`
- Use concrete element names and text found during exploration, not generic descriptions
- Include `selector` hints whenever CSS selectors, IDs, or ARIA roles are captured during exploration
- The `url` field handles initial navigation — do NOT include "Navigate to URL" as a first step
- Prefer verifiable assertions ("Verify at least 3 items visible") over vague ones ("Verify page looks right")
- Tag stories appropriately: `smoke` for quick health checks, `critical` for business-critical flows
- Set `priority: high` for happy-path core flows, `medium` for secondary paths, `low` for edge cases
- Use `depends_on` sparingly — only when story B literally cannot run without story A succeeding first
- Don't generate stories for flows that require real credentials unless the user provides them
- Only set `browser: chrome` on stories that genuinely need the user's real Chrome session
- Negative stories: always prefix IDs with `neg-`, tag with `negative`, and assert on graceful failure behavior
- In update mode, never delete existing stories that weren't re-encountered
- In update mode, preserve existing story IDs exactly
- Refinement is capped at one correction round to avoid runaway token usage

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Generating stories without browsing the site first | Stories must be grounded in actual page structure and selectors |
| Deleting existing stories in update mode | Existing stories may cover flows the exploration didn't re-encounter |
| Vague verify assertions ("page looks right") | QA agents need concrete, testable assertions |
| Defaulting all stories to `browser: chrome` | Most stories should use `auto` — only set chrome when the real browser session is needed |
| Including "Navigate to URL" as a first step | The `url` field handles initial navigation automatically |
| Skipping negative stories for forms with user input | Form validation negatives catch real security and UX issues |
| Running more than one refinement correction round | Diminishing returns and high token cost — cap at one round |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Runs BEFORE /stories — recommends /stories when UI files change |
| `/claude-tweaks:review` | QA mode (`/review qa`) validates the stories that /stories generates |
| `/claude-tweaks:browse` | Used BY /stories to explore sites and validate generated stories |
| `/claude-tweaks:flow` | Can include /stories as an optional step between build and review |
| `/claude-tweaks:setup` | Step 6 configures the browser backends that /stories depends on (via /browse) |
