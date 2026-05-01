# Agent Browser Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate claude-tweaks from `playwright-cli` + Chrome MCP to Vercel `agent-browser` as the single browser backend, redesign `/stories` around accessibility-tree semantic locators, and ship as v4.0.0.

**Architecture:** `/browse` becomes a conventions skill (no backend routing). Single backend: `agent-browser`. `/stories` adopts `schema_version: 2` with semantic locators only (`role`/`name`, `testid`, `text`, `label`, `placeholder`). New capabilities adopted: `batch`, `set viewport/device`, `screenshot --annotate`, opt-in `react` introspection, `auth` vault, `vitals`, `trace`-on-failure. v1 stories detected with guided regeneration UX.

**Tech Stack:** Markdown skill files with YAML frontmatter. No application code or test suite — verification is grep-based (absence of stale refs, presence of new patterns) and structural (bidirectional Relationship tables, lifecycle diagram sync).

**Reference:** All tasks reference `docs/superpowers/specs/2026-05-01-agent-browser-migration-design.md` (the approved design spec). Read it before starting any task.

---

## Task ordering

Tasks 1-3 (the new `/browse` foundation) must run first because consumer skills reference the new operation vocabulary. Tasks 4-13 can run in any order but are listed in dependency order to keep diffs reviewable. Task 14 (top-level: README + plugin.json) and Task 15 (cross-reference audit) are last.

---

### Task 1: Create `skills/browse/agent-browser-reference.md`

**Files:**
- Create: `skills/browse/agent-browser-reference.md`

Create a single reference file documenting the operation vocabulary and advanced commands `claude-tweaks` consumer skills use. Do NOT enumerate the full 80+ command surface of `agent-browser`; cover only what other skills in this repo need.

- [ ] **Step 1: Write the file with these sections, in order**

```markdown
# agent-browser reference

Reference for the `agent-browser` commands used by claude-tweaks skills. The full
agent-browser CLI is broader; this file documents only what consumer skills speak.

## Daemon

The agent-browser daemon is implicit. The first `agent-browser` command auto-starts
it on port 4848. Skills do not manage the daemon. Recovery on crash:
`agent-browser doctor`. Dashboard is a human debug surface at
`http://localhost:4848` — do not poll it programmatically.

## Sessions

Named sessions provide isolation. One session per parallel agent, one per QA story
instance. Session names are kebab-case derived from purpose
(`checkout-flow`, `signup-neg-1`).

| Operation | Command |
|---|---|
| Open a session at a URL | `agent-browser --session <name> open <url>` |
| Close a session | `agent-browser --session <name> close` |
| List active sessions | `agent-browser session list` |

## Operation vocabulary

The translation table consumer skills speak. Use these abstract operation names in
documentation; translate to the concrete command at invocation.

| Operation | Command |
|---|---|
| open | `agent-browser --session <name> open <url>` |
| snapshot (interactive, compact) | `agent-browser --session <name> snapshot -i -c` |
| find by role + name | `agent-browser --session <name> find role <role> --name <name>` |
| find by testid | `agent-browser --session <name> find testid <id>` |
| find by text | `agent-browser --session <name> find text <text> [--exact]` |
| find by label | `agent-browser --session <name> find label <label>` |
| find by placeholder | `agent-browser --session <name> find placeholder <text>` |
| click | `agent-browser --session <name> click <ref>` |
| fill | `agent-browser --session <name> fill <ref> <value>` |
| type | `agent-browser --session <name> type <ref> <text>` |
| screenshot | `agent-browser --session <name> screenshot --filename <path>` |
| annotated screenshot | `agent-browser --session <name> screenshot --annotate --filename <path>` |
| close | `agent-browser --session <name> close` |

## Viewport and device

Replaces the `PLAYWRIGHT_MCP_VIEWPORT_SIZE` env var. Cross-platform — no Windows
PowerShell/CMD workaround needed.

| Operation | Command |
|---|---|
| Set viewport | `agent-browser --session <name> set viewport <width> <height>` |
| Set device | `agent-browser --session <name> set device "<device-name>"` |

## Batch mode

Run multiple operations in a single process invocation against one session.
Reduces token + latency overhead for multi-step walks.

```
agent-browser batch --session <name> "open <url>" "snapshot -i -c" "screenshot --filename <path>"
```

Anti-pattern: do not batch across sessions. Each `batch` invocation is one session's
lifecycle.

## React introspection (opt-in)

Used by `/stories` source-aware mode (Step 1.5) when the source files are
`.tsx`/`.jsx`. Silent skip on non-React apps.

| Operation | Command |
|---|---|
| React component tree | `agent-browser --session <name> react tree` |
| Inspect component at ref | `agent-browser --session <name> react inspect <ref>` |

## Vitals

Captures Web Vitals (LCP, CLS, INP, TTFB, FCP). Used by `/visual-review` for the
"Performance" finding category.

```
agent-browser --session <name> vitals
```

## Trace (on failure)

Capture a trace before closing a session when a step fails. Output zip file.
Path convention: `traces/<session>/<timestamp>.zip`.

```
agent-browser --session <name> trace save traces/<session>/<timestamp>.zip
```

