---
name: claude-tweaks:visual-review
description: Use when you want to visually review a running application in the browser — inspect UI quality, walk user journeys, discover undocumented journeys, or generate creative improvement ideas. Works standalone or as a step within /claude-tweaks:review.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Visual Review — Browser-Based UI Inspection

Review a running application through the browser: first impressions, persona-based interaction, structured analysis, and creative reimagination. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                     │
                                             [ /claude-tweaks:visual-review ]
                                              (page, journey, or discover mode)
```

## When to Use

- After a build — visually inspect what was built
- To walk a documented user journey and test its "should feel" expectations
- To discover and document journeys in a brownfield project
- During `/claude-tweaks:review` Step 6 — invoked in **full** mode
- After QA test runs — leverage screenshots and page inventories for enriched review
- Standalone visual inspection of any running web application

## Modes

| Mode | Input | What happens |
|------|-------|-------------|
| **page** | URL or description | Review a single page or flow. Full creative framework. |
| **journey** | `journey:{name}` | Walk a documented journey step by step. Each step reviewed against its "should feel" / "red flags." |
| **discover** | `discover` | Explore the running app to identify and document undocumented user journeys. |

## Input

`$ARGUMENTS` controls mode and target.

### Standalone (invoked directly):

```
/claude-tweaks:visual-review http://localhost:3000           → page mode
/claude-tweaks:visual-review journey:checkout                → journey mode
/claude-tweaks:visual-review discover                        → discover mode
/claude-tweaks:visual-review                                 → page mode, auto-detect dev URL
```

### Pipeline context (invoked by `/review`):

The parent skill passes:
- **Mode** — `full` (code + visual), `visual`, `journey:{name}`, or `discover`
- **QA data** — when available from a recent `/claude-tweaks:test` run
- **Spec context** — spec number or changed files for scoping

When invoked by `/review` in **full** mode, the visual review runs after code review steps complete. In standalone visual/journey/discover modes, the code review is skipped.

## Step 1: Browser Detection

Detect and resolve the browser backend. This must succeed before any browser interaction.

### Detection procedure

> **Parallel execution:** Run both detection checks concurrently — they are independent.

1. **playwright-cli** — run `playwright-cli --version` via Bash
2. **Chrome MCP** — check if `mcp__claude_in_chrome__navigate` tool exists

### Resolution

| playwright-cli? | Chrome MCP? | Result |
|-----------------|-------------|--------|
| Yes | Yes | Use **playwright-cli** (preferred — parallel, headless, token-efficient) |
| Yes | No | Use **playwright-cli** |
| No | Yes | Use **Chrome MCP** |
| No | No | **STOP** — report error (see below) |

### When no backend is found

```
No browser backend available.

1. Install playwright-cli: `npm install -g @anthropic-ai/cli-playwright@latest`
2. Use Chrome MCP: restart Claude Code with `claude --chrome`
3. Skip visual review — proceed with code-only review

> playwright-cli is recommended — it supports parallel sessions, headless mode, and file-based screenshots.
```

Do not silently skip. Always report and offer options.

### playwright-cli detection hardening

If `playwright-cli --version` fails, try these fallbacks before declaring unavailable:

1. `which playwright-cli` — confirms binary exists even if version flag fails
2. `npx playwright-cli --version` — catches npx-only installations

If any fallback succeeds, use playwright-cli.

Use the `/claude-tweaks:browse` skill's operation mapping table for all browser operations. The browse skill is the single source of truth for command mappings between backends.

## Step 2: Dev URL Resolution

Before prompting for a URL, check the persisted config:

1. Read `stories/auth.yml` — if `servers.default.url` exists, probe it
2. If it responds — use it silently (no prompt needed)
3. If it doesn't respond or no config exists — run the dev URL detection procedure from `dev-url-detection.md` in the `/claude-tweaks:stories` skill's directory

### Ensure the app is running

Before navigating, confirm the application is accessible. If the URL doesn't respond:

```
The app doesn't seem to be running at {url}. Should I:
1. Try a different URL
2. Wait while you start the dev server
```

Do NOT attempt to start the dev server yourself.

## Step 3: Run Visual Review

For the full review procedures, read `browser-review.md` in this skill's directory. That file contains:

- **QA Data Loading** — optional enrichment from recent `/claude-tweaks:test` runs
- **Step 0: Reconnaissance** — contextual pre-analysis (read `reconnaissance.md` in this skill's directory)
- **Step 1: Health Check** — console errors, network failures, rendering
- **Step 2: First Impressions** — the 5-second test, raw reactions
- **Step 3: Use It** — persona-based interaction
- **Step 4: Analyze** — structured inspection
- **Step 5: Reimagine** — creative "best version" exercise
- **Step 6: Report & Route** — findings table with routing

### Mode-specific behavior

- **Page mode** — run all steps on the target URL
- **Journey mode** — walk the journey's steps with focused 4-check passes, then assess the overall arc
- **Discover mode** — codebase scan → journey candidates → browser walkthrough → write journey files

## Standalone Next Actions

When invoked directly (not by a parent skill), end with:

```
### Next Actions

1. `/claude-tweaks:review {spec}` — full code review **(Recommended)**
2. `/claude-tweaks:visual-review journey:{name}` — walk a specific journey
3. `/claude-tweaks:stories` — generate QA stories from what was reviewed
4. `/claude-tweaks:capture` — save ideas surfaced during the review
```

When invoked by `/review`, omit Next Actions — the parent handles flow control and summary.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Silently skipping when no browser is found | Always report the detection failure and offer options — never skip without telling the user |
| Skipping First Impressions in visual review | The whole point is raw reaction before structured analysis — don't make it analytical |
| Starting the dev server without asking | Dev URL auto-detection offers to start — it doesn't force it |
| Generic visual ideas ("improve the UX") | Ideas must be concrete and implementable in the current tech stack |
| Running visual review without a running app | The browser can't inspect what isn't served — verify the URL responds first |
| Using Playwright MCP tools (`mcp__playwright__*`) | Standardized on playwright-cli — use CLI commands, not MCP tools. playwright-cli is more token-efficient and supports parallel sessions. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Invokes /visual-review in Step 6. In full mode (code + visual), visual review runs after code review. In standalone visual/journey/discover modes, /review delegates entirely to /visual-review. |
| `/claude-tweaks:browse` | /visual-review uses /browse's operation mapping table for browser commands. /browse is the command reference, /visual-review is the review procedure. |
| `/claude-tweaks:stories` | Provides `dev-url-detection.md` for URL resolution. /visual-review may recommend running /stories after discovering pages. |
| `/claude-tweaks:journeys` | /visual-review (journey mode) walks journeys created by /journeys. /visual-review (discover mode) creates new journey files. |
| `/claude-tweaks:test` | QA data from /test enriches the visual review (page inventories, caveats, screenshots). |
| `/claude-tweaks:flow` | /flow invokes /review in full mode, which delegates to /visual-review for the browser portion. Flow handles browser detection fallback to code-only mode. |
| `/claude-tweaks:init` | Phase 0 configures browser backends. Phase 7 delegates to /visual-review discover for brownfield journey bootstrapping. |
| `/claude-tweaks:capture` | /visual-review may recommend capturing ideas surfaced during the review |
