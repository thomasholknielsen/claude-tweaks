# Open Items — Dispatch/wrap-up Auto-merge checkout fix

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | worktree — `.claude/worktrees/demo-observation-plan-design` (locked, branch `worktree-demo-observation-plan-design`) — `git worktree list --porcelain` | accepted | Live session (pid 14087, still running) owns this worktree — not mine to touch |
| 2 | wrap-up | worktree — `.claude/worktrees/flow-spec-295-296-297` (unlocked, branch `flow/spec-295-296-297`, in reaper domain) — `git worktree list --porcelain` | fixed | Confirmed branch tip content-identical to squash-merge commit `e91fe3c8` (PR #300, already on main) — safe to remove |
| 3 | wrap-up | worktree — `.claude/worktrees/policy-read-path-design` (locked, branch `worktree-policy-read-path-design`) — `git worktree list --porcelain` | fixed | Lock stale (owning pid 24015 no longer running); branch tip confirmed an ancestor of main — safe to remove |
| 4 | wrap-up | branch — `origin/worktree-issue-321` merged into `origin/main`, not deleted — `git branch -r --merged origin/main` | fixed | Deleted remote branch (commits preserved in main's history) |
| 5 | wrap-up | PR — #305 open, head `fix-278-277-claude-md` (another lane) — `gh pr list --state open` | fixed | Merged (conflict resolved per IL-44: kept PR's Don'ts-extraction structure, re-homed IL-124 into docs/donts.md — IL-121/IL-123 already present on the PR branch), pushed `8152d61d`, branch deleted |