View a trace: `agent-browser trace view <path>`.

No retention policy — users manage cleanup.

## Auth Vault

Stores credentials encrypted, locally. The LLM never sees passwords.

| Operation | Command |
|---|---|
| Set credentials (one-time, by user) | `agent-browser auth set <vault-name> <username> <password>` |
| Use credentials in a session (login) | `agent-browser --session <name> auth use <vault-name>` |

Stories reference a vault by name via the story-level `auth: { vault: "<name>" }`
field. See `skills/stories/SKILL.md` for the schema.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Polling the dashboard programmatically | Dashboard is a human debug surface |
| Storing `@eN` refs in story files | Refs are session-scoped — they regenerate each snapshot |
| Batching across sessions | One `batch` invocation = one session's lifecycle |
| Using CSS selectors with `find` | `/stories` schema v2 forbids CSS — use semantic locators only |
| Skipping `set viewport` and relying on env vars | Replaced by first-class flags; env-var workarounds belong to the deleted Playwright path |
```

- [ ] **Step 2: Verify the file is well-formed markdown**

Run:
```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
test -f skills/browse/agent-browser-reference.md && wc -l skills/browse/agent-browser-reference.md
```
Expected: file exists, ~95-110 lines.

- [ ] **Step 3: Commit**

```bash
git add skills/browse/agent-browser-reference.md
git commit -m "Add agent-browser-reference.md — operation vocabulary and advanced features"
```

---

### Task 2: Rewrite `skills/browse/SKILL.md` as conventions skill

**Files:**
- Modify: `skills/browse/SKILL.md` (full rewrite — currently 261 lines, target ~120 lines)

Rewrite `/browse` as a conventions skill. Drop backend routing, detection logic, and decision matrix. Keep session naming, screenshot path, lifecycle, and operation vocabulary (translated to `agent-browser`).

- [ ] **Step 1: Read the current file to preserve frontmatter shape and section conventions**

Read: `skills/browse/SKILL.md`. Note the YAML frontmatter, the "Interaction style" directive, and the standard structure (When to Use, Anti-Patterns, Relationship to Other Skills).

- [ ] **Step 2: Replace the file with the new conventions-skill content**

Required sections (in this order):

1. YAML frontmatter — `name: browse`, description updated to remove backend-routing language. Single-line description: "Use for browser automation via agent-browser — defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review. Keywords: browse, browser, agent-browser, headless, screenshot, scrape, automation."

2. Interaction style directive (identical to other skills, copy from CLAUDE.md or any other SKILL.md).

3. H1 + one-line description.

4. ASCII lifecycle position diagram (similar to current).

5. **When to Use** — `/stories` exploration, `/visual-review` walks, `/review` visual mode, ad-hoc browser ops, parallel agents.

6. **Requirements** — "agent-browser must be installed: `npm install -g agent-browser`. The daemon auto-starts on first command (port 4848)."

7. **Conventions defined here:**
   - Session naming (kebab-case, derived from purpose)
   - Screenshot path: `screenshots/browse/<session>/<NN>_<description>.png`
   - Trace path: `traces/<session>/<timestamp>.zip`
   - Lifecycle: open → ops → close (daemon implicit)
   - Operation vocabulary: pointer to `agent-browser-reference.md`

8. **Operation mapping table** — abstract op → `agent-browser` command (mirrors agent-browser-reference.md but condensed; ~10-12 rows).

9. **Parallel sessions** — short section: each parallel agent gets `--session <unique-name>`. One browser instance per session. Memory cost scales with N sessions, not with command count.

10. **Anti-Patterns table** — at minimum: polling dashboard, storing `@eN` refs in YAML, batching across sessions, using CSS with `find`, relying on env vars for viewport.

11. **Relationship to Other Skills** — bidirectional links to: `/stories`, `/visual-review`, `/review`, `qa-agent` (via agents/qa-agent.md), `/test`, `/init`. Each row describes the relationship in one sentence.

Do NOT include: detection logic, backend decision matrix, Chrome MCP references, Playwright references, `playwright-cli` examples.

- [ ] **Step 3: Verify no stale references remain**

Run:
```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
grep -in -E "playwright|chrome.mcp|claude_in_chrome|claude-in-chrome" skills/browse/SKILL.md || echo "CLEAN"
```
Expected: `CLEAN`.

Run:
```bash
grep -c "agent-browser" skills/browse/SKILL.md
```
Expected: at least 5 matches.

- [ ] **Step 4: Commit**

```bash
git add skills/browse/SKILL.md
git commit -m "Rewrite /browse as conventions skill — single agent-browser backend"
```

---

### Task 3: Delete obsolete reference files

**Files:**
- Delete: `skills/browse/playwright-reference.md`
- Delete: `skills/browse/chrome-reference.md`

- [ ] **Step 1: Delete the files**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
git rm skills/browse/playwright-reference.md skills/browse/chrome-reference.md
```

- [ ] **Step 2: Verify**

```bash
ls skills/browse/
```
Expected: only `SKILL.md` and `agent-browser-reference.md`.

- [ ] **Step 3: Commit**

