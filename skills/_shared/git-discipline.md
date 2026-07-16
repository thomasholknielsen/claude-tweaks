# Git Discipline

Canonical git rules for skills that commit code. Referenced from `/build`, `/review`, `/wrap-up`, `/simplify`, `/journeys`, and any other skill that runs `git commit`.

For working-directory rules specific to dispatched subagents (anchoring CWD, `git -C "$WORKTREE"`, `pwd` checks before commit), see `subagent-output-contract.md` (Working Directory Discipline section) — that contract applies whenever a skill dispatches an agent that runs `git` or `node --test`.

During worktree-mode pipeline runs, the wrong-checkout commit rule is mechanically enforced by the plugin's PreToolUse hook (E1) — a denied commit names the assigned worktree; clear the assignment with `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run` when legitimately finishing the branch. Enforcement is scoped to the session that recorded the worktree: a commit from a different session (e.g. unrelated fix work in the main checkout while the pipeline runs elsewhere) is allowed with a warning, not denied. Run `close-run` only from the session that owns the run or at the merge/finish handoff — closing another session's live run ends its enforcement and event logging mid-flight.

Independent of any pipeline run, a project can opt into `worktree.always: true` in `.claude-tweaks/policy.yml` — when set, the same PreToolUse hook denies any `Edit`, `Write`, `NotebookEdit`, or `git commit` whose target isn't already inside a linked git worktree, even before `/build` or `/flow` has ever run. Unlike E1, this check needs no recorded run state; it fires from the first prompt of a session. `/init` Phase 0 Step 6 offers this opt-in during bootstrap (recommended by default, re-offered on later re-runs if declined) — the flag can also be hand-edited into `policy.yml` directly. Set up the worktree first via `/superpowers:using-git-worktrees`, then retry the edit inside it.

This check is independent of `close-run` — closing a pipeline run's worktree assignment satisfies E1 only, not this gate, since it never reads run state. It matters most at the merge/finish handoff: a clean merge is unaffected (`git merge`/`git checkout`/`git push` aren't gated), but resolving a merge **conflict** requires `Edit` + `git commit` in the main checkout, which this gate denies regardless of `close-run`. See `flow/worktree-merge.md`'s conflict branch for the scratch-worktree adaptation (resolve in a throwaway linked worktree, then `git merge --ff-only` the result into the main checkout).

Known consequence of `worktree.always`: entering a worktree mid-session (via `EnterWorktree`/`isolation: "worktree"`) pivots the session's own storage into a project bucket keyed by the worktree's path, so `claude --resume` from the parent project no longer lists that session. This is an upstream Claude Code limitation (closed as known/not-planned upstream), not a claude-tweaks bug — see README's "Worktree sessions and `claude --resume`" section for the full explanation and the manual-worktree workaround.

A sibling lever, `execution.always: subagent` in the same file, pins `/claude-tweaks:build`'s execution-strategy axis to `subagent` — `batched` is never offered by the build-strategy prompt and is rejected if passed explicitly (see `/claude-tweaks:build`'s Build Options). Unlike `worktree.always`, this lever has no mechanical `PreToolUse` backstop: there is no interceptable tool call for "which execution strategy did the assistant choose," the way there is for "which directory did this edit land in." Enforcement here is the same as every other lever in the auto-mode-contract system (scope-creep, review-severity-floor, etc.) — the assistant reads `.claude-tweaks/policy.yml` and follows it, with no code-level fallback if it doesn't.

## Rules — NON-NEGOTIABLE

These apply in ALL modes. They exist because multiple processes may commit to the same branch simultaneously, and because shared history must not be rewritten.

| Rule | Reason |
|------|--------|
| **NEVER `git reset`** | Other processes may be committing. A reset wipes their work. |
| **NEVER `git checkout .` or `git restore .`** | Same reason — destroys concurrent work. |
| **NEVER force push** | Rewrites shared history. If an alternative to plain `--force` is truly unavoidable, use `--force-with-lease` so the push aborts on unexpected remote movement instead of clobbering it. |
| **Push commits promptly** | Local-only commits are vulnerable to loss. |
| **Stage specific files only** | Never `git add -A` or `git add .`. |
| **Verify commits landed** | Always `git log --oneline -3` after committing. |
| **Never `--no-verify` / `--no-gpg-sign`** | Skipping hooks or signing bypasses safety the user opted into. If a hook fails, fix the underlying issue. |

## Merge conflict resolution

If you encounter a merge conflict, resolve it — do not reset or discard. Read both sides of the conflict, understand the intent of each change, and produce a merged result that preserves both. After resolving, run verification to confirm the resolution didn't break anything. If the conflict is too complex to resolve confidently, present both versions to the user and ask which to keep.

## Commit message style

Imperative voice, no Conventional Commit prefixes (`feat:`, `fix:`, `chore:`). Example: `Tighten auto-mode contract and consolidate cross-skill duplications` — not `chore: tighten auto-mode contract`. The repo's commit log is the style reference.

## When commits land in the wrong place

If `git log` shows the commit on an unexpected branch, do NOT try to undo with `git reset` or `git checkout`. Instead:

1. Check `git rev-parse --show-toplevel` and `git branch --show-current` to confirm where you are.
2. If the commit is on the wrong branch but the work is correct, cherry-pick it to the right branch.
3. If the wrong-branch commit must be removed, surface the problem to the user — never silently rewrite history.

## Realigning a diverged local branch to origin (without `git reset`)

If a local branch (e.g. `main`) has diverged from its remote counterpart — commits landed on both sides, so neither is a fast-forward of the other — and you've confirmed (a) the working tree is clean and (b) the local-only commits' content is already fully present upstream (e.g. an equivalent commit was cherry-picked and pushed separately), realign the local ref without `git reset --hard`:

```bash
git checkout --detach HEAD          # move off the branch first — its ref is untouched
git branch -f main origin/main      # force the (now-unchecked-out) branch ref to match origin
git checkout main                   # switch back; branch now matches origin exactly
```

This only discards the *local branch pointer's* view of those superseded commits — nothing is lost, since their content is already safely on origin, and the orphaned commits remain reachable via `git reflog` until GC. Do not use this when the local-only commits contain content that is NOT already present elsewhere — that is exactly the "wipes concurrent work" case the NEVER-`git reset` rule exists to prevent.
