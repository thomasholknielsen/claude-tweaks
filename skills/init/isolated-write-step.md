# Phase 9 — Isolated Write Step (detailed procedure)

Loaded by `SKILL.md`'s Phase 9 when it's time to actually write the confirmed output. Covers
why this step exists, what it does and doesn't cover, and exactly how the write lands.

## Scope

Every write in this phase — the confirmed CLAUDE.md/skills/rules/docs-registry/local-file
work-record changes, plus Step 6's deferred `worktree-always` write when queued — happens
inside an isolated worktree, **unconditionally**, regardless of what `worktree-always`
currently says in `.claude-tweaks/policy.yml`. This is a stronger guarantee than the project
policy itself: even on a project that declined `worktree-always` entirely, `/init`'s own
confirmed writes still isolate themselves.

Reconnaissance and drift detection (Phases 1-8.5) are **not** part of this — they already ran
directly against the real checkout, including any uncommitted or untracked content, before
this phase started. Isolating them too would blind `/init` to exactly the state it exists to
read, most acutely on a freshly scaffolded, not-yet-committed project — the single most common
`/init` scenario. Only the already-decided output, fully determined by the time this phase
confirms, moves into the worktree.

## Pre-flight: dirty-file check

Before creating the worktree, check whether any file this phase is about to **patch** (as
opposed to create fresh) is currently dirty in the main checkout: `git status --porcelain --`
scoped to exactly the paths this run's Actions Performed table will touch (CLAUDE.md,
`.claude/skills/`, `.claude/rules/`, `docs/REGISTRY.md`, `.claude-tweaks/policy.yml`, any
local-file work records about to be patched). A dirty hit means the worktree's copy would be
stale relative to uncommitted local edits — surface it and ask the user to commit or stash
those specific files first, rather than silently overwriting or auto-stashing on their behalf.
Brand-new files this phase is about to create need no such check.

## Provisioning and landing

Once clear, follow `_shared/scratch-worktree.md`'s procedure: native `EnterWorktree` when
available, git-fallback `.worktrees/` otherwise, then the unconditional post-creation catch-up
from `_shared/worktree-setup.md`. This needs a valid HEAD to branch from — Step 5
(`bootstrap/step-05-verify-git.md`) already guarantees one exists, creating an empty initial
commit if the repo had none. `/init` deviates from `_shared/scratch-worktree.md`'s own
"provision only on demand" trigger, written for its other two callers (`/wrap-up`, `/tidy`),
whose provisioning is gated on `worktree-always` already being live: `/init` provisions
unconditionally, because the goal here is broader than gate compliance — protecting a
concurrent session from colliding on the main checkout while `/init` writes, and giving this
run's output a reviewable branch regardless of whether the project has opted into the policy
at all. **When there is no git repo at all** (Step 5's other branch), none of this applies —
writes fall back to the main checkout directly, same as `/init` behaved before this isolation
existed.

Apply every write in **one commit** — this phase's confirmed output is a single atomic unit,
unlike `_shared/scratch-worktree.md`'s per-remedy commits (independent auto-fixes). Land it per
that file's §5 (Returning to the integration branch): merge the commit, ff-only, into whichever
branch was checked out in the main checkout when this invocation started, verifying the branch
hasn't changed underfoot in the same command. This updates the main checkout's working tree
with the confirmed files — already committed. That's a deliberate change from `/init`'s prior
behavior of leaving generated files uncommitted for manual review; this phase's own
confirmation gate is now that review step. **Never push to `origin`** — publishing stays the
user's call, unchanged. Tear down the worktree via `ExitWorktree` once landed.
