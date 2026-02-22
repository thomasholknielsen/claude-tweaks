---
name: claude-tweaks:setup
description: Use when bootstrapping the workflow system for a project — installs plugin dependencies, creates directory structure, and verifies readiness for the full lifecycle.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Setup

Bootstrap the workflow system for a project. Installs dependencies, creates directory structure, and verifies everything is wired up.

```
[ /claude-tweaks:setup ] → /claude-tweaks:codebase-onboarding → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorm → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
  ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- First time using the workflow system on a project
- After cloning a repo that uses this workflow (to verify dependencies)
- When `/claude-tweaks:help` or `/claude-tweaks:build` fails because something is missing
- The user says "set up the workflow" or "get me started"

## Step 1: Check Plugin Dependencies

The workflow system depends on two external plugins. Check if they're installed:

### Required: Superpowers

Provides `/superpowers:brainstorm`, `/superpowers:write-plan`, and `/superpowers:execute-plan`.

```bash
# Check if installed
ls ~/.claude/plugins/ | grep -i superpowers
```

If missing, install:
```bash
claude plugins add obra/superpowers-marketplace
```

### Required: Code Simplifier

Provides the `code-simplifier` subagent used by `/claude-tweaks:build` and `/claude-tweaks:review`.

```bash
# Check if installed — it's a built-in agent type, verify it's available
# code-simplifier is part of claude-code's built-in subagent types
```

Note: `code-simplifier` is a built-in subagent type (`subagent_type="code-simplifier"` in the Task tool). No plugin installation needed — just verify it's available by checking the Task tool's agent type list.

### Optional: Claude Tweaks

If the user has a personal tweaks plugin, note it but don't require it.

## Step 2: Create Directory Structure

Check and create the required directories:

```
specs/              → Spec files and INBOX
docs/plans/         → Design docs (from `/superpowers:brainstorm`) and execution plans (from `/superpowers:write-plan`)
docs/journeys/      → User and developer journey files (created by /claude-tweaks:build, tested by /claude-tweaks:review visual modes)
.claude/skills/     → Skill files (should already exist if this skill is running)
```

For each directory, check if it exists first. Only create what's missing.

## Step 3: Create Starter Files

### `specs/INBOX.md` (if missing)

```markdown
# INBOX

Ideas and features captured for future specification. Use `/claude-tweaks:capture` to add items, `/claude-tweaks:tidy` to review.

<!-- Add new entries at the bottom using /claude-tweaks:capture -->
```

### `specs/DEFERRED.md` (if missing)

```markdown
# Deferred Work

Work deferred from builds and reviews with context for when to pick it up. Items here came from active implementation — they have origin specs, file references, and timing triggers.

Unlike INBOX (raw ideas), deferred items have rich context and specific triggers for when they should be revisited.

<!-- Items are added by /claude-tweaks:build, /claude-tweaks:review, and /claude-tweaks:wrap-up -->
```

### `specs/INDEX.md` (if missing)

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

## Step 4: Verify CLAUDE.md

Check if `CLAUDE.md` exists in the project root.

- **Exists** — Good. Verify it has a `Commands` section (needed by `/claude-tweaks:review` for running checks).
- **Missing** — Suggest running `/claude-tweaks:codebase-onboarding` to generate it. The workflow system works best with a CLAUDE.md that documents commands, conventions, and don'ts.

## Step 5: Verify Git

The workflow system relies on git for change tracking (`/claude-tweaks:review` uses `git diff`, `/claude-tweaks:wrap-up` checks recent commits).

- Check that the current directory is a git repo
- If not, warn the user — the workflow will partially work but `/claude-tweaks:review` and `/claude-tweaks:wrap-up` will be degraded

## Step 6: Browser Integration (Optional)

Ask the user if they want to set up browser integration. This lets Claude Code interact with web pages — useful for testing UIs, scraping docs, verifying deployments, etc.

### Detect Existing Setup

Before offering options, check what's already configured:

```bash
# Check for Playwright MCP server
cat .mcp.json 2>/dev/null | grep -i playwright
cat ~/.claude.json 2>/dev/null | grep -i playwright
```

If browser tools are already available (e.g., `mcp__playwright__*` tools exist), report the status and skip to the next step.

### Present Options

If no browser integration is detected, offer:

```
Browser integration lets Claude Code control a web browser for testing, scraping, and verification.