```bash
git commit -m "Delete playwright-reference and chrome-reference — replaced by agent-browser-reference"
```

---

### Task 4: Update `skills/stories/SKILL.md` — v2 schema, semantic locators, v1 detection UX, react opt-in, auth vault

**Files:**
- Modify: `skills/stories/SKILL.md` (currently 721 lines)

This is the biggest single edit. The skill orchestrates story generation, the v2 schema is the central change, and the v1 detection / regeneration UX is new.

Reference: design doc sections "/stories — semantic locators only" and "Capability integration" (auth, react, trace).

- [ ] **Step 1: Read the current file end-to-end to preserve structure**

Read all of `skills/stories/SKILL.md`. Note the existing step structure (Steps 1-5+ for: source analysis, dev URL detection, browse exploration, story generation, refinement).

- [ ] **Step 2: Update the YAML frontmatter description**

Remove any references to playwright/chrome backend choice. Keep the description focused on: generate/update YAML stories from a URL with diff-aware updates, negative testing, source-aware contracts, journey awareness, and self-validation.

- [ ] **Step 3: Add the v2 schema reference at the top of the workflow section**

Insert a new section "Story schema (v2)" near the top of the workflow:

```markdown
## Story schema (v2)

All generated stories use `schema_version: 2`. Locators are semantic only — no CSS,
no XPath:

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

Locator types (always semantic, never CSS):
- `{ role, name? }` — ARIA role with optional accessible name
- `{ testid }` — `data-testid` or framework equivalent
- `{ text, exact? }` — visible text content
- `{ label }` — associated form label
- `{ placeholder }` — input placeholder

At runtime, locators resolve to session-scoped `@eN` refs via
`agent-browser find <type> <args>`. Refs are NEVER stored in the YAML.
```

- [ ] **Step 4: Add the v1 detection / regeneration UX section**

Add a new section "v1 detection" before the main workflow:

```markdown
## v1 detection (legacy story migration)

When `/stories` reads a YAML file lacking `schema_version: 2`, present:

> v1 stories detected (N stories, CSS selectors). v4 of claude-tweaks uses
> semantic locators (role/text/testid). Regenerate?
> 1. Regenerate all (preserves story names, descriptions, intent — re-derives
>    locators from live DOM) **(Recommended)**
> 2. Show me the changes first
> 3. Cancel

- Choice 1: invoke the standard `/stories <url>` flow with existing story names,
  descriptions, and `journey` fields passed as scaffolding so the AI preserves
  intent and only replaces locators.
- Choice 2: dump a per-story diff (old CSS → inferred semantic locator from a live
  DOM snapshot) for review, then prompt to confirm regeneration.
- Choice 3: stop. Stories stay in v1 and are not used.

After regeneration, write `schema_version: 2` at the top of the YAML file.
```

- [ ] **Step 5: Update the workflow steps**

In the existing browse-exploration step (likely Step 2), replace `playwright-cli` invocations with `agent-browser`. Replace any CSS-selector capture logic with snapshot+find logic. Reference `skills/browse/agent-browser-reference.md`.

In the source-analysis step (likely Step 1.5), add: "If source files include `.tsx` or `.jsx`, after opening the page in `agent-browser`, also run `agent-browser --session <name> react tree` to enrich behavioral contracts with component hierarchy. Use `agent-browser --session <name> react inspect <ref>` to extract props for specific elements. Skip silently for non-React apps."

In the refinement step (likely Step 5), replace CSS-selector validation with snapshot+find validation: "For each story step's locator, run `agent-browser --session <name> find <type> <args>`. If find returns 0 or >1 matches, mark the locator as needs-fix."

On any step failure across the skill: add "Capture trace via `agent-browser --session <name> trace save traces/<session>/<timestamp>.zip` before closing the session. Include the path in the failure report."

- [ ] **Step 6: Add Auth Vault integration**

Add a new section "Auth Vault" near the schema section:

```markdown
## Auth Vault

Stories that require login reference an Auth Vault entry via the story-level
`auth: { vault: "<name>" }` field. The vault stores credentials encrypted,
locally. The LLM never sees passwords.

Setup (user runs once):
```
agent-browser auth set <vault-name> <username> <password>
```

In the story runtime, after `open` and before the first action:
```
agent-browser --session <story-id> auth use <vault-name>
```

This replaces the cookie-injection path used in earlier versions.
```

Update qa-agent integration notes to reference Auth Vault instead of cookies.

- [ ] **Step 7: Drop all Chrome MCP and playwright-cli references**

Search for and remove:
- Any `mcp__claude_in_chrome__*` tool references
- Any `playwright-cli` command examples
- Any `BROWSER` / `VISION` env-var or argument logic
- Any backend conditional logic (e.g., "if backend is chrome", "for playwright-cli use X, for chrome use Y")

Replace each with the agent-browser equivalent or remove if Chrome-specific.

- [ ] **Step 8: Update the Anti-Patterns table**

Ensure the anti-patterns include:
- Storing `@eN` refs in YAML (refs are session-scoped)
- Using CSS selectors in v2 schema
- Skipping the v1 detection prompt and silently parsing legacy files

Remove any anti-patterns specific to Chrome MCP or playwright-cli backend choice.

