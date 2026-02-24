---
name: claude-tweaks:browse
description: Use for browser automation — auto-detects playwright-cli or Chrome MCP and routes accordingly. Supports headless parallel sessions (Playwright) and observable real-browser workflows (Chrome). Keywords - browse, browser, playwright, chrome, headless, screenshot, scrape, test, parallel, observable, automation.
allowed-tools: Bash
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a recommended next step, not a navigation menu.


# Browse

Unified browser automation skill. Auto-detects and routes to the best available browser backend. Used by `/claude-tweaks:stories`, `/claude-tweaks:review`, and ad-hoc browser tasks.

```
                             [ /claude-tweaks:browse ] ← utility (no fixed position)
                                        ↑
   Used by: /claude-tweaks:stories, /claude-tweaks:review (visual + qa modes), ad-hoc tasks
```

## When to Use

- You need to interact with a web page (navigate, click, fill, scrape, screenshot)
- Another skill needs browser automation (`/claude-tweaks:stories`, `/claude-tweaks:review`)
- The user says "browse," "screenshot," "scrape," "test the UI," or similar
- You need to verify a deployment or check a running app

## Input

`$ARGUMENTS` = URL or task description, optionally with backend preference.

### Keyword detection rules (applied to $ARGUMENTS):

- `browser=playwright` or `playwright` → BROWSER = `playwright`
- `browser=chrome` or `chrome` → BROWSER = `chrome`
- `headless` → HEADLESS = `true`
- `vision` → VISION = `true`
- Everything else → TASK (URL + description)

Default: BROWSER = `auto`, HEADLESS = `false`, VISION = `false`.

## Backend Detection

Run these checks at the start of every browser task:

1. **Playwright available?** — `command -v playwright-cli >/dev/null 2>&1`
2. **Chrome available?** — check if `mcp__claude_in_chrome__navigate` tool exists

## Backend Resolution

Given a **preference** (`auto`, `playwright`, or `chrome`) and detection results, resolve the backend:

| Preference   | Playwright? | Chrome? | Result                                                                 |
| ------------ | ----------- | ------- | ---------------------------------------------------------------------- |
| `auto`       | Yes         | Yes     | Use **Playwright** (default — parallel, token-efficient)               |
| `auto`       | Yes         | No      | Use **Playwright**                                                     |
| `auto`       | No          | Yes     | Use **Chrome**                                                         |
| `auto`       | No          | No      | **Error:** "No browser backend available. Install playwright-cli: `npm install -g @playwright/cli@latest` — or use Chrome MCP: `claude --chrome`" |
| `playwright` | Yes         | —       | Use **Playwright**                                                     |
| `playwright` | No          | —       | **Error:** "playwright-cli not found. Run: `npm install -g @playwright/cli@latest`" |
| `chrome`     | —           | Yes     | Use **Chrome**                                                         |
| `chrome`     | —           | No      | **Error:** "Chrome MCP tools not available. Restart Claude Code with `claude --chrome`" |

When the result is an **Error**, stop and report the message to the user. Do not proceed with browser actions.

## Operation Mapping

Use this table to translate abstract operations to concrete commands for each backend:

| Operation      | Playwright                                                           | Chrome                                            |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| **Open/Navigate** | `playwright-cli -s=<session> open <url>`                          | `mcp__claude_in_chrome__navigate(url)`            |
| **Snapshot**    | `playwright-cli -s=<session> snapshot`                              | `mcp__claude_in_chrome__read_page(tabId)`         |
| **Click**       | `playwright-cli -s=<session> click <ref>`                          | `mcp__claude_in_chrome__left_click(ref)`          |
| **Fill**        | `playwright-cli -s=<session> fill <ref> "text"`                    | `mcp__claude_in_chrome__form_input(ref, value)`   |
| **Type**        | `playwright-cli -s=<session> type "text"`                          | `mcp__claude_in_chrome__type(text)`               |
| **Press**       | `playwright-cli -s=<session> press <key>`                          | _(use type or JavaScript)_                        |
| **Screenshot**  | `playwright-cli -s=<session> screenshot --filename=<path>`         | `mcp__claude_in_chrome__screenshot()`             |
| **Close**       | `playwright-cli -s=<session> close`                                | `mcp__claude_in_chrome__tab_close(tabId)`         |
| **Console**     | `playwright-cli -s=<session> console`                              | `mcp__claude_in_chrome__read_console_messages(tabId)` |
| **Tab list**    | `playwright-cli -s=<session> tab-list`                             | `mcp__claude_in_chrome__tab_list()`               |
| **New tab**     | `playwright-cli -s=<session> tab-new [url]`                       | `mcp__claude_in_chrome__tab_create(url)`          |
| **Go back**     | `playwright-cli -s=<session> go-back`                              | `mcp__claude_in_chrome__go_back()`                |
| **Run JS**      | `playwright-cli -s=<session> run-code <code>`                     | `mcp__claude_in_chrome__javascript_exec(code)`    |

