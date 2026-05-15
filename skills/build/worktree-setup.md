# Common Step 1 — Worktree Setup

Runs only when the user specified `worktree` (or it's the default). Skipped entirely in `current-branch` mode.

## Procedure

1. **Pre-flight merge check** — read the `Pre-flight / merge-check` CLAUDE.md setting (default: `true`). When enabled:
   ```bash
   git fetch origin main 2>/dev/null
   ahead=$(git rev-list --count HEAD..origin/main 2>/dev/null)
   ```
   If `ahead > 0`, surface the divergence before creating the worktree:
   ```
   Main has {N} commit(s) since your local copy:

   {git log --oneline HEAD..origin/main | head -5}

   Long-running worktrees diverge from main and create merge conflicts later. Options:
   1. Rebase main into local first, then create worktree **(Recommended)**
   2. Continue with current state — accept the conflict at branch finish
   ```
   In `auto` mode, automatically choose option 2 and add a ledger entry with phase `ops` and status `acknowledged` documenting the divergence (so wrap-up surfaces it as a manual step).
2. Invoke `/superpowers:using-git-worktrees` to create an isolated workspace
3. The skill handles: branch creation, dependency install, baseline test verification
4. All subsequent work happens in the worktree

## Consent prompt (v5.1.0+)

`/superpowers:using-git-worktrees` now asks the user before creating a worktree (fixes superpowers #991). In `auto` mode, the consent is **pre-authorized** — the user passed `worktree` (or it's the default for `/flow`) which is an explicit opt-in. Answer affirmatively without surfacing the prompt to the user. Log entry:

```
AUTO {time} — Common Step 1: worktree consent pre-authorized by auto mode. Worktree created at {path}.
```

In interactive mode, surface the consent prompt as the skill normally would.

## If worktree creation fails

| Failure | Recovery |
|---------|----------|
| **Superpowers not installed** | Stop. Tell the user: "Superpowers plugin required for worktree mode. Install: `/plugin install superpowers@claude-plugins-official`" — or fall back to current-branch with confirmation. |
| **Git state prevents worktree** (uncommitted changes, dirty index) | Stop. Present the git issue and suggest: `git stash` or commit first, then retry. |
| **Branch already exists** | Offer: (1) Use existing worktree, (2) Remove and recreate, (3) Fall back to current-branch. |