- [ ] **Step 9: Update the Relationship to Other Skills table**

Verify bidirectional references with `/browse`, `/visual-review`, `/test`, `/review`, `/journeys`, `qa-agent`. Update language to remove backend-choice phrasing.

- [ ] **Step 10: Verify**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp|chrome backend|playwright backend" skills/stories/SKILL.md || echo "CLEAN"
grep -c "schema_version: 2" skills/stories/SKILL.md
grep -c "agent-browser" skills/stories/SKILL.md
grep -c "auth.*vault\|Auth Vault" skills/stories/SKILL.md
```
Expected: `CLEAN`; schema_version count >= 1; agent-browser count >= 5; auth vault count >= 2.

- [ ] **Step 11: Commit**

```bash
git add skills/stories/SKILL.md
git commit -m "Migrate /stories to agent-browser — v2 schema, semantic locators, v1 detection UX, auth vault, react introspection"
```

---

### Task 5: Update `skills/stories/source-analysis.md` — react introspection workflow

**Files:**
- Modify: `skills/stories/source-analysis.md` (currently 311 lines)

Add the `agent-browser react tree` and `react inspect` workflow for enriching behavioral contracts when source files are React.

- [ ] **Step 1: Read the file**

Read all of `skills/stories/source-analysis.md`. Identify where source code extraction is described.

- [ ] **Step 2: Add a "React introspection (opt-in)" subsection**

After the existing source extraction patterns, add:

```markdown
## React introspection (opt-in)

When source files are `.tsx` or `.jsx`, agent-browser provides runtime react tree
introspection that complements static source analysis.

After opening the page in a session:
```
agent-browser --session <name> react tree
```

This returns the component hierarchy — useful for distinguishing which form input
renders which behavior when source analysis is ambiguous (e.g., multiple
`<Input>` components on the same page).

For a specific element (after `find` resolves it to `@eN`):
```
agent-browser --session <name> react inspect @eN
```

Returns props, state hooks, and component file path for the element. Use this to
verify behavioral contracts against runtime values (e.g., a validation schema's
constraints reflected in the live `aria-describedby` text).

