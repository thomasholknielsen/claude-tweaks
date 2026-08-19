---
record: 241
origin: capture
risk: high
effort: high
ceremony: standard
grants: [build]
surface: backend
---
# 241: Unify claim stores on the blob path - the gh-ref and MCP stores are mutually invisible

Surface: backend

## Current State

The claim system runs two authoritative lock stores that cannot see each other. The gh path creates `refs/claims/issue-N` (atomic ref create, 201/422) with claim identity (`runId`, `ttlHours`, `host`, `claimedAt`) in a separate, non-atomic issue comment; the MCP path writes claim-file blobs on the `claims-registry` branch via `create_or_update_file` CAS. `_shared/github-write-transport.md` frames these as the same guarantee one level down, but they are different keyspaces with no reconciliation — a gh-present local session and a gh-absent cloud Routine (the documented, expected topology per `_shared/issue-claims.md`) can both claim and both build the same issue. This failure is absent from the file's own nine-row Failure posture table. Secondary defects of the ref+comment split: four of those nine failure rows exist only because identity and lock live in different stores, including the `everReleased: false` fail-closed-forever limbo; `/tidy`'s claims sweep reads `git/matching-refs/claims/` by default, so MCP-created stale claims are invisible to it and their only backstop is a 72h TTL nothing reads. The prose defining all this runs ~7,600 words against 133 lines of emit-only code in `bin/lib/issues/claims.js`.

## Deliverables

- One claim store: the file-blob path on `claims-registry`, used by both transports (`gh` writes blobs via `gh api` contents endpoints with the same `sha`-CAS semantics MCP uses). Identity and lock become one atomic write; the ref keyspace is retired.
- Migration/coexistence: a transition rule for in-flight ref claims (honor both stores for reads during a deprecation window with a recorded end condition per IL-85, write only blobs from day one).
- `/tidy`'s claims sweep reads the blob keyspace as primary; the ref scan survives only through the deprecation window.
- `bot:in-progress` explicitly demoted in prose to fire-and-forget cosmetic (it already carries no locking semantics); its reconciliation machinery reduced accordingly.
- `_shared/issue-claims.md` rewritten around the single store — the Failure posture table shrinks to the rows a single atomic store still needs, and the dual-transport double-claim scenario is documented as closed.

## Acceptance Criteria

- A claim written via `gh` and one via the MCP path land in the same keyspace and conflict correctly: fixture-level test of the CAS collision (second writer gets the 409/422-equivalent and backs off), plus the contested-claim fold reading identity from the blob itself.
- `everReleased`-style limbo is structurally impossible: no failure mode leaves a lock without identity or identity without a lock (they are one write).
- `/tidy`'s sweep finds and ages stale claims regardless of which transport created them.
- The deprecation window's end condition is written down (date or version) and something collects it (IL-85).
- All claim-touching suites green; the prose word count of the claim contract drops substantially (target: under half) as the split-brain rows disappear.

## Technical Approach

Extend `bin/lib/issues/claims.js` to compose blob paths/payloads for both transports; the gh path's atomic create maps to `PUT /repos/{o}/{r}/contents/{path}` without `sha` (fails if exists), release maps to DELETE with `sha`. Group claims stay all-or-nothing over the blob set with the existing rollback rule. Prose rewrite lands after the mechanics are test-proven.

## Gotchas

- Concurrency/locking is the one domain where "looks like its sibling" is most dangerous (IL-50): test that both transports fail in the same direction on every malformed input, not just the happy CAS path.
- The blob store depends on the `claims-registry` branch existing — bootstrap on first claim must itself be race-safe (two first-claimers creating the branch concurrently).
- IL-92: the current fail-open branches' comments do not enumerate all causes reaching them — re-derive the failure table from the new mechanics, don't port rows.
- Claim reads happen in dispatch Preflight, Step 4, wrap-up Section E, flow multispec teardown, and /tidy 4.7 — sweep every reader when the keyspace changes (IL-97: moving where a value is written without moving every reader).
- A live in-flight claim during rollout must not be orphaned: the read-both window is load-bearing, not politeness.
- Same-wave overlap: #237 touches dispatch/wrap-up prose regions — one worktree, sequence after #237's cuts settle.

## Original request

Unify claim stores on the blob path - the gh-ref and MCP stores are mutually invisible

**Related:** #237, #238

Context: Session audit: the gh path locks via refs/claims/issue-N, the MCP path via blobs on claims-registry; neither sees the other, so a local session and a cloud Routine can both claim and build the same issue - the exact failure issue-claims.md exists to prevent, absent from its own failure-posture table. The ref/comment identity split also creates the everReleased:false limbo.

Scope: Standardize both transports on the blob store (gh can write blobs too), making identity+lock one atomic write; /tidy sweeps one keyspace; demote bot:in-progress to fire-and-forget cosmetic.