How would you like to set it up?
1. Chrome Extension **(Recommended)** — Uses your real Chrome browser with existing login sessions. Simple setup.
2. Playwright MCP — Headless browser automation. No extension needed, supports multiple browsers.
3. Skip — Set up later
```

### Option 1: Chrome Extension

The official native integration. Uses Chrome's Native Messaging API to connect Claude Code to a running Chrome/Edge window.

**Prerequisites:**
- Google Chrome or Microsoft Edge
- Claude extension installed from the Chrome Web Store
- Claude Code v2.0.73+
- Direct Anthropic plan (Pro, Max, Teams, or Enterprise)

**Setup steps:**

1. Check if the Chrome extension is installed by looking for the native messaging host config:
   ```bash
   # macOS — Chrome
   ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json 2>/dev/null
   # macOS — Edge
   ls ~/Library/Application\ Support/Microsoft\ Edge/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json 2>/dev/null
   # Linux — Chrome
   ls ~/.config/google-chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json 2>/dev/null
   ```

2. If not found, tell the user:
   ```
   Install the "Claude" extension from the Chrome Web Store:
   https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn

   Once installed, come back and re-run this step.
   ```

3. If found, enable Chrome integration:
   ```
   To use Chrome in this session: /chrome
   To enable by default: run /chrome and select "Enabled by default"
   ```

4. Verify by asking the user to confirm Chrome is open, then test with a simple navigation.

**Troubleshooting notes to share if setup fails:**
- Extension must be enabled in `chrome://extensions`
- Dismiss any JavaScript modals (alert/confirm/prompt dialogs) in Chrome
- Restart the extension from `chrome://extensions` if the browser isn't responding

### Option 2: Playwright MCP

Headless browser automation via the Playwright MCP server. Works without a Chrome extension.

**Prerequisites:**
- Node.js installed

**Setup steps:**

1. Add the Playwright MCP server:
   ```bash
   claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest
   ```

2. Verify the server is registered:
   ```bash
   cat .mcp.json 2>/dev/null | grep -i playwright || cat ~/.claude.json 2>/dev/null | grep -i playwright
   ```

3. Tell the user to restart Claude Code for the MCP server to activate, then verify with `/mcp`.

4. On first use, Playwright may need to install browser binaries. If tools error with a missing browser, run `browser_install`.

### Option 3: Skip

Note that the user skipped browser integration. The workflow system works without it — browser tools are an optional enhancement.

## Step 7: Present Status

```markdown
## Workflow Setup

### Dependencies
| Dependency | Status | Action |
|------------|--------|--------|
| Superpowers plugin | {installed/missing} | {none/installed it} |
| Code simplifier | {available/unavailable} | {none/note} |

### Directory Structure
| Directory | Status |
|-----------|--------|
| `specs/` | {exists/created} |
| `docs/plans/` | {exists/created} |
| `docs/journeys/` | {exists/created} |
| `.claude/skills/` | {exists} |

### Starter Files
| File | Status |
|------|--------|
| `specs/INBOX.md` | {exists/created} |
| `specs/DEFERRED.md` | {exists/created} |
| `specs/INDEX.md` | {exists/created} |

### Project Configuration
| Item | Status | Recommendation |
|------|--------|---------------|
| CLAUDE.md | {exists/missing} | {none/run `/claude-tweaks:codebase-onboarding`} |
| Git repo | {yes/no} | {none/`git init`} |

### Browser Integration
| Method | Status |
|--------|--------|
| Chrome Extension | {connected/not detected/skipped} |
| Playwright MCP | {configured/not configured/skipped} |

### Ready to Go

{All green:}
**Recommended next:** `/claude-tweaks:capture` — add your first idea. Or run `/claude-tweaks:codebase-onboarding` to generate CLAUDE.md and skills for this project.

{Missing items → list what needs attention with numbered fix actions}
```

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Modifying existing INBOX.md or INDEX.md content | Setup is additive — it creates missing files but must not overwrite user content |
| Skipping CLAUDE.md verification | Without CLAUDE.md, /claude-tweaks:review can't find verification commands |
| Running setup in a non-git directory without warning | /claude-tweaks:review and /claude-tweaks:wrap-up depend on git — the user should know about degraded behavior |
| Installing browser tools without asking | Browser integration is optional — always let the user choose whether and how to set it up |
| Forcing a restart mid-setup for Playwright MCP | Note that a restart is needed but finish the remaining steps first |

## Important Notes

- This skill is idempotent — safe to re-run. It only creates what's missing.
- It does NOT modify existing files — if `INBOX.md` or `INDEX.md` already have content, they're left alone.
- Plugin installation may require user confirmation — Claude Code prompts for plugin permissions.
- The tier structure in INDEX.md is a starter template — adapt the tier labels to your project's roadmap.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:codebase-onboarding` | Generates CLAUDE.md, skills, and rules — complements /claude-tweaks:setup's structural bootstrapping |
| `/claude-tweaks:capture` | First skill to use after /claude-tweaks:setup — add ideas to the INBOX |
| `/claude-tweaks:help` | Shows workflow status — useful to verify /claude-tweaks:setup worked |
| All workflow skills | Depend on the structure /claude-tweaks:setup creates |
