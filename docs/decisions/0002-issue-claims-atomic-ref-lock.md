# 0002. Issue claiming uses atomic refs/claims/* ref creation as the lock primitive

- **Status:** superseded — the lock moved to a create-only / sha-conditional blob write (`claims/issue-<n>.json` on the `claims-registry` branch) with #241's transport unification; the `refs/claims/*` keyspace was retired and its read-compat window closed with #247
- **Date:** 2026-07-04
- **Context:** Issue-claims Phase 1 (design: GitHub issue agent-coordination; brainstormed 2026-07-04)

## Context

Multiple agents consume the same GitHub issues — a scheduled cloud routine, local sessions on different machines, potentially collaborators' agents on a shared repo. Nothing prevented two concurrent `/flow --from-recon` runs from pulling the same open issues and double-building them. GitHub has no lease primitive ("lock conversation" is a moderation feature), so any claim scheme must be built from primitives with real atomicity. The scheme had to cover all three topologies (same machine, cross-machine, cross-account) and be issue-granular even though multi-spec `/flow` batches many issues into one shared worktree branch.

## Decision

A claim is the existence of the ref `refs/claims/issue-<n>`, created via the GitHub git-refs API. Ref creation fails with 422 if the ref exists — a true atomic test-and-set arbitrated by GitHub itself, covering all topologies with one mechanism. The ref is authoritative; an issue comment with a machine-readable marker mirrors it for humans and carries TTL metadata (default 72h). Contract: `skills/_shared/issue-claims.md`; helper module: `bin/lib/issues/claims.js`.

## Alternatives considered

- **Assignee or label as the claim** — rejected: check-then-set race, and all of one user's agents share identity, so assignee cannot distinguish agent A from agent B. Retained only as a possible human-facing mirror.
- **Ordered comment claims** (lowest comment ID wins) — rejected: correct (comments are server-ordered), but chattier and needs read-after-write; the ref's 201/422 answer is simpler.
- **Work branch as the lock** (`refs/heads/agent/issue-N`) — rejected: atomic, but breaks under multi-spec batching (one branch carries many issues) and clutters the branch list. The dedicated `refs/claims/*` namespace keeps the atomicity without the coupling and stays invisible in the branch UI.
- **Local run-dir locks** — rejected as the primary: race-free via mkdir atomicity but same-machine only; the real topology includes cloud routines.
- **Projects v2 / status-field mirroring** — rejected: every mirror is a consistency liability; issue state stays the source of truth.

## Consequences

- One arbiter (the GitHub API) covers every concurrency topology; no local coordination is load-bearing.
- Claims are issue-granular regardless of how work batches into branches; releasing = deleting the ref (fully reversible).
- Crashed runs leave stale claims — handled by TTL aging plus `/tidy`'s sweep (Step 4.7), never by silent automation.
- The sha a claim ref points at is meaningless (ref existence is the lock) — surprising to readers, documented in the contract.
- Revisit triggers: GitHub shipping a native lease/claim primitive, or Phase 2's ownership-check hardening proving insufficient against claim-deletion races. (Phase 2 has not shipped as of this writing — `skills/_shared/issue-claims.md` has no ownership-check content, and the originating design doc is no longer in the repo, likely swept by ADR 0007's periodic archive prune.)