Skip silently for non-React apps. Do not attempt this when source files are
`.vue`, `.svelte`, plain HTML, or server-rendered templates.
```

- [ ] **Step 3: Drop any Chrome MCP or playwright-cli references**

Search and replace as in Task 4 Step 7.

- [ ] **Step 4: Verify**

```bash
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp" skills/stories/source-analysis.md || echo "CLEAN"
grep -c "react tree\|react inspect" skills/stories/source-analysis.md
```
Expected: `CLEAN`; react count >= 2.

- [ ] **Step 5: Commit**

```bash
git add skills/stories/source-analysis.md
git commit -m "Add react introspection workflow to /stories source analysis"
```

---

### Task 6: Update `skills/stories/story-examples.md` — replace CSS examples with semantic-locator examples

**Files:**
- Modify: `skills/stories/story-examples.md` (currently 175 lines)

Every example in this file currently uses CSS selectors. Replace with semantic locators per the v2 schema.

- [ ] **Step 1: Read the file**

Read all of `skills/stories/story-examples.md`. Note the example categories (DOM-only, source-aware, journey-aware).

- [ ] **Step 2: Rewrite each example using v2 schema**

For each story example:
1. Add `schema_version: 2` at the top
2. Replace every `locator: ".some-css-class"` (or any CSS variant) with a semantic locator: `{ role, name }`, `{ testid }`, `{ text, exact? }`, `{ label }`, or `{ placeholder }`
3. Where appropriate, add the `auth: { vault: "..." }` field to demonstrate the new auth integration
4. Use realistic role/name combinations consistent with common ARIA usage (button + name, link + name, textbox + label, heading + level, etc.)

- [ ] **Step 3: Add a v1 detection example section**

At the bottom, add a "Legacy story format (v1) — migration example" section showing:
- A v1 story with CSS selectors (1-2 lines)
- The detection prompt the user sees
- The regenerated v2 equivalent

This provides ground truth for both regeneration logic and user expectations.

- [ ] **Step 4: Verify**

```bash
grep -in -E "locator: ['\"]\\.|css:|XPath" skills/stories/story-examples.md || echo "CLEAN"
grep -c "schema_version: 2" skills/stories/story-examples.md
grep -c "role:" skills/stories/story-examples.md
```
Expected: `CLEAN`; schema_version >= 3; role >= 5.

- [ ] **Step 5: Commit**

```bash
git add skills/stories/story-examples.md
git commit -m "Replace CSS selector examples with semantic locators (schema v2)"
```

---

### Task 7: Update `skills/visual-review/SKILL.md` — drop Chrome, add vitals, annotated screenshots, batch walks

**Files:**
- Modify: `skills/visual-review/SKILL.md` (currently 179 lines)

- [ ] **Step 1: Read the file**

Read all of `skills/visual-review/SKILL.md`. Identify the three modes (page, journey, discover) and the operation flow.

- [ ] **Step 2: Drop Chrome MCP and playwright-cli references**

Remove backend-detection logic, fallback paths (e.g., `which playwright-cli`, `npx playwright-cli --version`), and any `mcp__claude_in_chrome__*` references. Replace with `agent-browser` equivalents per `skills/browse/agent-browser-reference.md`.

- [ ] **Step 3: Add a "Performance" finding category to all three modes**

Where the skill describes findings categories (likely after walks complete), add Performance as a category. After each page or journey is reviewed:
```
agent-browser --session <name> vitals
```
Capture LCP, CLS, INP, TTFB, FCP. Include the values in the review summary under a "Performance" heading. Flag values exceeding common thresholds (LCP > 2.5s, CLS > 0.1, INP > 200ms) as findings.

- [ ] **Step 4: Adopt batch mode for journey walks**

In the journey-mode procedure, replace the per-step `agent-browser` invocations with a single `agent-browser batch --session <name>` invocation that bundles open, snapshot, screenshot, and any per-step ops into one process. Reference `skills/browse/agent-browser-reference.md` for the batch command syntax.

- [ ] **Step 5: Adopt annotated screenshots**

Replace `screenshot --filename <path>` with `screenshot --annotate --filename <path>` for all visual-review screenshots. Update finding language to reference numbered overlays (e.g., "issue at element [3]") instead of describing positions.

- [ ] **Step 6: Add trace-on-failure**

When a journey step fails (assertion fails, page errors, navigation timeout): capture trace via `agent-browser --session <name> trace save traces/<session>/<timestamp>.zip` before closing. Include the path in the failure report.

- [ ] **Step 7: Update the Anti-Patterns table**

Remove anti-patterns specific to backend choice. Add: relying on positional descriptions instead of annotated overlays.

- [ ] **Step 8: Update the Relationship table**

Verify bidirectional references with `/browse`, `/review`, `/journeys`, `/stories`. Drop backend-choice phrasing.

- [ ] **Step 9: Verify**

```bash
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp|chrome backend|playwright backend" skills/visual-review/SKILL.md || echo "CLEAN"
grep -c "vitals" skills/visual-review/SKILL.md
grep -c "annotate" skills/visual-review/SKILL.md
grep -c "agent-browser" skills/visual-review/SKILL.md
```
Expected: `CLEAN`; vitals >= 2; annotate >= 1; agent-browser >= 3.

- [ ] **Step 10: Commit**

```bash
git add skills/visual-review/SKILL.md
git commit -m "Migrate /visual-review to agent-browser — vitals, annotated screenshots, batch walks"
```

---

### Task 8: Update `skills/visual-review/browser-review.md` — drop Chrome, add vitals/annotate procedures

**Files:**
- Modify: `skills/visual-review/browser-review.md` (currently 615 lines)

- [ ] **Step 1: Read the file**

Read all of `skills/visual-review/browser-review.md`. Identify the procedural sections (likely: page, journey, discover modes with detailed step-by-step).

- [ ] **Step 2: Remove all Chrome and playwright-cli backend logic**

Search for and remove:
- Backend detection (e.g., `which playwright-cli`, `claude_in_chrome` tool checks)
- Backend fallback chains
- Conditional procedures ("if Chrome do X, if Playwright do Y")
- All `playwright-cli ... -s=<session>` examples
- All `mcp__claude_in_chrome__*` examples

Replace each location with the agent-browser equivalent.

- [ ] **Step 3: Add a "Vitals capture" procedure**

After each page-review and journey-review procedure ends, add:
```
agent-browser --session <name> vitals
```
With instructions on how to interpret the output and which thresholds to flag.

- [ ] **Step 4: Update screenshot procedures to use --annotate**

Every `screenshot` invocation in this file should use `--annotate`. Update finding-writing guidance: reviewers reference numbered overlays.

- [ ] **Step 5: Update batch walk procedure**

The journey-mode procedure should describe assembling a `batch` invocation with all journey steps, then interpreting batched output (snapshots and screenshots from each step). Provide a worked example.

- [ ] **Step 6: Update trace-on-failure procedure**

Add a section: "When a journey step fails — capture trace, attach path to failure report, close session."

- [ ] **Step 7: Verify**

```bash
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp|chrome backend|playwright backend" skills/visual-review/browser-review.md || echo "CLEAN"
grep -c "vitals\|--annotate\|batch" skills/visual-review/browser-review.md
```
Expected: `CLEAN`; combined count >= 5.

- [ ] **Step 8: Commit**

```bash
git add skills/visual-review/browser-review.md
git commit -m "Update browser-review procedures for agent-browser — vitals, annotate, batch, trace"
```

---

### Task 9: Update `skills/visual-review/reconnaissance.md` — drop Chrome refs

**Files:**
- Modify: `skills/visual-review/reconnaissance.md` (currently 266 lines)

- [ ] **Step 1: Read the file**

Read all of `skills/visual-review/reconnaissance.md`.

- [ ] **Step 2: Search for Chrome and playwright-cli references and remove**

```bash
grep -n -E "playwright-cli|claude_in_chrome|chrome.mcp|backend" skills/visual-review/reconnaissance.md
```

For each match, replace with the agent-browser equivalent or remove. Reconnaissance is contextual page analysis, so most references are likely incidental.

- [ ] **Step 3: Verify**

```bash
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp" skills/visual-review/reconnaissance.md || echo "CLEAN"
```
Expected: `CLEAN`.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git diff --quiet skills/visual-review/reconnaissance.md || (git add skills/visual-review/reconnaissance.md && git commit -m "Drop chrome/playwright refs from reconnaissance")
```

