# Why a still-locked worktree isn't necessarily reaper-judged

Referenced from `scan-procedures.md` Step 4.5's locked-worktree paragraph.

`SessionStart`'s reaper (`bin/lib/hooks/worktree-reap.js`) collects *some* stale
worktrees unattended, but its reach is deliberately narrower than Step 4.5's, so do
not read a still-locked worktree as one the reaper has already judged. It only
considers worktrees under `{REPO_ROOT}/.claude/worktrees/` (ADR-0004's
harness-owned domain — `.worktrees/` belongs to superpowers'
`finishing-a-development-branch`), it unlocks only when the lock's owning pid is
provably dead **and** nothing in the worktree has been modified for 24h, and it
reaps nothing at all on a repo where its own integration-branch resolution comes up
empty (`_shared/integration-branch.md` — the reaper's row in the per-consumer
fallback table; it may consult only the `integration-branch:` policy key and
`origin/HEAD`, never the checked-out branch). Anything still locked at `/tidy` time
is therefore in use, unrecognized, recently active, out of the reaper's domain, or
on a repo where the reaper is inert.
