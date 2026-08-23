---
record: 951
origin: human
risk: low
size: low
ceremony: standard
grants: [build, merge]
surface: backend
---
# 951: residue.js branches probe tags every merged remote branch blast-radius, leaking cross-session findings into --scope blast-radius

Surface: backend

## Current State

`probeBranches` (`plugin/bin/lib/residue/probes/branches.js`) excludes only the integration branch's own remote-tracking ref and `scope.headBranch`'s own branch (lines 40-43), then unconditionally tags every other merged remote branch it finds `scope: 'blast-radius'` (line 46). This is inconsistent with the sibling probes:

- `probes/forge.js` line 25-28: a PR is `scope: 'blast-radius'` only when `pr.headRefName === scope.headBranch` ("mine"); every other PR is `scope: 'observed'`.
- `probes/worktrees.js` line 66/75: this run's own headBranch worktree is excluded outright (`continue`); every other worktree found is `scope: 'observed'`.

`probes/branches.js` has no `'observed'` branch at all — it treats "any merged, undeleted remote branch in the repo" as this run's own blast radius, the opposite of the forge/worktrees pattern.

This matters because `residue-sweep.md` (`/claude-tweaks:wrap-up` Phase 3's preamble) deliberately calls `--scope blast-radius` specifically to exclude "another session's live worktree, another lane's open PR" as noise `scope-filter.js` exists to filter out — and because a `remedy: auto` blast-radius finding is a Phase-1 fix-now candidate wrap-up may delete without a per-item human prompt. A false-positive `blast-radius` branch finding for another live session's worktree branch risks that session's branch being deleted out from under it — the same class of cross-session interference `docs/incident-log.md` and this session's own decisions.md (record #172's run, `AUTO 2026-08-19T21:12:00Z — INCIDENT`) already flag as a real, live hazard in this repo's concurrent-session usage pattern.

Note: `probes/pipeline-runs.js`'s equivalent unconditional `scope: 'blast-radius'` (any orphaned clean run-dir, any origin) is a *deliberate*, commented design choice ("cheap, mechanical housekeeping any wrap-up cycle should surface and fix regardless of which run originally produced the orphan") — this issue is about `branches.js` only, which carries no such comment and whose closest siblings (`forge.js`, `worktrees.js`) both implement the mine-vs-observed distinction it's missing.

## Deliverables

1. Give `probeBranches` the same `scope.headBranch`-based mine/observed distinction `forge.js`/`worktrees.js` already use: a merged remote branch is `scope: 'blast-radius'` only when it is attributable to this run's own worktree/branch (or, if branches genuinely have no reliable "mine" signal the way a PR's `headRefName` or a worktree's `branch` do, document why this probe is intentionally the odd one out — mirroring `pipeline-runs.js`'s existing comment pattern — rather than leaving the divergence unexplained).
2. Add or update a unit test in `tests/bin-lib/residue/` pinning that a merged remote branch unrelated to `scope.headBranch` renders `scope: 'observed'`, not `'blast-radius'`, under `--scope blast-radius`.

## Acceptance Criteria

- [ ] `node bin/residue.js --scope blast-radius` run from a worktree with other worktree-dispatch-record-* branches merged-but-undeleted on the remote no longer lists those unrelated branches as findings (or, if the design decision in Deliverable 1 is "leave as-is", the divergence from `forge.js`/`worktrees.js` is explained in a code comment and this issue closes as wontfix with that rationale recorded).
- [ ] New/updated test in `tests/bin-lib/residue/` demonstrates the mine-vs-observed distinction for the branches probe.
- [ ] `node --test tests/` passes.

## Technical Approach

Mirror `probes/forge.js` (lines 25-28) and `probes/worktrees.js` (lines 66/75)'s mine-vs-observed pattern in `probes/branches.js`: tag a merged remote branch `scope: 'blast-radius'` only when it is attributable to `scope.headBranch`'s own run; every other merged branch becomes `scope: 'observed'`. If branches genuinely have no reliable "mine" signal, add a comment documenting the exception (mirroring `probes/pipeline-runs.js`'s existing one) instead of leaving the divergence unexplained.

### Key Files

- `plugin/bin/lib/residue/probes/branches.js` — add the mine/observed distinction (or document why this probe is intentionally exempt)
- `tests/bin-lib/residue/` — new or updated test pinning the mine-vs-observed distinction for merged remote branches

## Gotchas

- A `remedy: auto` blast-radius finding is a Phase-1 fix-now candidate wrap-up may delete without a per-item human prompt — a false-positive tag here risks deleting another live session's branch out from under it, the same hazard class `docs/incident-log.md` already flags.
- `probes/pipeline-runs.js`'s unconditional blast-radius tagging is a deliberate, commented exception for a different reason (orphaned run-dirs are safe regardless of origin) — don't let this fix accidentally alter that probe too.

## Original request

residue.js branches probe tags every merged remote branch blast-radius, leaking cross-session findings into --scope blast-radius

Origin: discovered during `/claude-tweaks:wrap-up #172`'s residue-sweep preamble (`node bin/residue.js --base cf181cf3 --integration-branch origin/main --scope blast-radius --no-suite`), which returned `origin/worktree-dispatch-record-117` and `origin/worktree-dispatch-record-927` as findings — both unrelated to record #172's own worktree/branch.

Defer-reason: genuinely-larger

## Current State

`probeBranches` (`plugin/bin/lib/residue/probes/branches.js`) excludes only the integration branch's own remote-tracking ref and `scope.headBranch`'s own branch (lines 40-43), then unconditionally tags every other merged remote branch it finds `scope: 'blast-radius'` (line 46). This is inconsistent with the sibling probes:

- `probes/forge.js` line 25-28: a PR is `scope: 'blast-radius'` only when `pr.headRefName === scope.headBranch` ("mine"); every other PR is `scope: 'observed'`.
- `probes/worktrees.js` line 66/75: this run's own headBranch worktree is excluded outright (`continue`); every other worktree found is `scope: 'observed'`.

`probes/branches.js` has no `'observed'` branch at all — it treats "any merged, undeleted remote branch in the repo" as this run's own blast radius, the opposite of the forge/worktrees pattern.

This matters because `residue-sweep.md` (`/claude-tweaks:wrap-up` Phase 3's preamble) deliberately calls `--scope blast-radius` specifically to exclude "another session's live worktree, another lane's open PR" as noise `scope-filter.js` exists to filter out — and because a `remedy: auto` blast-radius finding is a Phase-1 fix-now candidate wrap-up may delete without a per-item human prompt. A false-positive `blast-radius` branch finding for another live session's worktree branch risks that session's branch being deleted out from under it — the same class of cross-session interference `docs/incident-log.md` and this session's own decisions.md (record #172's run, `AUTO 2026-08-19T21:12:00Z — INCIDENT`) already flag as a real, live hazard in this repo's concurrent-session usage pattern.

Note: `probes/pipeline-runs.js`'s equivalent unconditional `scope: 'blast-radius'` (any orphaned clean run-dir, any origin) is a *deliberate*, commented design choice ("cheap, mechanical housekeeping any wrap-up cycle should surface and fix regardless of which run originally produced the orphan") — this issue is about `branches.js` only, which carries no such comment and whose closest siblings (`forge.js`, `worktrees.js`) both implement the mine-vs-observed distinction it's missing.

## Deliverables

1. Give `probeBranches` the same `scope.headBranch`-based mine/observed distinction `forge.js`/`worktrees.js` already use: a merged remote branch is `scope: 'blast-radius'` only when it is attributable to this run's own worktree/branch (or, if branches genuinely have no reliable "mine" signal the way a PR's `headRefName` or a worktree's `branch` do, document why this probe is intentionally the odd one out — mirroring `pipeline-runs.js`'s existing comment pattern — rather than leaving the divergence unexplained).
2. Add or update a unit test in `tests/bin-lib/residue/` pinning that a merged remote branch unrelated to `scope.headBranch` renders `scope: 'observed'`, not `'blast-radius'`, under `--scope blast-radius`.

## Acceptance Criteria

- [ ] `node bin/residue.js --scope blast-radius` run from a worktree with other worktree-dispatch-record-* branches merged-but-undeleted on the remote no longer lists those unrelated branches as findings (or, if the design decision in Deliverable 1 is "leave as-is", the divergence from `forge.js`/`worktrees.js` is explained in a code comment and this issue closes as wontfix with that rationale recorded).
- [ ] New/updated test in `tests/bin-lib/residue/` demonstrates the mine-vs-observed distinction for the branches probe.
- [ ] `node --test tests/` passes.

