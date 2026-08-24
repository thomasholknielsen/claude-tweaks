---
record: 787
origin: human
risk: medium
size: high
ceremony: standard
grants: [build]
surface: backend
---
# 787: Consolidate the two claims-registry transports (claim-store/claim-targets vs claim-engine/claims) into one core

Surface: backend

Origin: consolidated Review Console of flow run 2026-08-17T044553-spec-720-721-722-723-724 — discovered at the pre-finish merge, when origin/main arrived carrying a parallel claims transport
Defer-reason: genuinely-larger

## Current State

- Two concurrent runs shipped two claims-registry transports the same day: this run's `bin/lib/issues/claim-store.js` + `bin/lib/claim-targets/` + `bin/claim-targets.js` (#723 — exit codes 0/2/3/4 distinguishing contested vs transient, 404/409/422 status classification, `releaseFailed` envelope, `release-merged.js` delegated onto the store), and a sibling's `bin/lib/issues/claim-engine.js` + `bin/claims.js` (claim|release subcommands, group-claim-all-or-abort, exit 0-even-contested envelope-driven contract) plus `bin/materialize.js`/`materialize-format.js`.
- `skills/flow/claim-targets.md` Step 2.8 cites `bin/claim-targets.js` (its exit-code contract drives the #722 contest/liveness cards and is conformance-pinned); `bin/claims.js` has no prose consumer for the claim side after the merge but owns the only CLI **release** path (`releaseOne`). `_shared/issue-claims.md` remains the canonical protocol both implement.
- This is exactly the "third implementation" state #723's spec forbade — currently two implementations of the contents-API read/classify/write exist (`claim-store.js` and `claim-engine.js`), reconciled only at the docs level (both listed in `docs/plugin-structure.md`).

## Deliverables

- [ ] Pick one transport core and fold the other onto it (candidate shape: keep `claim-store.js` as the single contents-API seam — release-merged.js already delegates to it — and re-base `claim-engine.js`'s claimOne/releaseOne/claimGroup onto that store, or the inverse; judged on test coverage and consumer count at execution time).
- [ ] One CLI surface for claim AND release (subcommands or two thin wrappers over the one core), preserving `bin/claim-targets.js`'s exit-code contract (0/2/3/4) that `skills/flow/claim-targets.md`'s contest cards branch on, and `bin/claims.js release`'s release path.
- [ ] Migrate every prose citation to the surviving surface; retire the other CLI with a deprecation note per the expand-contract discipline (CLAUDE.md's contract-change rule).
- [ ] Conformance test: exactly one module under `bin/` performs the contents-API PUT to `claims/` (the check #723's final review ran by hand).

## Acceptance Criteria

1. `grep -rln "contents/claims" bin/ | wc -l` shows a single write-path module (plus its CLI wrappers).
2. `skills/flow/claim-targets.md`'s Step 2.8 exit-code branching still holds verbatim (pins in tests/flow-claim-preflight.test.js stay green).
3. `npm test` green, including both transports' existing suites migrated to the surviving core.

## Technical Approach

### Key Files
- `bin/lib/issues/claim-store.js`, `bin/lib/issues/claim-engine.js`, `bin/lib/claim-targets/`, `bin/claim-targets.js`, `bin/claims.js`
- `bin/lib/reconcile/release-merged.js`
- `skills/flow/claim-targets.md`, `skills/_shared/issue-claims.md`, `docs/plugin-structure.md`

## Gotchas

- The two exit-code philosophies genuinely differ (outcome-in-exit-code vs outcome-in-envelope); the consolidation must pick one per surface and keep flow's card-branching contract intact.
- `release-merged.js`'s observable behavior is pinned by reconcile suites — its delegation must survive whichever direction the fold goes.

**Related:** #720, #723, #686, #780, #795, #796

---

## Amendment (2026-08-17): the surviving core is git-CAS-first

Per the rate-limit contention design (digest and rationale on parent record #795; the design doc was consumed by /specify — the contract taxonomy this build classifies against ships via sub-issue #796): the contents-API claim writes are the fleet's most contended endpoint —
secondary rate limits hit them in 2 of 5 logged incidents (spec-702's release, record-697's
read) — and the #405 spike measured git-protocol operations as consuming zero API budget.
Consolidating the two transports onto a contents-API core and later rebuilding onto git
protocol would be double work, so the consolidation target changes:

- The surviving core performs the claim/release test-and-set via **git compare-and-swap**:
  commit the blob on the fetched `claims-registry` tip, push with
  `--force-with-lease=refs/heads/claims-registry:<expected-tip>`; a rejected push is
  "contested" — re-fetch, re-classify via the existing `classifyClaimBlob`, retry or abort
  exactly as today. Same blob format, same branch, same one-file arbiter per
  `_shared/issue-claims.md`'s one-keyspace rule.
- The contents-API path is retained as the **gh-absent/MCP fallback seam** (an MCP-only
  sandbox may hold no git push credential), not deleted. Both transports keep writing the
  same file.
- New deliverable: the surviving core classifies **secondary-rate-limit responses** (403 +
  "secondary rate limit" message / `Retry-After`, per the design doc's taxonomy) as a
  distinct outcome from "contested" — a throttle must not masquerade as another agent
  holding the claim, which is how record-697's incident read before diagnosis.
- AC 1 repair: `grep -rln "contents/claims" bin/` misses `claim-engine.js` today because it
  builds the path as `` contents/${path} `` — the conformance check must match the call
  shape (contents-API PUT reaching `claims/`), not one literal string.
- Unchanged: AC 2 (exit-code contract 0/2/3/4 verbatim), AC 3 (both suites migrated,
  `npm test` green), the one-CLI-surface deliverable, and the prose-citation migration —
  which now also covers `bin/release-claim.js`'s release path (#686, shipped after this
  record was filed).

## Original request

Consolidate the two claims-registry transports (claim-store/claim-targets vs claim-engine/claims) into one core

Surface: backend

Origin: consolidated Review Console of flow run 2026-08-17T044553-spec-720-721-722-723-724 — discovered at the pre-finish merge, when origin/main arrived carrying a parallel claims transport
Defer-reason: genuinely-larger

## Current State

- Two concurrent runs shipped two claims-registry transports the same day: this run's `bin/lib/issues/claim-store.js` + `bin/lib/claim-targets/` + `bin/claim-targets.js` (#723 — exit codes 0/2/3/4 distinguishing contested vs transient, 404/409/422 status classification, `releaseFailed` envelope, `release-merged.js` delegated onto the store), and a sibling's `bin/lib/issues/claim-engine.js` + `bin/claims.js` (claim|release subcommands, group-claim-all-or-abort, exit 0-even-contested envelope-driven contract) plus `bin/materialize.js`/`materialize-format.js`.
- `skills/flow/claim-targets.md` Step 2.8 cites `bin/claim-targets.js` (its exit-code contract drives the #722 contest/liveness cards and is conformance-pinned); `bin/claims.js` has no prose consumer for the claim side after the merge but owns the only CLI **release** path (`releaseOne`). `_shared/issue-claims.md` remains the canonical protocol both implement.
- This is exactly the "third implementation" state #723's spec forbade — currently two implementations of the contents-API read/classify/write exist (`claim-store.js` and `claim-engine.js`), reconciled only at the docs level (both listed in `docs/plugin-structure.md`).

## Deliverables

- [ ] Pick one transport core and fold the other onto it (candidate shape: keep `claim-store.js` as the single contents-API seam — release-merged.js already delegates to it — and re-base `claim-engine.js`'s claimOne/releaseOne/claimGroup onto that store, or the inverse; judged on test coverage and consumer count at execution time).
- [ ] One CLI surface for claim AND release (subcommands or two thin wrappers over the one core), preserving `bin/claim-targets.js`'s exit-code contract (0/2/3/4) that `skills/flow/claim-targets.md`'s contest cards branch on, and `bin/claims.js release`'s release path.
- [ ] Migrate every prose citation to the surviving surface; retire the other CLI with a deprecation note per the expand-contract discipline (CLAUDE.md's contract-change rule).
- [ ] Conformance test: exactly one module under `bin/` performs the contents-API PUT to `claims/` (the check #723's final review ran by hand).

## Acceptance Criteria

1. `grep -rln "contents/claims" bin/ | wc -l` shows a single write-path module (plus its CLI wrappers).
2. `skills/flow/claim-targets.md`'s Step 2.8 exit-code branching still holds verbatim (pins in tests/flow-claim-preflight.test.js stay green).
3. `npm test` green, including both transports' existing suites migrated to the surviving core.

## Technical Approach

### Key Files
- `bin/lib/issues/claim-store.js`, `bin/lib/issues/claim-engine.js`, `bin/lib/claim-targets/`, `bin/claim-targets.js`, `bin/claims.js`
- `bin/lib/reconcile/release-merged.js`
- `skills/flow/claim-targets.md`, `skills/_shared/issue-claims.md`, `docs/plugin-structure.md`

## Gotchas

- The two exit-code philosophies genuinely differ (outcome-in-exit-code vs outcome-in-envelope); the consolidation must pick one per surface and keep flow's card-branching contract intact.
- `release-merged.js`'s observable behavior is pinned by reconcile suites — its delegation must survive whichever direction the fold goes.

**Related:** #720, #723, #686, #780, #795, #796

---

## Amendment (2026-08-17): the surviving core is git-CAS-first

Per the rate-limit contention design (digest and rationale on parent record #795; the design doc was consumed by /specify — the contract taxonomy this build classifies against ships via sub-issue #796): the contents-API claim writes are the fleet's most contended endpoint —
secondary rate limits hit them in 2 of 5 logged incidents (spec-702's release, record-697's
read) — and the #405 spike measured git-protocol operations as consuming zero API budget.
Consolidating the two transports onto a contents-API core and later rebuilding onto git
protocol would be double work, so the consolidation target changes:

- The surviving core performs the claim/release test-and-set via **git compare-and-swap**:
  commit the blob on the fetched `claims-registry` tip, push with
  `--force-with-lease=refs/heads/claims-registry:<expected-tip>`; a rejected push is
  "contested" — re-fetch, re-classify via the existing `classifyClaimBlob`, retry or abort
  exactly as today. Same blob format, same branch, same one-file arbiter per
  `_shared/issue-claims.md`'s one-keyspace rule.
- The contents-API path is retained as the **gh-absent/MCP fallback seam** (an MCP-only
  sandbox may hold no git push credential), not deleted. Both transports keep writing the
  same file.
- New deliverable: the surviving core classifies **secondary-rate-limit responses** (403 +
  "secondary rate limit" message / `Retry-After`, per the design doc's taxonomy) as a
  distinct outcome from "contested" — a throttle must not masquerade as another agent
  holding the claim, which is how record-697's incident read before diagnosis.
- AC 1 repair: `grep -rln "contents/claims" bin/` misses `claim-engine.js` today because it
  builds the path as `` contents/${path} `` — the conformance check must match the call
  shape (contents-API PUT reaching `claims/`), not one literal string.
- Unchanged: AC 2 (exit-code contract 0/2/3/4 verbatim), AC 3 (both suites migrated,
  `npm test` green), the one-CLI-surface deliverable, and the prose-citation migration —
  which now also covers `bin/release-claim.js`'s release path (#686, shipped after this
  record was filed).

