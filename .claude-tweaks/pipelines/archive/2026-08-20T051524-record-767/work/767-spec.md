---
record: 767
origin: human
risk: low
size: low
ceremony: standard
grants: [build, merge]
---
# 767: EnterWorktree retry branch-naming can collide with a stale branch from a prior closed-unmerged attempt

Origin: wrap-up Phase 2 curation -- learning from record #418 wrap-up (run 2026-08-17T062107-record-418), a near-miss noticed by reading EnterWorktree's own branch-collision behavior during this run, not by running a probe

Defer-reason: tangential

## Current State

EnterWorktree names a retry worktree/branch deterministically as worktree-flow-record-{n}, with no attempt/generation suffix. Record #418 hit its second consecutive HARD-GATE build stop (this run, and the prior run whose PR #665 closed unmerged with the identical finding). Both attempts used the identical branch name worktree-flow-record-418. This run's EnterWorktree collided with the stale local branch left behind by PR #665's closed-unmerged attempt. It was harmless here only because this project's integration-model is local-merge and the plain (non-force) git push against the stale branch state was safely rejected by git rather than silently overwritten.

## Deliverables

- Survey EnterWorktree / build/worktree-setup.md's branch-naming convention for retries on the same record number after a prior attempt closed unmerged
- Decide whether to suffix retry branches with an attempt/generation marker (e.g. worktree-flow-record-418-2), or explicitly detect + clean up a stale same-name local branch before EnterWorktree reuses the name
- Confirm the same collision is actually safe under integration-model: pr-first too (this run only verified local-merge's non-force-push rejection as the safety net) -- pr-first's draft-PR-per-run + push-on-every-phase-exit discipline may or may not reject the same collision the same way
- Add the finding to skills/_shared or skills/build's worktree-setup procedure once the decision is made

## Acceptance Criteria

A second consecutive retry attempt on the same record number no longer depends on a non-force push being rejected as its only protection against silently colliding with a stale branch from a prior closed-unmerged attempt -- either the branch name no longer collides, or the collision is detected and handled explicitly before EnterWorktree reuses it.

_Filed by `wrap-up Phase 2 curation` via specShapedBody._