For full command references, read `playwright-reference.md` or `chrome-reference.md` in this skill's directory.

### Chrome Limitations

- **No `--filename` control on screenshots** — `mcp__claude_in_chrome__screenshot()` returns the image inline. Note "screenshot captured" instead of a file path.
- **No parallel instances** — Chrome MCP shares a single extension controller. One task at a time.
- **Always headed** — Chrome is always visible. `--headless` flag is irrelevant.
- **Vision always on** — `PLAYWRIGHT_MCP_CAPS=vision` flag is irrelevant; Chrome inherently returns visual data.

## Workflow

### Step 1: Resolve Backend

Run backend detection and resolution (see tables above). If error, stop and report.

### Step 2: Open Session

**Playwright:** Derive a short, descriptive kebab-case session name from the user's prompt. Always set the viewport via env var:
```bash
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 playwright-cli -s=<session-name> open <url> --headed
# or headless:
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 playwright-cli -s=<session-name> open <url>
# or with vision:
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 PLAYWRIGHT_MCP_CAPS=vision playwright-cli -s=<session-name> open <url>
```

**Chrome:** Navigate directly:
```
mcp__claude_in_chrome__navigate(url)
```

### Step 3: Execute Task

Use the operation mapping table to perform the requested actions. Get element references via snapshot before interacting.

### Step 4: Capture Screenshots

**Directory:** `screenshots/browse/{session-name}/`

- Derive `{session-name}` from the Playwright session name or, for Chrome, from a slugified version of the task prompt.
- File naming: `{NN}_{description}.png` where `{NN}` is a zero-padded sequence number and `{description}` is a short kebab-case label.
  - Example: `00_initial-page.png`, `01_form-filled.png`, `02_results-loaded.png`

**Minimum screenshots:**
1. One at the **start** of the task (after initial page load)
2. One at the **end** of the task (final state)

Additional screenshots after significant interactions are encouraged.

**Playwright:** `playwright-cli -s=<session> screenshot --filename=screenshots/browse/{session-name}/{NN}_{description}.png`

**Chrome:** `mcp__claude_in_chrome__screenshot()` returns inline — note "screenshot captured" in the report.

### Step 5: Close Session

**Always close the session when done.**

- **Playwright:** `playwright-cli -s=<session-name> close`
- **Chrome:** `mcp__claude_in_chrome__tab_close(tabId)`

### Step 6: Classify and Report

After completing a task, classify it into exactly one category:

| Classification | When to use | Report emphasis |
|---------------|-------------|-----------------|
| `screenshot` | Primary goal was capturing visual state | Image paths, visual comparison |
| `scrape` | Extracting data or content from pages | Structured data, completeness |
| `test` | Validating behavior or assertions | Pass/fail, assertions, errors |
| `form` | Filling out or submitting forms | Field values, submission result |
| `explore` | General browsing, discovery, navigation | Pages visited, site structure |
| `interact` | Clicking, toggling, or manipulating UI state | State changes, before/after |

If a task spans multiple categories, choose the one that best matches the user's **primary intent**.

Present the report:

```
# Browse Report
**Task:** {one-line summary of what was done}
**Classification:** {screenshot|scrape|test|form|explore|interact}
**URL:** {primary URL visited}
**Backend:** {playwright-cli|Chrome MCP}
**Screenshots:** {directory path, or "inline (Chrome)" if Chrome backend}

## Summary
{2-4 sentences describing what happened, tailored to the classification}

## Actions Taken
| # | Action | Target/URL | Result | Screenshot |
|---|--------|-----------|--------|------------|
| 1 | Navigate | {url} | Page loaded | `00_initial-page.png` |
| 2 | {click/fill/type/etc} | {element or URL} | {outcome} | `01_description.png` |
| ... | ... | ... | ... | ... |

## Recommended Next
1. {option} — `{command}`
2. {option} — `{command}` **(Recommended)**
3. {option} — `{command}`
> Reply "do 1", "do 2", or "do 3" to proceed.
```

