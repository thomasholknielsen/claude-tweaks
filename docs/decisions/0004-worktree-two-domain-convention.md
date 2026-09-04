# 0004. Treat `.worktrees/` and `.claude/worktrees/` as two permanently separate domains, not one convention to converge on

- **Status:** accepted
- **Date:** 2026-07-09
- **Context:** `/claude-tweaks:challenge` debiasing brief `docs/plans/2026-07-08-worktree-directory-convention-brief.md`

## Context

`skills/init/bootstrap-steps.md` originally documented `.worktrees/` as "the standard worktree directory" and instructed migrating any `.claude/worktrees/` directory into it. A debiasing pass found this framing itself was the bug: `.worktrees/` (created via `git worktree add`, the git-fallback path in superpowers' `using-git-worktrees` Step 1b) and `.claude/worktrees/` (created by the native `EnterWorktree` harness tool, Step 1a) are two mutually exclusive creation paths, used depending on whether a native tool is available — not one convention that had drifted from the other. The question "which directory is correct" presupposed a single canonical answer needed to exist.

## Decision

Document and treat the two paths as permanently separate, coexisting ownership domains — native-tool-owned (`.claude/worktrees/`, cleaned up by the harness) and git-fallback-owned (`.worktrees/`, cleaned up by superpowers' `finishing-a-development-branch`) — rather than picking one as "the standard" and migrating the other into it. Any code or prose that needs to detect a worktree should query `git worktree list` or check `GIT_DIR != GIT_COMMON` (the existing pattern in `bin/lib/hooks/worktree-detect.js`) instead of asserting a fixed directory name.

## Alternatives considered

- **Promote `.claude/worktrees/` to the new standard** (the original leaning before debiasing) — rejected: the 4-active-worktrees-vs-0 evidence used to justify this is non-distinguishing, since a project with a native tool available will always show this distribution regardless of which convention is "correct" (native tools always win over the git-fallback path per `using-git-worktrees` Step 1a). Would also assert a stable claim about an unversioned harness implementation detail this repo doesn't control.
- **Keep `.worktrees/` as the sole standard, migrate `.claude/worktrees/` into it** (the original, pre-debiasing documented behavior) — rejected: this is the actively dangerous instruction the debiasing found. Migrating a live, harness-tracked worktree into a path superpowers' own cleanup will later `git worktree remove` deletes it out from under the harness's bookkeeping, with no way for the harness to know.

## Consequences

Consumers that need to detect or enumerate worktrees must use runtime discovery (`git worktree list`, `GIT_DIR != GIT_COMMON`) rather than a hardcoded path — this is more resilient to either upstream tool changing its convention, but means no single grep-able "the worktree directory is X" answer exists anymore; any future contributor asking that question needs pointing at this ADR rather than a single doc line. If a future claude-tweaks feature needs its own worktree-scoped exclusion or handling logic (as `bin/lib/code-health/scope.js` and its lenses did), it must account for both domains, not assume one.