---

### Task 10: Update `skills/review/qa-review.md` — drop Chrome, agent-browser commands

**Files:**
- Modify: `skills/review/qa-review.md` (currently 520 lines)

- [ ] **Step 1: Read the file**

Read all of `skills/review/qa-review.md`. Identify Chrome MCP and playwright-cli branches (likely BROWSER conditional sections, dual-command tables).

- [ ] **Step 2: Drop Chrome branches**

Remove:
- Any `BROWSER` parameter parsing
- Any `VISION` parameter parsing
- Conditional procedures ("for Playwright use X, for Chrome use Y") — keep the agent-browser path only
- All `mcp__claude_in_chrome__*` references
- All `playwright-cli ... -s=<session>` examples — replace with `agent-browser --session <name>`

- [ ] **Step 3: Update operation tables**

Tables that previously had Playwright + Chrome columns become single-column or are inlined as plain procedures. Reference `skills/browse/agent-browser-reference.md` for the operation vocabulary.

- [ ] **Step 4: Update auth and cookie injection sections**

If the file references cookie injection for auth, replace with the Auth Vault path: `agent-browser --session <name> auth use <vault-name>`.

- [ ] **Step 5: Add trace-on-failure**

When a story step fails, capture trace via `agent-browser --session <name> trace save traces/<session>/<timestamp>.zip` and include the path in the failure report.

- [ ] **Step 6: Verify**

```bash
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp|BROWSER:|VISION:" skills/review/qa-review.md || echo "CLEAN"
grep -c "agent-browser" skills/review/qa-review.md
```
Expected: `CLEAN`; agent-browser count >= 3.

- [ ] **Step 7: Commit**

```bash
git add skills/review/qa-review.md
git commit -m "Migrate qa-review to agent-browser — drop Chrome/playwright branches, auth vault, trace on failure"
```

---

### Task 11: Update `skills/init/SKILL.md` and `skills/init/summary-templates.md`

**Files:**
- Modify: `skills/init/SKILL.md` (currently 773 lines)
- Modify: `skills/init/summary-templates.md` (currently 105 lines)

- [ ] **Step 1: Read both files**

Read all of `skills/init/SKILL.md` and `skills/init/summary-templates.md`. Identify the browser-integration phase (likely Phase 7 or 8 of init based on convention) and any summary text that describes Chrome MCP setup.

- [ ] **Step 2: Update the browser-integration phase in SKILL.md**

The current phase likely:
- Detects playwright-cli and Chrome MCP
- Asks the user which backend to use
- Sets up both

Replace with:
- Detect agent-browser: `agent-browser --version` (via Bash tool, with try/catch)
- If not installed: print a note "Browser features (used by /stories, /visual-review, /review qa) require agent-browser. Install: `npm install -g agent-browser`. Browser features are optional — skills work without them but degrade gracefully."
- If installed: confirm and continue
- No backend-choice prompt — there is only one backend now

- [ ] **Step 3: Update summary-templates.md**

Remove all Chrome MCP detection language and Playwright-vs-Chrome decision trees. Replace with single-backend agent-browser language.

- [ ] **Step 4: Verify**

```bash
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp|chrome backend|playwright backend" skills/init/SKILL.md skills/init/summary-templates.md || echo "CLEAN"
grep -c "agent-browser" skills/init/SKILL.md
```
Expected: `CLEAN`; agent-browser count >= 2.

- [ ] **Step 5: Commit**

```bash
git add skills/init/SKILL.md skills/init/summary-templates.md
git commit -m "Update /init for single agent-browser backend — drop Chrome MCP setup phase"
```

---

### Task 12: Update `agents/qa-agent.md` — drop BROWSER/VISION, ops table rewrite, auth vault, trace

**Files:**
- Modify: `agents/qa-agent.md` (currently 372 lines)

- [ ] **Step 1: Read the file**

Read all of `agents/qa-agent.md`. The audit found this file has explicit BROWSER/VISION parameter parsing and dual-backend operation tables.

- [ ] **Step 2: Remove BROWSER and VISION parameters**

Drop all parameter parsing logic for `BROWSER` (auto/playwright/chrome) and `VISION` (true/false). The agent-browser path is the only path. Update the parameter-resolution preamble accordingly.

- [ ] **Step 3: Rewrite the operation tables**

The current tables likely have columns like "Playwright command" and "Chrome command". Collapse to single-column "agent-browser command" tables. Reference the operation vocabulary in `skills/browse/agent-browser-reference.md`.

Specifically rewrite:
- Setup session — `agent-browser --session <name> open <url>`
- Navigate — `agent-browser --session <name> open <url>`
- Click — `agent-browser --session <name> click <ref>`
- Fill — `agent-browser --session <name> fill <ref> <value>`
- Screenshot — `agent-browser --session <name> screenshot --filename <path>`
- Close — `agent-browser --session <name> close`

