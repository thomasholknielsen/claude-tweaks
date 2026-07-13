---
tier: 1
status: not-started
progress: 0
blocked-by: [13]
surface: backend
---

# 14: Record-store core modules (bin/lib)

## Overview

The Node-side foundation: one record-payload module replacing the split `ingest.js`/`backlog.js` shapes, `tier.js` reduced to a pure risk×effort→recommendation function, the generalized `work-fingerprint` marker with legacy-marker compat, a GitHub Issue-Types capability probe, and the `local-files` driver helpers (frontmatter read/write, id allocation, facet query). Everything here is pure Node with tests — no skill prose.

Both storage drivers implement one conceptual contract: create (idempotent), read, query by facet, update body, set/remove labels, link parent/child + dependencies, close with reason. The github driver is thin helpers around `gh` payloads (skills still execute `gh` themselves, as today); the local driver is real file I/O.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- No skill file changes (specs 15–22).
- No deletion of `ingest.js`/`backlog.js` exports still referenced by not-yet-migrated skills — they stay working until spec 23 confirms zero remaining callers; this spec adds the new module and may re-implement old exports as wrappers over it.
- No claim-protocol code changes (`claims.js`, `retry.js` semantics unchanged; only label-name constants they emit/read move to `bot:*`).
- No network calls in tests.

## Current State

