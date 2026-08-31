# Design: Adopt-or-create gate for top-level worktree creation

**Origin record:** #1711

## Problem

`/claude-tweaks:flow`'s multi-spec shared-worktree mode assumes the orchestrating session
can freely call `EnterWorktree(name=...)` at `flow/multi-spec.md`'s Step 1 ("Create once, up
front") to create the shared worktree the whole multi-spec run builds into. That assumption
breaks whenever the orchestrating session is *already* inside a worktree when Step 1 runs —
`EnterWorktree` structurally refuses to nest a new worktree from inside an existing one.

Under this project's own `worktree-always` policy, this is not a rare edge case: an
interactive session is *always* already worktree-isolated by the time it reaches `/flow`,
because the session-start/pre-tool-use guard requires entering a worktree before any other
action. So multi-spec Step 1's `EnterWorktree(name=...)` call is guaranteed to refuse on this
project, every time.

#1711 reports the workaround one session took: delegate the shared worktree to a Task
subagent instead (since a fresh subagent isn't itself already isolated). That workaround
traded one refusal for a second, unrecoverable one — at Shared teardown time
(`multispec-review-console.md`'s Step 6), the subagent holding the worktree could not call
`ExitWorktree` either ("cannot be called from a subagent with a cwd override... this agent is
already isolated"). The batch merged successfully, but the shared worktree and its now-merged
branch were left on disk with no sanctioned removal path — the orchestrator ended up running a
manual `git worktree remove` + `git branch -D` outside the documented flow.

## Root cause

`flow/multi-spec.md`'s Step 1 has no "already isolated" detection at all. Two other call sites
in this plugin *do* already have equivalent logic, hand-rolled independently in each:

- `build/worktree-setup.md`'s Common Step 1 ("Skip creation when already inside an
  externally-created worktree") — checks `MULTISPEC_SHARED_WORKTREE=1` or superpowers Step 0's
  `GIT_DIR != GIT_COMMON` detection, and skips creating a nested worktree when true.
- `routine/create-and-update.md`'s Step 0 — checks whether the session is already inside a
  linked worktree before deciding whether to set one up.

`flow/multi-spec.md`'s Step 1 never got this treatment, which is the actual gap: not a missing
tool capability, but a missing gate in one specific procedure, with the fix pattern already
proven correct twice elsewhere in this same plugin.

This is a different problem from `dispatch/sequential-execution.md`'s #447 handling (a
dispatching session that is itself a **cwd-pinned Task subagent** and structurally cannot move
its cwd at all — its fix is a `git worktree add` + explicit `cd`-prefixed commands, because
cwd inheritance isn't available). This design's problem is a session that *could* move its cwd
via `EnterWorktree`, but is already elsewhere when Step 1 runs. The two stay separate
procedures; this design does not touch `dispatch/sequential-execution.md`.

## Design

### New shared section: `_shared/worktree-setup.md` — "Adopt-or-create"

Placed before the file's existing "Pre-creation reconcile" section, since it's the decision
that gates whether reconcile/creation happens at all.

- **Detection:** superpowers Step 0's own check — `GIT_DIR != GIT_COMMON` (via
  `git rev-parse --git-dir` / `--git-common-dir`), guarded against the submodule
  false-positive (`git rev-parse --show-superproject-working-tree`).
- **Already isolated:** do not call `EnterWorktree(name=...)` — it refuses to nest by design.
  Adopt the current worktree as the run's workspace. No `EXPECTED_BASE` capture applies (there
  is no separate "branch this worktree starts from" distinct from what's already checked out).
  The caller records the *actual* current branch name rather than assuming its own naming
  convention (e.g. `flow/spec-{N1}-{N2}...`) was applied — nothing renames the branch, since a
  rename could break an already-open PR on a worktree left over from unrelated prior work in
  the same session.
- **Not isolated:** create normally — unchanged `EnterWorktree(name=...)`, then Pre-creation
  reconcile / Post-creation catch-up as already documented.
- **Explicit non-goal, stated in the file:** a one-line cross-reference to
  `dispatch/sequential-execution.md`'s #447 section, and back, so a future reader doesn't try
  to merge these two structurally different problems.

### Consumer migration

1. **`flow/multi-spec.md` Step 1** ("Create once, up front") — gains the gate. This is the
   actual fix for #1711: the orchestrator's shared multi-spec worktree becomes whichever
   worktree it's already sitting in (always true for an interactive session under
   `worktree-always`), so no subagent delegation ever happens, and the `ExitWorktree` teardown
   refusal at Shared teardown Step 6 never triggers — the orchestrator holds the worktree
   itself for the whole run, exactly as the rest of `multi-spec.md` already assumes.
2. **`build/worktree-setup.md`** Common Step 1 — its existing "Skip creation when already
   inside an externally-created worktree" paragraph is replaced with a citation to the new
   shared section (byte-identical logic today; removes the duplication).
3. **`routine/create-and-update.md`** Step 0 — same migration; its inline version becomes a
   citation.

## Verification plan

- Prose-conformance test (per `skill-prose-conformance-tests`) pinning: the new section exists
  in `_shared/worktree-setup.md`, and none of the three consumers restate the detection logic
  inline anymore (a grep-based negative sweep, mirroring this repo's existing consolidation
  pattern, e.g. `[IL-32]`).
- Manual trace against #1711's exact scenario: orchestrator already isolated → multi-spec
  Step 1 → adopts current worktree → Shared teardown Step 6 later calls `ExitWorktree` on the
  orchestrator's own (never subagent-pinned) session → succeeds.

## Out of scope

- No tool-contract change to `EnterWorktree`/`ExitWorktree`.
- `dispatch/sequential-execution.md`'s #447 handling is untouched.
- No exhaustive audit of every possible worktree-creation call site beyond the three
  identified here — a broader sweep turning up more during implementation is a normal
  implementation-time finding, not a design gap.