- [ ] **Step 4: Replace cookie injection with Auth Vault**

The current file injects cookies via `playwright-cli evaluate "await page.context().addCookies(...)"`. Replace with:
- If a story declares `auth: { vault: "<name>" }`, run `agent-browser --session <story-id> auth use <vault-name>` after open.
- Document that the user runs `agent-browser auth set <vault-name> <username> <password>` once before running stories.
- Drop the cookie-JSON code path entirely.

- [ ] **Step 5: Add trace-on-failure**

In each story execution loop, on any step failure: `agent-browser --session <story-id> trace save traces/<story-id>/<timestamp>.zip` before closing. Include the path in the failure report attached to the story result.

- [ ] **Step 6: Drop viewport env-var workaround**

Remove the Windows PowerShell/CMD env-var syntax workaround for `PLAYWRIGHT_MCP_VIEWPORT_SIZE`. Replace with: `agent-browser --session <name> set viewport <width> <height>` — works the same on all platforms.

- [ ] **Step 7: Verify**

```bash
grep -in -E "playwright-cli|claude_in_chrome|chrome.mcp|BROWSER:|VISION:|PLAYWRIGHT_MCP" agents/qa-agent.md || echo "CLEAN"
grep -c "agent-browser" agents/qa-agent.md
grep -c "auth.*use\|trace save" agents/qa-agent.md
```
Expected: `CLEAN`; agent-browser >= 8; auth/trace >= 2.

- [ ] **Step 8: Commit**

```bash
git add agents/qa-agent.md
git commit -m "Migrate qa-agent to agent-browser — drop BROWSER/VISION params, auth vault, trace, set viewport"
```

---

### Task 13: Update `hooks/hooks.json` — replace SessionStart fallback message

**Files:**
- Modify: `hooks/hooks.json` (currently 14 lines)

- [ ] **Step 1: Read the file**

Read `hooks/hooks.json`. Note the SessionStart hook that currently checks for `playwright-cli --version` and falls back to a message mentioning Chrome MCP.

- [ ] **Step 2: Replace the detection command**

Replace the existing inline node script with an equivalent that:
- Checks for `agent-browser --version` via `child_process.execSync`
- On failure, prints: `claude-tweaks: Browser features require agent-browser. Install: npm install -g agent-browser. Browser features are optional.`
- Drops all references to Playwright and Chrome MCP

The replacement command (single-line, JSON-escaped):
```json
"command": "node -e \"try{require('child_process').execSync('agent-browser --version',{stdio:'ignore'})}catch(e){console.log('claude-tweaks: Browser features require agent-browser. Install: npm install -g agent-browser. Browser features are optional.')}\""
```

- [ ] **Step 3: Verify the JSON is well-formed**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))" && echo "VALID JSON"
grep -E "playwright-cli|chrome" hooks/hooks.json || echo "CLEAN"
```
Expected: `VALID JSON`; `CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "Update SessionStart hook detection — agent-browser only"
```

---

### Task 14: Update `README.md` and `.claude-plugin/plugin.json` — version bump, requirements, migration section

**Files:**
- Modify: `README.md` (currently 188 lines)
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Update plugin.json**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
```

Read `.claude-plugin/plugin.json`. Change:
- `"version": "3.22.0"` → `"version": "4.0.0"`
- In `keywords`: drop `"playwright"`, add `"agent-browser"` and `"semantic-locators"`

The new keywords array:
```json
"keywords": [
  "workflow",
  "productivity",
  "specs",
  "planning",
  "code-review",
  "browser",
  "automation",
  "agent-browser",
  "semantic-locators",
  "testing",
  "qa"
]
```

- [ ] **Step 2: Update README.md — Requirements table**

Locate the requirements table (around line 177-178 per the audit). Replace the two browser rows with a single agent-browser row:

| agent-browser | `npm install -g agent-browser` | Optional — browser automation for /stories, /visual-review, /review qa |

Drop the Chrome MCP row entirely.

- [ ] **Step 3: Update README.md — descriptions of /init and /browse**

Remove references to "playwright-cli and/or Chrome MCP" and "best backend" routing. Update to reflect single-backend agent-browser. Specifically:
- The `/init` description (around line 62): replace "sets up browser integration (playwright-cli and/or Chrome MCP)" with "sets up browser integration (agent-browser)"
- The `/browse` description (around line 133): replace "Auto-detects the best backend: playwright-cli (recommended, headless, parallel) or Chrome MCP (observable, real profile)" with "Browser automation via agent-browser. Defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review."

- [ ] **Step 4: Add a v3 → v4 migration section**

Add a new section to README.md (near the top, after "What this is" or similar):

```markdown
## Upgrading from v3 to v4

v4.0.0 is a breaking release. Two changes affect existing users:

1. **Browser tooling switched to agent-browser.** Install: `npm install -g agent-browser`. Uninstall is optional but recommended: `npm uninstall -g @playwright/cli`. Chrome MCP support is removed entirely.
2. **`/stories` schema bumped to v2.** Existing v1 story files (with CSS selectors) are detected on first run and you'll be prompted to regenerate — `/stories <url>` reuses your existing story names, descriptions, and journey assignments while replacing CSS selectors with semantic locators (role / text / testid). No silent breakage.

Run `/claude-tweaks:init` against your existing project to refresh the configuration after upgrading.
```