- `bin/lib/issues/ingest.js` — issue-ingestion helpers; `FP_RE` matches `<!-- code-health-fingerprint: ([^\s>]+) -->`.
- `bin/lib/issues/backlog.js` — `inboxIssuePayload`, `parkedIssuePayload`, `classifyBacklogIssue` (milestoneDueOn, watchedPaths).
- `bin/lib/issues/tier.js` — `extractRiskEffort(labels)`, `recommendTier({riskTier, effortTier})` returning needs-review/approved/fast-track.
- `bin/lib/issues/claims.js`, `retry.js` — claim comment fold (`claimStatus`), attempt counting; emit/read `status:in-progress`-era vocabulary only in doc-strings if anywhere (verify).
- `bin/lib/issues/grouping.js` — `extractKeyFiles`, `groupByFileOverlap` (unchanged by this program).
- Tests live in `bin/lib/issues/tests/*.test.js`, run by `npm test`.
- Health-skill payload builders (`bin/lib/{code-health,harness-health,journey-health}/issue-payload.js`) each assemble labels/bodies independently (spec 15 repoints them onto this spec's module).

## Deliverables

- [ ] New `bin/lib/issues/record.js` — the record-payload module: `recordPayload({title, body, type, origin, risk, effort, ready, parked, priority, fingerprint})` → `{title, body, labels[], type}` assembling the Section-13 taxonomy (`by:{origin}`, `risk:{tier}`, `effort:{tier}`, `ready`, `parked`, `priority:{p}`); body gets the `<!-- work-fingerprint: {fp} -->` marker appended when `fingerprint` present. Enums: `type` ∈ `bug|feature|task` (the canonical enum per `_shared/work-record.md`); `origin` ∈ `code-health|harness-health|journey-health|capture` **or omitted** — omitted means no `by:*` label is emitted (human-filed and side-effect records), never a throw; risk/effort/priority per taxonomy. Validates supplied enum values; throws on unknowns, not on absences.
- [ ] `record.js` exports `FP_RE_WORK` matching `<!-- work-fingerprint: ([^\s>]+) -->` and `extractFingerprint(body)` that accepts **both** the new marker and legacy `<!-- code-health-fingerprint: … -->` (legacy read support per the migration-window rule).
- [ ] `record.js` exports `parseRecordFacets(labels[])` → `{origin, risk, effort, stage: 'backlog'|'parked'|'ready', grants: {build, merge}, bot: {inProgress, blocked}, priority}` — the single label-reading function every consumer uses (replaces ad-hoc greps).
- [ ] Rewrite `bin/lib/issues/tier.js`: `recommendGrants({risk, effort})` → `{build: true, merge: risk==='low' && effort==='low'}` (recommendation only — humans decide); keep `extractRiskEffort` reading **colon forms** (`risk:low`) with legacy hyphen forms (`risk-low`) accepted during migration; delete `recommendTier` or alias it as a deprecated wrapper.
- [ ] New `bin/lib/issues/capabilities-probe.js` — `probeCapabilities()` shells `gh api` to detect the repo's native-feature availability: `{types: boolean, subIssues: boolean, dependencies: boolean}` (Issue Types are org-level; sub-issue and dependency APIs vary by host/GHE version). `/init` (spec 22) persists the results as `work-types: native|labels` and `work-links: native|body-text` so no skill re-probes mid-flow. Injectable runner for tests (no live network).
- [ ] New `bin/lib/issues/local-store.js` — the `local-files` driver over `specs/{n}-{slug}.md` (the default records directory is `specs/`, deliberately today's path; all functions take `dir` with that default): `readRecord(path)`/`writeRecord(path, record)` mapping frontmatter (`type`, `parent`, `blocked-by`, `stage`, `grants`, `origin`, `risk`, `effort`, `priority`, `unsynced`) ↔ a facet object that is a **superset** of `parseRecordFacets`'s return (same keys plus `type`, `parent`, `blockedBy` — the github driver's callers get those three from the issue JSON itself, not from labels); `allocateId(dir)` (max existing numeric prefix + 1); `queryRecords(dir, facetFilter)`.
- [ ] `record.js` exports `parseDependencies(body)` — reads `Blocked by #N` body lines (the `work-links: body-text` fallback form); consumers that need dependency edges (help's conflict stage, specify's ordering) call this when links aren't native, so the fallback has a single named reader.
- [ ] `bot:*` vocabulary: audit `claims.js`/`retry.js` and any constant or doc-string emitting `status:in-progress`/`status:blocked`; move to `bot:in-progress`/`bot:blocked` (accepting the old strings on read during migration).
- [ ] Tests for every new export (payload assembly incl. label-set correctness and the omitted-origin case, dual-marker extraction, facet parsing incl. grants/bot states, grant recommendation matrix, capabilities-probe with faked runner, `parseDependencies`, local-store round-trip + id allocation + facet query). Fake runners must be lazily-invoked functions, not eager IIFEs.

## Acceptance Criteria

1. `node --test bin/lib/issues/tests/*.test.js` passes; new tests cover: `recordPayload` label assembly for a born-ready health record (`by:code-health`, `risk:low`, `effort:low`, `ready`), a plain capture record (`by:capture` only), and an origin-omitted record (no `by:*` label, no throw).
2. `extractFingerprint` returns the fingerprint from a body containing only the legacy `code-health-fingerprint` marker AND from one containing only `work-fingerprint`; when both present, the new marker wins.
3. `recommendGrants({risk:'low', effort:'low'})` → `{build:true, merge:true}`; any other combination → `{build:true, merge:false}`; missing/unknown tiers → `{build:false, merge:false}` (unscored records are never recommended for grants).
4. `parseRecordFacets` on labels `['by:capture','parked']` → stage `'parked'`; on `['ready','auto:build','bot:in-progress']` → stage `'ready'`, grants.build true, bot.inProgress true; on `[]` → stage `'backlog'`.
5. `local-store.js` round-trips a record (write → read → deep-equal facets incl. `type`/`parent`/`blockedBy`) and `allocateId` returns 14 for a dir containing `13-foo.md` (and 1 for an empty dir); `parseDependencies('…\nBlocked by #12\nBlocked by #7\n…')` → `[12, 7]`.
6. `grep -rn "status:in-progress\|status:blocked" bin/lib/` returns matches only in explicit legacy-read/compat code paths or their tests (each such line carries a `legacy` comment), not in any emit path.
7. Existing `ingest.js`/`backlog.js` exports still pass their current tests unchanged (compat window intact).

## Technical Approach

Follow the flat-module convention (`bin/lib/issues/` siblings, no `_shared/` nesting). `record.js` owns all label-string literals — other modules import them (single source for taxonomy strings; spec 13's `work-record.md` is the prose twin). `local-store.js` parses frontmatter with the same no-dependency regex style `bin/lib/policy.js` uses (no YAML lib). Enum validation throws early — a spoofed label value from parsed JSON must never flow into an emit path (see the spread-order rule in CLAUDE.md).

## Gotchas

- **Shared-module genericity:** `record.js` will be called by all three health skills, capture, specify, and dispatch — do not hardcode any single caller's assumption (the `recordAudit` narrowing incident). Every enum accepts the full taxonomy.
- **Eager-IIFE test doubles are forbidden** — `returns`/`throws` must be lazy per-invocation functions (CLAUDE.md rule).
- **Optional state slices need explicit flags, not truthiness** (the `includeRemembered` lesson) — `parseRecordFacets` returns explicit booleans, never relies on truthy defaults.
- Don't spread parsed external JSON after derived fields.

## Key Files

- `bin/lib/issues/record.js` (new), `bin/lib/issues/capabilities-probe.js` (new), `bin/lib/issues/local-store.js` (new)
- `bin/lib/issues/tier.js`, `bin/lib/issues/claims.js`, `bin/lib/issues/retry.js`
- `bin/lib/issues/tests/` (new + updated tests)
