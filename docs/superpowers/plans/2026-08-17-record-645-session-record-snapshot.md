# Record #645 — Session-Scoped Record Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-skill `gh issue list --state all` round-trips (`/backlog overview`, `/capture`'s born-ready check, `/specify` Step 1) with one session-scoped record snapshot, so one continuous session pays for the whole-issue-set pull once instead of once per skill invocation.

**Architecture:** A pure filesystem helper (`bin/lib/issues/record-snapshot.js`) owns the snapshot's path, union field set, freshness check, and invalidation — the code twin of a new "Session-scoped record snapshot" section in `_shared/record-queue-fetch.md`. Every named consumer's own fetch (already citing `record-queue-fetch.md`, or fetching bare) reads through a shared "read-fresh-or-fetch" bash block instead of shelling out unconditionally. A new `record-snapshot-ttl-seconds` policy key (default 300) controls freshness. Invalidation is wired once, into `_shared/github-write-transport.md`'s CRUD mapping — every create/edit/close call site already routes through that file — plus an explicit call at `/capture`'s and `/specify`'s own create sites.

**Tech Stack:** Node built-in test runner; markdown skill prose with embedded Node one-liners and bash.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T001737-record-645/work/645-spec.md`

## Global Constraints

- The union field set (`number,title,labels,body,state,stateReason,closedAt,comments,updatedAt,milestone`) is a single named export (`UNION_FIELDS`) — never retyped inline.
- Every existing citer of `record-queue-fetch.md`'s base `github-issues` fetch (`/help`, `/tidy`, `/backlog` Step 1, `/visualize`) keeps its existing open-only, faceted-output contract unchanged — the snapshot layer is internal to that fetch, no consumer-side edits required for those four.
- A `--label`-filtered fetch (grant-mode's `ready` fetch, refine-mode's `ready` fetch) stays a dedicated server-side-filtered call, not routed through the snapshot — GitHub filters that cheaper than a client-side filter over the full union.
- `{EXTRA_FIELDS}` is retired from `record-queue-fetch.md` — the union already carries every field any named consumer has requested historically.
- Skill references in actionable text use the fully-qualified `/claude-tweaks:{skill}` form.

---

### Task 1: `record-snapshot.js` helper + tests

**Files:**
- Create: `bin/lib/issues/record-snapshot.js`
- Create: `tests/bin-lib/issues/record-snapshot.test.js`

**Interfaces:**
- Produces: `UNION_FIELDS`, `snapshotPath(sessionId)`, `gitLogPath(sessionId)`, `isFresh(path, ttlSeconds, now?)`, `readSnapshot(path)`, `writeSnapshot(path, records)`, `invalidateSnapshot(sessionId)`.

- [x] **Step 1: Write the module** — pure fs helpers, no network; absent/blank session id resolves to `null` paths so `isFresh` reads never-fresh (degrades to "always fetch," never throws).
- [x] **Step 2: Tests** — path shape, freshness boundary (just-inside/just-outside TTL), round-trip write/read, invalidation (deletes both files, tolerates absence, no-ops on an absent session id).

**Verify:** `node --test tests/bin-lib/issues/record-snapshot.test.js` — 11/11 passing.

---

### Task 2: Policy key + schema doc

**Files:**
- Modify: `bin/lib/policy-schema.js` (add `record-snapshot-ttl-seconds`)
- Modify: `skills/_shared/policy-schema.md` (Additional levers table row)
- Modify: `tests/policy-schema.test.js` (bump the `POLICY_KEYS.length` pin 50 -> 51)

- [x] **Step 1:** Register the key — `integer`, default `300`, category `housekeeping`, tier `advanced`.
- [x] **Step 2:** Document it in the Additional levers table with a distinct summary (not verbatim-identical to the JS summary — `tests/policy-schema-metadata.test.js` forbids that).
- [x] **Step 3:** Bump the count pin and add the changelog comment line.

**Verify:** `node --test tests/policy-schema.test.js tests/policy-schema-metadata.test.js`.

---

### Task 3: `record-queue-fetch.md` — the Session-scoped record snapshot section

**Files:**
- Modify: `skills/_shared/record-queue-fetch.md`

- [x] **Step 1:** Add the "Session-scoped record snapshot" section (path, field set, freshness, invalidation, the read-fresh-or-fetch bash block).
- [x] **Step 2:** Rewrite the `github-issues` fetch section to read through `{tmp-records-file}` (now the full `--state all` union) and filter to `state === 'OPEN'` on the way to `{tmp-faceted-file}` — preserving every existing citer's contract with zero edits to those files.
- [x] **Step 3:** Retire `{EXTRA_FIELDS}` from the prose (superseded by the always-full union).

**Verify:** existing citers (`/help`, `/tidy`, `/backlog` Step 1, `/visualize`) need no further edits — confirmed by grep (no bare `gh issue list --state` invocations remain in those four files after Task 4).

---

### Task 4: Route the direct (non-citing) consumers through the snapshot

**Files:**
- Modify: `skills/capture/SKILL.md` (born-ready trust fetch + git-log dump + post-create invalidation)
- Modify: `skills/specify/decomposition-mode.md` (Step 1 fetch)
- Modify: `skills/specify/record-creation.md` (resumed-session fallback fetch + post-batch invalidation)
- Modify: `skills/_shared/trust-table.md` (Fetch section + git-log dump)
- Modify: `skills/backlog/grant-mode.md` (open-numbers fetch, derived from the snapshot instead of a second bare call)
- Modify: `skills/backlog/overview-mode.md`, `skills/backlog/refine-mode.md` (retire `{EXTRA_FIELDS}` mentions, since the base fetch they cite now always carries `body`)
- Modify: `skills/help/status-scan.md`, `skills/tidy/step-1-records.md`, `skills/visualize/record-graph.md` (retire `{EXTRA_FIELDS}` mentions)

- [x] **Step 1:** Replace every bare `gh issue list --state (open|all) ... --limit N` invocation in the named consumer set with the shared read-fresh-or-fetch block.
- [x] **Step 2:** Route the git-log dumps (`/capture`, `_shared/trust-table.md`) through `gitLogPath`/`isFresh` the same way.
- [x] **Step 3:** Wire invalidation — a general note on `_shared/github-write-transport.md`'s CRUD mapping (covers every create/edit/close call site plugin-wide) plus explicit calls at `/capture`'s `gh issue create` site and `/specify`'s end-of-batch site (AC2's concrete, testable instance).

**Verify:** `node --test tests/record-queue-fetch-conformance.test.js`.

---

### Task 5: Conformance test

**Files:**
- Create: `tests/record-queue-fetch-conformance.test.js`

- [x] **Step 1:** Every named consumer cites `record-queue-fetch.md`.
- [x] **Step 2:** No named consumer restates a bare `gh issue list --state open|all ... --limit` fetch (regex on same-line `--state open|all` + `--limit`, no `--label`).
- [x] **Step 3:** Regression-shape tests proving the detector actually flags a reintroduced bare fetch and does not false-positive on a `--label`-filtered one.
- [x] **Step 4:** Schema/doc-presence assertions (TTL key registered, snapshot section documents path/freshness/invalidation).

**Verify:** `node --test tests/record-queue-fetch-conformance.test.js` — 8/8 passing.

---

## Acceptance Criteria mapping

1. **One `gh issue list --state all` call per TTL window across `/backlog overview` → `/capture`** — both now read through the same `/tmp/ct-records-{session-id}.json` snapshot; a second call within the TTL is a cache hit (`cp`, no `gh` invocation). Not independently integration-tested in this pass (no live multi-skill session harness exists in `tests/`) — covered by the shared code path both skills now cite and by `record-snapshot.test.js`'s freshness-boundary unit tests.
2. **`/capture`'s `gh issue create` invalidates the snapshot** — `invalidateSnapshot()` call added immediately after `/capture`'s `gh issue create`, unit-tested directly in `record-snapshot.test.js`.
3. **`npm test` passes; the conformance test fails on a regained bare fetch** — `tests/record-queue-fetch-conformance.test.js`'s own regression-shape test proves the detector's sensitivity.

## Verification

- `npm test` — full suite (see this run's own decisions.md for the pre-existing-failure baseline: 5 environment-only failures unrelated to this change, confirmed via `git stash`/clean-tree re-run).