- [ ] **Step 5: Verify**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
grep -E "playwright|Chrome MCP|claude_in_chrome" README.md || echo "CLEAN"
grep -E '"version": "4.0.0"' .claude-plugin/plugin.json
grep -E '"agent-browser"' .claude-plugin/plugin.json
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8'))" && echo "VALID JSON"
```
Expected: `CLEAN`; version match; agent-browser keyword present; `VALID JSON`.

- [ ] **Step 6: Commit**

```bash
git add README.md .claude-plugin/plugin.json
git commit -m "Bump to v4.0.0 — agent-browser migration, README v3→v4 section"
```

---

### Task 15: Cross-reference audit and lifecycle diagram sync

**Files:**
- Potentially modify: any skill with stale references found
- Potentially modify: `skills/help/reference-card.md`, `skills/help/context-flow.md`, `README.md` (lifecycle diagrams)

This is the validation gate. Catch dangling references and confirm bidirectional Relationship tables.

- [ ] **Step 1: Repo-wide grep for stale references**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"
grep -rn -E "playwright-cli|claude_in_chrome|chrome.mcp|claude-in-chrome|PLAYWRIGHT_MCP" \
  skills/ agents/ hooks/ README.md .claude-plugin/ docs/ 2>/dev/null \
  | grep -v "docs/superpowers/specs/2026-05-01-agent-browser-migration-design.md" \
  | grep -v "docs/superpowers/plans/2026-05-01-agent-browser-migration.md" \
  | grep -v "docs/plans/2026-05-01-agent-browser-migration-ledger.md" \
  || echo "CLEAN"
```

If anything other than `CLEAN` is printed, those locations need fixing. The exclusions are: the design doc itself, this plan, and the ledger — those legitimately reference the old terms in historical context.

For each remaining match, edit the file to remove or replace. Commit per file with: `Fix stale reference in {file}`.

- [ ] **Step 2: Bidirectional Relationship-table audit**

For every skill in `skills/`, read its Relationship to Other Skills table. Verify each referenced skill has a reciprocal entry. Specifically check skills changed in this migration:
- `/browse` ↔ `/stories`, `/visual-review`, `/review`, `/test`, `/init`
- `/stories` ↔ `/browse`, `/visual-review`, `/review`, `/test`, `/journeys`, `/build`
- `/visual-review` ↔ `/browse`, `/review`, `/journeys`, `/stories`
- `/review` ↔ `/test`, `/visual-review`, `/wrap-up`, `/build`
- `/init` ↔ all skills it sets up

For each missing reciprocal, add the missing row. Commit batch-style: `Restore bidirectional skill relationships`.

- [ ] **Step 3: Sync `/help` and README lifecycle diagrams**

Read `skills/help/reference-card.md`, `skills/help/context-flow.md`, and the artifact-lifecycle diagram in `README.md`. Ensure:
- No mention of two backends
- Browser-related descriptions reflect single-backend agent-browser
- Skill list is complete (no skill added or removed in this migration, but verify)

If changes needed, edit and commit: `Sync /help and README lifecycle diagrams to v4`.

- [ ] **Step 4: Final verification**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/Github - Thomas Holk Nielsen/claude-tweaks"

# 1. No stale browser refs
grep -rn -E "playwright-cli|claude_in_chrome|chrome.mcp|claude-in-chrome|PLAYWRIGHT_MCP" \
  skills/ agents/ hooks/ README.md .claude-plugin/ 2>/dev/null \
  | grep -v "docs/" \
  || echo "BROWSER REFS CLEAN"

# 2. Version bumped
grep '"version": "4.0.0"' .claude-plugin/plugin.json

# 3. Plan files structure intact
ls skills/browse/
# Expected: SKILL.md and agent-browser-reference.md only

# 4. Hooks JSON is valid
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))" && echo "HOOKS VALID"

# 5. Plugin JSON is valid
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8'))" && echo "PLUGIN VALID"
```

All five checks should pass. If any fail, fix before completing this task.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git status
# If clean: nothing to commit
# Otherwise:
git add <files>
git commit -m "Final cross-reference audit — bidirectional tables, lifecycle diagrams synced"
```

---

## Self-review checklist (run after all tasks complete)

1. **Spec coverage:** Every section of the design doc is implemented in a task above. Specifically: `/browse` redesign (Tasks 1-3), `/stories` schema v2 (Tasks 4-6), Chrome MCP removal (Tasks 7-13), capability integration (vitals/trace/auth/react/batch/annotate distributed across tasks), version bump (Task 14), validation gate (Task 15).

2. **Bidirectional relationships:** Task 15 explicitly audits this. All cross-references verified.

3. **No placeholders:** Every task has concrete file paths, concrete content/grep commands, and a concrete commit message.

4. **Operational alignment:** Per CLAUDE.md, every skill keeps its standard structure (frontmatter, interaction directive, anti-patterns, relationships). Tasks preserve this.
