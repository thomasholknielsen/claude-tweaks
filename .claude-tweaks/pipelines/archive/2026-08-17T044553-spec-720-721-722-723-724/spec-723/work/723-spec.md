---
record: 723
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 723: Ship bin/claim-targets.js and bin/preflight-records.js — claim-side sibling of #686 release-claim wrapper

Surface: backend

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)
Defer-reason: genuinely-larger

## Current State

- `flow/claim-targets.md` prescribes the claim loop (read → classify → create-or-conditional PUT → `bot:in-progress` label → claim comment, per target, all-or-abort release on contest) as per-target Bash snippets. `bin/lib/issues/claims.js` is emit-only, so every multi-target run hand-assembles the loop — observed: a 30-line bespoke `claim.js`, plus a bespoke `preflight.js` running `parseRecordFacets` / `parseDependencies` / Key-Files extraction / `groupByFileOverlap` over 8 fetched records.
- Release is covered (`bin/lib/reconcile/release-merged.js`; #686's `bin/release-claim.js`); claim is not.

## Deliverables

- [ ] `bin/claim-targets.js --run-id <id> --targets 688,689,… [--keep-going]` — read/classify/write/label/comment per target; on contest or transient failure, all-or-abort release of the targets claimed so far (reason `never-started: file-overlap group partial claim`) unless `--keep-going`; exit codes distinguish claimed / contested (holder JSON on stdout) / transient. `gh` path only — the MCP path stays prose per `_shared/github-write-transport.md`. Reuse `claims.js` and share the write path with `release-merged.js` / #686 rather than a third implementation.
- [ ] `bin/preflight-records.js 688 689 …` → JSON `{facets, blockedBy (native or body-text per work-links), keyFiles, overlapGroups}` for `multi-spec.md`'s pre-flight and `claim-targets.md`'s file-overlap warning.
- [ ] `gh-api-module-pattern` (injectable runner, `bin/lib/{name}/`), `tests/bin-lib/` suites, `docs/plugin-structure.md` CLI table entries; cite both from `claim-targets.md`, `multi-spec.md` and `dispatch/SKILL.md` Step 4, replacing the inline loops.

## Acceptance Criteria

1. `claim-targets.md`'s claim step invokes one command; no per-target `gh api` snippet remains.
2. Tests cover absent / tombstone / stale / live / transient plus the partial-claim release; `npm test` green.

## Technical Approach

### Key Files
- `bin/claim-targets.js`, `bin/preflight-records.js` (new)
- `bin/lib/issues/claims.js`, `bin/lib/issues/record.js`, `bin/lib/issues/grouping.js`
- `skills/flow/claim-targets.md`, `skills/flow/multi-spec.md`, `skills/dispatch/SKILL.md`

## Gotchas

- `gh`-absent environments (cloud Routine sandboxes) must keep the MCP prose path in `claim-targets.md` — the CLI is the `gh` transport only, per `_shared/github-write-transport.md`.
- Exit codes must distinguish *contested* from *transient*: both trigger the all-or-abort release, but the rendered message differs (holder identity vs. error summary).
- Share the contents-API write path with `bin/lib/reconcile/release-merged.js` / #686's `release-claim.js` — a third implementation is what #686 explicitly forbids.
- `preflight-records.js` must branch on `work-links` (`native` → one batched GraphQL call via `buildNativeDependencyQuery`; `body-text` → `parseDependencies`) exactly as `materialize.md` describes.

**Related:** #686, #463

## Original request

Ship bin/claim-targets.js and bin/preflight-records.js — claim-side sibling of #686 release-claim wrapper

Defer-reason: genuinely-larger

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)

## Current State

- `flow/claim-targets.md` prescribes the claim loop (read → classify → create-or-conditional PUT → `bot:in-progress` label → claim comment, per target, all-or-abort release on contest) as per-target Bash snippets. `bin/lib/issues/claims.js` is emit-only, so every multi-target run hand-assembles the loop — observed: a 30-line bespoke `claim.js`, plus a bespoke `preflight.js` running `parseRecordFacets` / `parseDependencies` / Key-Files extraction / `groupByFileOverlap` over 8 fetched records.
- Release is covered (`bin/lib/reconcile/release-merged.js`; #686's `bin/release-claim.js`); claim is not.

## Deliverables

- [ ] `bin/claim-targets.js --run-id <id> --targets 688,689,… [--keep-going]` — read/classify/write/label/comment per target; on contest or transient failure, all-or-abort release of the targets claimed so far (reason `never-started: file-overlap group partial claim`) unless `--keep-going`; exit codes distinguish claimed / contested (holder JSON on stdout) / transient. `gh` path only — the MCP path stays prose per `_shared/github-write-transport.md`. Reuse `claims.js` and share the write path with `release-merged.js` / #686 rather than a third implementation.
- [ ] `bin/preflight-records.js 688 689 …` → JSON `{facets, blockedBy (native or body-text per work-links), keyFiles, overlapGroups}` for `multi-spec.md`'s pre-flight and `claim-targets.md`'s file-overlap warning.
- [ ] `gh-api-module-pattern` (injectable runner, `bin/lib/{name}/`), `tests/bin-lib/` suites, `docs/plugin-structure.md` CLI table entries; cite both from `claim-targets.md`, `multi-spec.md` and `dispatch/SKILL.md` Step 4, replacing the inline loops.

## Acceptance Criteria

1. `claim-targets.md`'s claim step invokes one command; no per-target `gh api` snippet remains.
2. Tests cover absent / tombstone / stale / live / transient plus the partial-claim release; `npm test` green.

## Technical Approach

### Key Files
- `bin/claim-targets.js`, `bin/preflight-records.js` (new)
- `bin/lib/issues/claims.js`, `bin/lib/issues/record.js`, `bin/lib/issues/grouping.js`
- `skills/flow/claim-targets.md`, `skills/flow/multi-spec.md`, `skills/dispatch/SKILL.md`

**Related:** #686, #463
