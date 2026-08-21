---
record: 814
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 814: sanitizeWorktreeName() flattens '/' based on a false premise about EnterWorktree's accepted charset

Surface: backend

## Current State

`bin/lib/worktree/name.js`'s `sanitizeWorktreeName()` flattens every `/` to `-`, and `skills/flow/multi-spec.md` + `skills/build/worktree-setup.md` both claim `/` is outside `EnterWorktree`'s accepted charset. It isn't — the tool's own schema documents `/` as the valid segment delimiter. This silently changes multi-spec branch naming away from the convention already used in git history (e.g. `flow/spec-741-742-743`).

## Deliverables

- Correct `sanitizeWorktreeName()` (or its callers' premise) to preserve `/` as a segment delimiter.
- Fix the false claim in both cited skill docs (`skills/flow/multi-spec.md`, `skills/build/worktree-setup.md`).

## Acceptance Criteria

- [ ] A multi-spec branch slug like `flow/spec-1-2-3` passed through `sanitizeWorktreeName()` round-trips unchanged.
- [ ] Both doc citations (`skills/flow/multi-spec.md`, `skills/build/worktree-setup.md`) are corrected to state `/` is a valid segment delimiter.
- [ ] Existing worktree-name tests still pass, plus a new test pinning the `/`-preserving behavior.

## Technical Approach

Update `sanitizeWorktreeName()` in `bin/lib/worktree/name.js` to preserve `/` rather than flattening it to `-`, consistent with `EnterWorktree`'s own accepted-charset schema. Correct the false "`/` is outside the accepted charset" claim in both `skills/flow/multi-spec.md` and `skills/build/worktree-setup.md`. Add a test pinning that a slug like `flow/spec-1-2-3` round-trips unchanged.

### Key Files

- `plugin/bin/lib/worktree/name.js` — `sanitizeWorktreeName()`
- `plugin/skills/flow/multi-spec.md` — false charset claim
- `plugin/skills/build/worktree-setup.md` — same false claim
- worktree-name tests under `tests/` — extend with the `/`-preserving pin

## Gotchas

- Found during a whole-branch `/code-review` pass ahead of a release, not a live incident — verify against `EnterWorktree`'s current schema directly before changing behavior, since tool schemas can drift between plugin versions.
- Any other caller relying on the current flatten-to-`-` behavior (beyond the two cited skill docs) should be checked before changing `sanitizeWorktreeName()`'s output shape.

## Original request

sanitizeWorktreeName() flattens '/' based on a false premise about EnterWorktree's accepted charset

**Related:** none

## Current State
`bin/lib/worktree/name.js`'s `sanitizeWorktreeName()` flattens every `/` to `-`, and `skills/flow/multi-spec.md` + `skills/build/worktree-setup.md` both claim `/` is outside `EnterWorktree`'s accepted charset. It isn't — the tool's own schema documents `/` as the valid segment delimiter. This silently changes multi-spec branch naming away from the convention already used in git history (e.g. `flow/spec-741-742-743`).

## Deliverables
Correct `sanitizeWorktreeName()` (or its callers' premise) to preserve `/` as a segment delimiter; fix the false claim in both cited skill docs.

## Acceptance Criteria
A multi-spec branch slug like `flow/spec-1-2-3` passed through the sanitizer round-trips unchanged; both doc citations corrected; existing worktree-name tests still pass plus a new one pinning the `/`-preserving behavior.

Defer-reason: found-during-review — surfaced by a whole-branch `/code-review` pass ahead of a release; not the review's own scope to fix.
