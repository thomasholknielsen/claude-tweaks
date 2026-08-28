---
record: 613
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 613: tidy worktree scan: reclaim net-empty branches (add-then-delete design doc) — the canonical /specify residue is invisible to the merged-only rule

Surface: backend

## Current State

A `/specify` run in a worktree commits the design doc then deletes it after decomposition, leaving an unpushed branch with two net-zero commits vs. its merge-base. `tidy`'s step-6-auto scopes auto-delete to merged worktrees/branches only, so this net-empty-but-unmerged shape is never reclaimed by any existing sweep — a Recovery quality lens finding from a session evaluation, which found exactly one such case.

## Deliverables

- [ ] Broaden `tidy`'s worktree scan to also match a branch that is net-empty relative to its merge-base — `git diff --quiet $(git merge-base main HEAD) HEAD` — not just merged branches.
- [ ] Add teardown handling in `/specify`'s Step 9: when the design-doc delete leaves the branch net-empty, print a paste-ready teardown command line in the run summary (its own line, ready to copy-paste).

## Acceptance Criteria

1. `tidy`'s worktree/branch scan flags a branch that is net-empty vs. its merge-base, even when unmerged, as reclaimable — with a test reproducing the add-then-delete-design-doc shape.
2. `/specify` Step 9 detects when its own design-doc deletion leaves the branch net-empty and emits a paste-ready teardown line in the run's summary output.
3. `npm test` passes with new coverage for both changes.

## Technical Approach

The net-empty check is a single `git diff --quiet` comparison against the branch's merge-base — cheap and consistent with the codebase's existing git-discipline conventions. The scan broadening is additive to `tidy`'s existing step-6-auto merged-branch scope, not a replacement for it. `/specify` Step 9's teardown-line addition is a small conditional print, gated on "did this run's own design-doc delete leave the branch net-empty" — computed the same way, right after the delete.

### Key Files

- `plugin/skills/tidy/step-6-auto.md` — broaden the worktree/branch auto-delete scope to merged OR net-empty
- `plugin/skills/specify/decomposition-mode.md` (Step 9) — emit the paste-ready teardown line when applicable

## Gotchas

- The net-empty check must compare against the branch's actual merge-base, not against `main`'s current tip — a branch can be net-empty relative to where it forked even if `main` has since advanced.
- Don't broaden the auto-delete scope in a way that could delete a branch with real uncommitted-but-unpushed work still on disk — pair the net-empty check with tidy's existing safety checks (dirty working tree, uncommitted changes) rather than assuming git-diff-clean implies nothing-to-lose.

## Original request

tidy worktree scan: reclaim net-empty branches (add-then-delete design doc) — the canonical /specify residue is invisible to the merged-only rule

**Related:** none

Context: A /specify run in a worktree commits the design doc then deletes it after decomposition, leaving an unpushed branch with two net-zero commits vs its merge-base. tidy step-6-auto scopes auto-delete to merged worktrees/branches, so this shape is never reclaimed and no sweep names it. Session-evaluation finding, Recovery quality lens (this session left exactly one).

Scope: (1) broaden the worktree scan to merged OR net-empty (git diff --quiet $(git merge-base main HEAD) HEAD); (2) /specify Step 9, when the design-doc delete leaves the branch net-empty, prints a paste-ready teardown line on its own line in the summary.

