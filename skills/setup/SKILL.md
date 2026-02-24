---
name: claude-tweaks:setup
description: Use when bootstrapping the workflow system for a project — installs plugin dependencies, creates directory structure, and verifies readiness for the full lifecycle.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a recommended next step, not a navigation menu.


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

Provides `/superpowers:brainstorm`, `/superpowers:write-plan`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, and `/superpowers:dispatching-parallel-agents`.

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

Note: `code-simplifier` is a built-in subagent type (`subagent_type="code-simplifier:code-simplifier"` in the Task tool). No plugin installation needed — just verify it's available by checking the Task tool's agent type list.

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

## Step 3.5: Suggest .gitignore Entries

Check if `.gitignore` exists and whether it already covers workflow artifacts. Suggest entries for transient files that shouldn't be committed:

```gitignore
# claude-tweaks: transient artifacts
screenshots/
```

If `stories/` exists or will be created, ask the user:

```
Should story YAML files be committed to version control?
1. Yes — stories are part of the project's test suite (Recommended)
2. No — add stories/ to .gitignore
```

Do not modify `.gitignore` without asking — the user may have opinions about what to track.

## Step 4: Verify CLAUDE.md

Check if `CLAUDE.md` exists in the project root.

- **Exists** — Good. Verify it has a `Commands` section (needed by `/claude-tweaks:review` for running checks).
- **Missing** — Suggest running `/claude-tweaks:codebase-onboarding` to generate it. The workflow system works best with a CLAUDE.md that documents commands, conventions, and don'ts.

## Step 5: Verify Git

The workflow system relies on git for change tracking (`/claude-tweaks:review` uses `git diff`, `/claude-tweaks:wrap-up` checks recent commits).

- Check that the current directory is a git repo
- If not, warn the user — the workflow will partially work but `/claude-tweaks:review` and `/claude-tweaks:wrap-up` will be degraded

## Step 5.5: Worktree Configuration (Optional)

`/claude-tweaks:build worktree` and `/claude-tweaks:flow worktree` use `/superpowers:using-git-worktrees` to create isolated workspaces. This step checks if a worktree directory is configured.

1. Check if `.worktrees/` or `worktrees/` directory exists in the project root
2. Check CLAUDE.md for a worktree directory preference (e.g., `worktree-dir: .worktrees`)
3. If neither exists, offer to configure:

```
Worktree mode (/build worktree, /flow worktree) needs a directory for isolated workspaces.

1. Project-local `.worktrees/` **(Recommended)** — worktrees live alongside the project
2. Global `~/.config/superpowers/worktrees/` — shared across all projects
3. Skip — configure later. `/superpowers:using-git-worktrees` will prompt at first use.
```

4. If a directory is chosen, verify it's in `.gitignore` (suggest adding if not)

This step is optional — `using-git-worktrees` will prompt for configuration at first use if unconfigured.

## Step 6: Browser Integration (Optional)

Ask the user if they want to set up browser integration. This lets Claude Code interact with web pages — useful for testing UIs, running QA stories, scraping docs, and verifying deployments.

### Detect Existing Setup

Before offering options, check what's already configured:

```bash
# Check for playwright-cli
command -v playwright-cli >/dev/null 2>&1 && echo "playwright-cli: installed" || echo "playwright-cli: not found"

# Check for Chrome MCP tools
# Look for mcp__claude_in_chrome__navigate in available tools
```

If either backend is already available, report the status and skip to the next step.

### Present Options

If no browser integration is detected, offer:

```
Browser integration lets Claude Code control a web browser for testing, QA story validation, and scraping.

1. Install playwright-cli **(Recommended)** — Headless CLI automation. Parallel sessions, token-efficient.
2. Both (playwright-cli + Chrome MCP) — Headless + observable Chrome with your real profile.
3. Skip — Set up later. Browser features are optional.
```

### Option 1: playwright-cli (Recommended)

Headless browser automation via the Playwright CLI.

**Prerequisites:**
- Node.js installed

**Setup:**
```bash
npm install -g @playwright/cli@latest
```

Verify:
```bash
command -v playwright-cli && playwright-cli --version
```

### Option 2: Both (playwright-cli + Chrome MCP)

Install playwright-cli (as above), plus set up Chrome MCP for observable automation using your real Chrome browser.

**Chrome MCP setup:**
1. Install the Chrome extension for Claude
2. Restart Claude Code with: `claude --chrome`
3. Verify Chrome MCP tools are available (look for `mcp__claude_in_chrome__*`)

### Option 3: Skip

Note that the user skipped browser integration. The workflow system works without it — `/claude-tweaks:browse`, `/claude-tweaks:stories`, and `/claude-tweaks:review qa` require a browser backend, but all other skills function normally.

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

### Worktree Configuration
| Item | Status |
|------|--------|
| Worktree directory | {configured: {path}/not configured/skipped} |

### Browser Integration
| Backend | Status |
|---------|--------|
| playwright-cli | {installed/not installed/skipped} |
| Chrome MCP | {available/not available/skipped} |

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
| Forcing a restart mid-setup for Chrome MCP | Note that a restart is needed but finish the remaining steps first |

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
| `/claude-tweaks:browse` | Depends on the browser backends that /setup configures in Step 6 |
| `/superpowers:using-git-worktrees` | /claude-tweaks:setup optionally configures the worktree directory that `using-git-worktrees` needs |
| All workflow skills | Depend on the structure /claude-tweaks:setup creates |
