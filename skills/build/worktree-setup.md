# Common Step 1 — Worktree Setup

Runs only when the user specified `worktree` (or it's the default). Skipped entirely in `current-branch` mode.

**Skip when already in a shared worktree (multi-spec).** If `MULTISPEC_SHARED_WORKTREE=1` is set, or superpowers Step 0 detects the session is already inside a linked worktree (`GIT_DIR != GIT_COMMON`, and not a submodule), the run's single shared worktree already exists and the pipeline is running inside it. **Skip this entire procedure** — do not create a nested worktree and do not finish the branch between specs. `/flow` created the worktree once up front and finishes it once at the end of the multi-spec run (see `skills/flow/multi-spec.md`, "Shared worktree").

## Base ref — branch from local HEAD, not stale origin

claude-tweaks branches a worktree from your **current local state** (the branch you ran `/build` on, which may carry merged specs and in-progress integration commits) — NOT from the remote default branch.

The native `EnterWorktree` tool exposes **no base-ref parameter** (it accepts only `name`/`path`). The base is governed entirely by the harness setting **`worktree.baseRef`**:

- `fresh` (the harness **default**) → branches from `origin/<default-branch>`. On a project whose integration branch is local and ahead of the remote default (e.g. a long-lived `dev`), this silently branches from a **stale** commit.
- `head` → branches from your current local HEAD. **This is the value claude-tweaks expects.**

Set `worktree.baseRef: "head"` in `settings.json`. Because the plugin cannot pass the base ref through the tool, Step 0 below **verifies** the resulting base and surfaces a mismatch loudly rather than letting it pass silently.

## Procedure

0. **Capture the expected base** — before creating anything, record the commit the worktree should branch from:
   ```bash
   EXPECTED_BASE=$(git rev-parse HEAD)
   BASE_BRANCH=$(git branch --show-current)
   ```

1. **Pre-flight merge check** — read the `Pre-flight / merge-check` CLAUDE.md setting (default: `true`). When enabled, compare against the **upstream of the current branch** (or the detected remote default), never a hardcoded `main`:
   ```bash
   # Upstream of current branch, else remote default branch (origin/HEAD)
   UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null) \
     || UPSTREAM="origin/$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
   git fetch "${UPSTREAM%%/*}" "${UPSTREAM#*/}" 2>/dev/null
   ahead=$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null)
   ```
   If `ahead > 0`, surface the divergence before creating the worktree:
   ```
   {UPSTREAM} has {N} commit(s) since your local copy:

   {git log --oneline HEAD..$UPSTREAM | head -5}

   Long-running worktrees diverge from the integration branch and create merge conflicts later. Options:
   1. Rebase {UPSTREAM} into local first, then create worktree **(Recommended)**
   2. Continue with current state — accept the conflict at branch finish
   ```
   In `auto` mode, automatically choose option 2 and add a ledger entry with phase `ops` and status `acknowledged` documenting the divergence (so wrap-up surfaces it as a manual step).
2. Invoke `/superpowers:using-git-worktrees` to create an isolated workspace
3. The skill handles: branch creation, dependency install, baseline test verification
4. **Verify the base ref** — immediately after creation, before any commits, confirm the worktree branched from `EXPECTED_BASE`:
   ```bash
   ACTUAL_BASE=$(git -C "$WORKTREE" rev-parse HEAD)
   ```
   If `ACTUAL_BASE != EXPECTED_BASE`, the worktree branched from the wrong commit (almost always `worktree.baseRef: fresh` pulling a stale `origin/<default-branch>`). **STOP and surface it** — do not proceed on a stale base:
   ```
   ⚠ Worktree base mismatch — branched from {ACTUAL_BASE short} but expected {EXPECTED_BASE short} ({BASE_BRANCH}).
   This is the harness `worktree.baseRef` setting (default `fresh` = origin default branch), which the plugin cannot override through EnterWorktree.

   Fix: set `worktree.baseRef: "head"` in settings.json, then options:
   1. Remove this worktree and recreate with baseRef=head **(Recommended)**
   2. Rebase this worktree branch onto {BASE_BRANCH} (replays the empty branch onto the right base)
   ```
   **Never recover with `git reset --hard`** — it is forbidden by `_shared/git-discipline.md` (it wipes concurrent work). Use rebase or recreate. In `auto` mode, choose option 1 (remove + recreate) since the branch has no commits yet, and log the correction to the auto-decision log.
4.5. **Record the assignment** — `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "$RUN_DIR" "$WORKTREE"` so the working-directory hook (E1) can enforce commits land in this worktree. Pass `--run "$RUN_DIR"` explicitly — resolve `$RUN_DIR` per `_shared/pipeline-run-dir.md` immediately before this command, do not rely on the command's own fallback resolver (`resolveRunDir`'s "newest non-terminal run" heuristic), which any stale never-closed run elsewhere in the project can win over this one; a Bash tool call does not inherit environment exports from an earlier, separate call, so `$RUN_DIR` must be re-resolved (or read back from wherever this run tracked it) in the same command that invokes `record-worktree`, not assumed to already be in the process environment. Run this with the **main checkout as cwd**, not the worktree — the worktree has no `.claude-tweaks/` directory, so run-dir resolution fails from inside it and the assignment silently isn't recorded. On success the command prints `claude-tweaks: worktree recorded for <run-id>` to stdout (or `claude-tweaks: no pipeline run dir found — worktree not recorded` if resolution failed); verify that confirmation line before proceeding. The command also stamps the current session as the run's owner (from `CLAUDE_CODE_SESSION_ID`), which scopes E1 enforcement to this session — commits from other sessions in the main checkout get a warning instead of a deny. If a different session later continues this pipeline (e.g. after a session fork), re-run `record-worktree --run "$RUN_DIR"` from the main checkout to reclaim ownership; it is an idempotent restamp.
5. All subsequent work happens in the worktree

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

## Impeccable hook consent (per-worktree)

If Impeccable's automatic design hook is enabled (`/impeccable:impeccable hooks on` — see `skills/init/bootstrap-steps.md` Step 10), its consent lives in `.impeccable/config.local.json` in the **working tree**, not `.git/`. A freshly created worktree starts with the hook off even when the main checkout has it enabled — re-run `/impeccable:impeccable hooks on` inside the new worktree if you want it active there too.

This is informational only. claude-tweaks does not auto-propagate Impeccable's hook consent into new worktrees — doing so would create an ongoing dependency on Impeccable's internal config file shape for a one-time, low-cost manual step.
