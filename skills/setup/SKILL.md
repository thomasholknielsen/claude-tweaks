---
name: claude-tweaks:setup
description: Use to bootstrap the workflow system — installs plugin dependencies, creates directory structure, and verifies the project is ready for /claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up.
---
> **Interaction style:** Present choices as numbered options (1, 2, 3…) so the user can reply with just a number. Do the same when suggesting the next skill to run.


# Setup

Bootstrap the workflow system for a project. Installs dependencies, creates directory structure, and verifies everything is wired up.

```
/claude-tweaks:setup → /claude-tweaks:codebase-onboarding → /claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
```

## When to Use

- First time using the workflow system on a project
- After cloning a repo that uses this workflow (to verify dependencies)
- When `/claude-tweaks:next` or `/claude-tweaks:build` fails because something is missing
- The user says "set up the workflow" or "get me started"

## Step 1: Check Plugin Dependencies

The workflow system depends on two external plugins. Check if they're installed:

### Required: Superpowers

Provides `brainstorming`, `writing-plans`, and `subagent-driven-development`.

```bash
# Check if installed
ls ~/.claude/plugins/ | grep -i superpowers
```

If missing, install:
```bash
claude plugins add obra/superpowers-marketplace
```

### Required: Code Simplifier

Provides the `code-simplifier` subagent used by `/claude-tweaks:review`.

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
docs/plans/         → Design docs (from brainstorming) and execution plans (from writing-plans)
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

### `specs/INDEX.md` (if missing)

```markdown
# Spec Index

Tiered roadmap of work units. Use `/claude-tweaks:specify` to add specs, `/claude-tweaks:next` to see what's ready to build.

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

## Step 6: Present Status

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
| `.claude/skills/` | {exists} |

### Starter Files
| File | Status |
|------|--------|
| `specs/INBOX.md` | {exists/created} |
| `specs/INDEX.md` | {exists/created} |

### Project Configuration
| Item | Status | Recommendation |
|------|--------|---------------|
| CLAUDE.md | {exists/missing} | {none/run `/claude-tweaks:codebase-onboarding`} |
| Git repo | {yes/no} | {none/`git init`} |

### Ready to Go
{All green → present options:}

What's next?
1. `/claude-tweaks:capture` — Add your first idea ⭐ Recommended
2. `/claude-tweaks:codebase-onboarding` — Generate CLAUDE.md and skills for this project
3. `/claude-tweaks:next` — See workflow status
4. Done for now

{Missing items → list what needs attention with numbered fix actions}
```

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
| `/claude-tweaks:next` | Shows workflow status — useful to verify /claude-tweaks:setup worked |
| All workflow skills | Depend on the structure /claude-tweaks:setup creates |
