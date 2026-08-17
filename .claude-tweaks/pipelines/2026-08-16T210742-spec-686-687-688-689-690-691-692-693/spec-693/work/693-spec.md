---
record: 693
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 693: wrap-up/finishing-a-development-branch: worktree removal deletes its own shell cwd, forcing a 5-step error-and-recover cascade

Surface: backend

## Current State

- `wrap-up/cleanup-procedures.md` Section C step 4 already says: use `ExitWorktree` for the worktree the session stands in (raw `git worktree remove` fails on the live lock, `[IL-58]`), raw remove only for unoccupied worktrees. Yet one run's teardown ran `git worktree remove` on its own cwd — it succeeded and deleted the shell's working directory, producing a 5-step error-and-recover cascade (cwd reset, "working directory deleted", a refused `cd` back to the shared checkout under `worktree-always`, "not a git repository") before the model routed around via `gh api` with no git context.
- The path that reaches a raw remove: `flow/multispec-review-console.md`'s Shared teardown "Finish the shared branch" via `/superpowers:finishing-a-development-branch`, whose script does `cd "$MAIN_ROOT"` then `git worktree remove` — under `worktree-always` the `cd` to the main checkout is denied by the PreToolUse gate, so the model re-issues the remove without the cd. Nothing in the plugin's teardown states "removal is last, and only from a non-worktree cwd or via `ExitWorktree`" as an ordering invariant across the whole sequence.
- **Related:** #689 / #688 (same teardown row — routing pr-first through `pr-first-merge.md`, which never removes a worktree), #644 (reconcile reaps the calling session's own cwd worktree), #640 (worktree sessions: single plain commands), #683.

## Deliverables

1. Teardown ordering invariant, stated once in `wrap-up/cleanup-procedures.md` Section C and cited from `flow/multispec-review-console.md`'s Shared teardown and `flow/worktree-merge.md`: worktree removal is the **last** action; for the session's own worktree it is `ExitWorktree` only (never raw `git worktree remove`, never a `cd`-then-remove compound), executed after every git-needing step (merge / push / branch delete / claim release) has completed.
2. `flow/multispec-review-console.md`: when `/superpowers:finishing-a-development-branch` is invoked (the local-merge path only, after #689), pass an explicit instruction that it must **not** remove the worktree — the plugin's Section C step 4 does it via `ExitWorktree`.
3. Guard: `bin/lib/hooks/pre-tool-use.js`'s teardown gate additionally denies a raw `git worktree remove <path>` whose `<path>` resolves to the current session's cwd (or an ancestor of it), with a message pointing at `ExitWorktree` — extending the existing `checkTeardownGate`.
4. Test for the guard (cwd-inside-target denied; unrelated worktree allowed).

## Acceptance Criteria

- Section C names the ordering invariant; the two flow files cite it (grep for the invariant's heading).
- The finishing-a-development-branch invocation text in `multispec-review-console.md` carries the do-not-remove instruction.
- Guard unit test: `git worktree remove /path/to/current` from cwd `/path/to/current/sub` → deny; from the main checkout targeting a different worktree → allow.
- `npm test` green.

## Technical Approach

Prose + a small extension of the existing teardown gate in `pre-tool-use.js` (which already tracks `cd` across command segments — see its comments near line 270).

## Gotchas

- `ExitWorktree` requires `close-run` first (`[IL-116]`) — the invariant must keep step 3.6 before step 4, unchanged.
- The gate already resolves `cd <dir> && git worktree remove <rel>` against the post-cd cwd — reuse that, don't add a second parser.
- Coordinate with #644 so the reconcile-side own-cwd reap and this session-side guard share the "is this my cwd" predicate.

## Original request

wrap-up/finishing-a-development-branch: worktree removal deletes its own shell cwd, forcing a 5-step error-and-recover cascade

**Related:** none

Context: `git worktree remove` on the worktree the session was currently inside deleted its own shell cwd, triggering a cascade of 5 consecutive error-and-recover steps (cwd reset, "working directory deleted" recovery, a refused cd back to the shared checkout, a "not a git repository" error) before the model routed around it via gh api calls with no git context.

Scope: In wrap-up/finishing-a-development-branch's teardown sequence, perform `git worktree remove` last and only after an explicit cd out of the worktree (or from a non-worktree cwd) -- the current ordering guarantees this cascade on every worktree-run completion.