### Classification-Specific Recommendation Templates

Use these templates for the "Recommended Next" section based on the task classification.

#### `screenshot`
1. Compare with another page or viewport — `/claude-tweaks:browse screenshot {url} at {viewport}`
2. Run a visual review — `/claude-tweaks:review visual {url}` **(Recommended)**
3. Generate user stories from this page — `/claude-tweaks:stories {url}`

#### `scrape`
1. Save extracted data to a file — `write data to {filename}`
2. Scrape additional pages — `/claude-tweaks:browse scrape {next-target}` **(Recommended)**
3. Compare data with another source — `/claude-tweaks:browse scrape {comparison-url}`

#### `test`
1. Fix failures and re-test — `/claude-tweaks:browse test {url}`
2. Generate regression stories — `/claude-tweaks:stories {url}` **(Recommended)**
3. Run the full QA suite — `/claude-tweaks:review qa`

#### `form`
1. Submit with different data — `/claude-tweaks:browse fill {url} with {variation}`
2. Test form validation (empty/invalid inputs) — `/claude-tweaks:browse test form validation on {url}` **(Recommended)**
3. Generate form-focused stories — `/claude-tweaks:stories {url} focus=forms`

#### `explore`
1. Generate user stories from discovered pages — `/claude-tweaks:stories {url}` **(Recommended)**
2. Run a visual review on the site — `/claude-tweaks:review visual {url}`
3. Screenshot key pages — `/claude-tweaks:browse screenshot all main pages on {url}`

#### `interact`
1. Verify state persists after reload — `/claude-tweaks:browse reload {url} and check state`
2. Run a visual review — `/claude-tweaks:review visual {url}` **(Recommended)**
3. Generate stories covering this interaction — `/claude-tweaks:stories {url}`

Adapt the specific URLs and targets to match the actual task context.

## "do N" Handling

> **Note:** This interaction pattern is unique to `/browse`. Other skills use numbered options (1, 2, 3) for decisions. The "do N" pattern exists here because browse reports offer follow-up *actions* (not choices), and users often want to chain multiple actions after exploring.

When the user replies with a "do N" pattern after receiving a Browse Report, match it to the corresponding recommendation and execute it.

**Supported patterns:**
- `do 1` / `do 2` / `do 3` — execute a single recommendation by number
- `do 1,3` / `do 1, 3` — execute multiple recommendations sequentially
- `do all` — execute all three recommendations sequentially

**Execution rules:**
1. Look up the recommendation from the most recent Browse Report's "Recommended Next" section
2. Execute the referenced command(s) as if the user had typed them directly
3. After completing each command, produce a new Browse Report
4. If executing multiple ("do all" or "do 1,3"), produce one report per command, sequentially

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Proceeding without checking backend availability | Commands will fail — always detect and resolve first |
| Using Playwright MCP tools (`mcp__playwright__*`) | Standardized on playwright-cli — use CLI commands, not MCP tools. Even if Playwright MCP tools appear in your available tools list, **always use `playwright-cli` CLI commands instead**. The MCP tools are not part of this workflow. |
| Skipping screenshots | Browse tasks must capture at minimum start and end state |
| Running Chrome tasks in parallel | Chrome MCP shares a single controller — one task at a time |
| Using generic session names | Session names should be descriptive kebab-case derived from the task |
| Forgetting to close sessions | Leaked sessions consume resources — always close when done |
| Presenting a "What's Next?" menu | Use "Recommended Next" with numbered options and "do N" handling |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:stories` | Uses /browse to explore sites and validate generated stories |
| `/claude-tweaks:review` | Visual, journey, discover, and qa modes use /browse for browser interaction |
| `/claude-tweaks:flow` | /flow can chain /stories and /review which use /browse transitively |
| `/claude-tweaks:setup` | Step 6 configures the browser backends that /browse depends on |
