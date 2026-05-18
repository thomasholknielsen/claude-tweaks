# Build Options — full resolution rules, invocation examples, and the Spec-vs-Design mode table

Loaded by `/claude-tweaks:build` when the user (or this skill) needs the full matrix of execution and git strategies, the invocation grammar, or the spec-vs-design mode lookup. The SKILL.md keeps a compact summary; this file owns the verbose detail.

## Build Options

Two orthogonal choices control how `/build` runs. Combine them freely:

| Axis | Option | Behavior | Best for |
|------|--------|----------|----------|
| **Execution** | `subagent` (default) | Invokes `/superpowers:subagent-driven-development`. Fresh subagent per task; automated spec reviewer + code quality reviewer + final review. No human in the loop. Push commits promptly. | Solo work, trusted pipeline |
| **Execution** | `batched` | Invokes `/superpowers:executing-plans`. Executes 3 tasks per batch, pauses for human review after each batch. User approves, requests changes, or skips tasks. Push after each approved batch. | Complex specs, unfamiliar code, hands-on review |
| **Git** | `worktree` (default) | Before execution, invokes `/superpowers:using-git-worktrees` to create an isolated workspace with dependency install and baseline test verification. All commits land in the worktree on a feature branch. At handoff, delegates to `/superpowers:finishing-a-development-branch` (merge, PR, keep, or discard). | Parallel work, team projects, risky changes, safe automation |
| **Git** | `current-branch` | Commits land directly on the current branch. No isolation — simple and fast. | Quick local edits, no isolation needed |

```
/claude-tweaks:build 42                         → subagent + worktree (default)
/claude-tweaks:build 42 current-branch          → subagent + current branch (no isolation)
/claude-tweaks:build 42 batched                 → human-reviewed batches + worktree
/claude-tweaks:build 42 batched current-branch  → human-reviewed batches + current branch
/claude-tweaks:build 42 auto                    → subagent + worktree, no confirmations
/claude-tweaks:build 42 auto current-branch     → subagent + current-branch, no confirmations
```

### Default resolution

1. Explicit arguments (`/claude-tweaks:build 42 batched current-branch`) — always win
2. CLAUDE.md settings — project-level defaults:
   ```
   ## Build
   execution-strategy: subagent
   git-strategy: worktree
   ```
3. Fallback — `subagent` + `worktree`
4. `auto` keyword — skip intermediate confirmation prompts. Uses defaults (`subagent` + `worktree`) unless overridden. Architecture alignment (Common Step 4.5) auto-routes deviations per the auto-mode contract: Beneficial→AUTO (log spec edit commit), Neutral→STAGED, Concerning→KEPT-PROMPT. Decisions that warrant human judgment are staged to the Wrap-Up Review Console (Step 8.6) rather than stopping the pipeline mid-flow — see `_shared/auto-mode-contract.md` for the silences inventory and the HARD-GATE exemption list.

## Input

`$ARGUMENTS` = spec number, design doc path, or topic name — optionally followed by execution strategy (`batched`), git strategy (`worktree`), and/or `auto`.

### Resolve the input

1. **Spec number** (e.g., `42`, `73`) → **Spec mode** — full lifecycle with prerequisites, INDEX.md tracking, and spec compliance
2. **Design doc path** (e.g., `docs/superpowers/specs/2026-02-21-meal-planning-design.md`) → **Design mode** — build directly from the design doc, skipping spec machinery
3. **Topic name** (e.g., `meal planning`) → search for a matching design doc in `docs/superpowers/specs/*-design.md` AND a matching spec in `specs/`. If both exist, present numbered options:

```
Found both a spec and a design doc for "{topic}":
1. Spec mode (spec {N}: {title}) — Full lifecycle with prerequisites and tracking
2. Design mode ({design doc filename}) — Build directly, skip spec machinery
```

If only one exists, use it.
4. **No arguments** → check conversation context or recent git activity for clues. Ask if unclear.

### Prompt for build options

When execution strategy AND git strategy are both missing from arguments, ask once — the two choices are correlated (the 2x2 above already enumerates the combinations), so they are one decision:

```
How should this build run?

1. Subagent + worktree **(Recommended)** — automated review chain, isolated workspace
2. Subagent + current-branch — automated review chain, no isolation
3. Batched + worktree — human reviews every 3 tasks, isolated workspace
4. Batched + current-branch — human reviews every 3 tasks, no isolation
```

When only ONE was provided as an argument (e.g., `/build 42 batched`), ask just for the missing one with a simple 2-option prompt. Skip the prompt entirely if both were provided.

**In `auto` mode**, skip this prompt and use the CLAUDE.md / fallback values without asking (per the Pipeline Config Manifesto contract — see `_shared/auto-mode-contract.md`).

## Spec vs Design mode

| Mode | Source | Skips | Best for |
|------|--------|-------|----------|
| **Spec mode** | `specs/{N}-*.md` | Nothing | Tracked work with acceptance criteria, dependencies, and INDEX.md |
| **Design mode** | `docs/superpowers/specs/*-design.md` | `/claude-tweaks:specify`, prerequisite checks, INDEX.md | Quick builds where the design doc is clear enough to execute directly |
