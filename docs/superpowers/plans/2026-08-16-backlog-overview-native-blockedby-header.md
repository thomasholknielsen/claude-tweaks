# Backlog Overview Native Blocked-By Header Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backlog overview funnel header's `granted`/`dispatchable` split correctly account for native GitHub `blockedBy` links (not just body-text/facets data), for the `ready`+granted subset only.

**Architecture:** `funnelBuckets` (`bin/lib/issues/backlog.js`) already buckets a record into `granted` instead of `dispatchable` when its top-level `r.blockedBy` array is non-empty and in-set (proven by the existing test `'funnelBuckets precedence: ready + grant + non-empty in-set blockedBy is granted, not dispatchable'`) — via `blockersOf`'s (`ranking.js`) precedence chain, which reads `r.blockedBy` before falling back to `facets.blockedBy` or body-text. Nothing currently populates `r.blockedBy` for the full open set before `funnelBuckets` runs in `overview-mode.md` Step 2 — that attachment only happens later, in Step 3, and only for the already-filtered buildable subset. This plan adds a small, pure, exported filter (`readyGrantedSubset`) that computes exactly the candidate set Step 2's future native pre-attach fetch must target, with unit tests proving both the filter's boundary and that `funnelBuckets` already does the right thing once `r.blockedBy` is attached. It then updates `overview-mode.md`'s Step 2 prose/script and Step 3's limitation clause to describe the new pre-attach procedure — no fetch code is committed to `bin/`, since the fetch itself (a `gh api graphql` call) is I/O the skill-markdown already describes as a runtime procedure the executing agent performs, mirroring Step 3's existing (uncommitted, prose-only) native fetch.

**Tech Stack:** Node.js (`node --test`), CommonJS, `gh api graphql`, markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T091924-spec-563-564-565-566/spec-563/work/563-spec.md`

## Global Constraints

- No change to `funnelBuckets`'s signature or behavior — it already handles the attached case correctly.
- The fetch is bounded to the ready+granted subset only — never issued against the full open queue (Acceptance Criteria).
- A missing/errored native-fetch node must never be coerced to `[]` (Gotchas) — absence, not an empty array, on failure.
- `work-links: body-text` and `work-backend: local-files` repos are unaffected (Acceptance Criteria).

---

### Task 1: `readyGrantedSubset` filter + unit tests

**Files:**
- Modify: `bin/lib/issues/backlog.js` (add function + export, near `funnelBuckets`)
- Test: `tests/bin-lib/issues/backlog.test.js` (add test cases near the existing `funnelBuckets` block, after line ~336)

**Interfaces:**
- Produces: `readyGrantedSubset(records) -> records[]` — a pure filter, `records.filter((r) => r.facets.stage === 'ready' && (r.facets.grants.build || r.facets.grants.merge))`. Exported from `bin/lib/issues/backlog.js`'s `module.exports` alongside `funnelBuckets`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/issues/backlog.test.js`, after the existing funnel-related tests (the file already imports `funnelBuckets` from `../../../bin/lib/issues/backlog` at the top — add `readyGrantedSubset` to that same destructured import):

```javascript
test('readyGrantedSubset: returns only ready+granted records, in input order', () => {
  const records = [
    rec(1, { stage: 'ready', grants: { build: true, merge: false } }),   // included (build grant)
    rec(2, { stage: 'ready', grants: { build: false, merge: true } }),   // included (merge grant)
    rec(3, { stage: 'ready', grants: { build: false, merge: false } }),  // excluded (ready, not granted)
    rec(4, { stage: 'backlog', grants: { build: true, merge: true } }),  // excluded (not ready)
    rec(5, { stage: 'parked', grants: { build: true, merge: true } }),   // excluded (not ready)
  ];
  const subset = readyGrantedSubset(records);
  assert.deepEqual(subset.map((r) => r.number), [1, 2]);
});

test('readyGrantedSubset: empty input yields empty output', () => {
  assert.deepEqual(readyGrantedSubset([]), []);
});

test('funnelBuckets: a record with native-attached top-level blockedBy lands in granted (Step 2 pre-attach target behavior)', () => {
  // Simulates what overview-mode.md Step 2's native pre-attach fetch produces: a
  // ready+granted record whose only blocker link is native (no body text, no
  // facets.blockedBy) gets its blocker attached as top-level r.blockedBy.
  const records = [
    rec(10, { stage: 'ready', grants: { build: true, merge: false } }, { body: 'no dependency prose here', blockedBy: [11] }),
    rec(11, { stage: 'ready', grants: { build: false, merge: true } }),
  ];
  const b = funnelBuckets(records);
  assert.deepEqual(b.granted.map((r) => r.number), [10]);
  assert.deepEqual(b.dispatchable.map((r) => r.number), [11]);
});

test('funnelBuckets: same native-blocked record with no pre-attach (probe-failure no-op) still lands in dispatchable, not a crash', () => {
  // Simulates the degrade path: probe/fetch failure means Step 2 attaches
  // nothing, so the record falls through to the existing behavior unchanged.
  const records = [
    rec(10, { stage: 'ready', grants: { build: true, merge: false } }, { body: 'no dependency prose here' }),
    rec(11, { stage: 'ready', grants: { build: false, merge: true } }),
  ];
  const b = funnelBuckets(records);
  assert.deepEqual(b.dispatchable.map((r) => r.number).sort(), [10, 11]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: FAIL — `readyGrantedSubset` is not defined / not exported (the two new native-blockedBy `funnelBuckets` tests should already PASS, since they exercise existing behavior — that's expected and fine; only the `readyGrantedSubset` tests must fail at this step).

- [ ] **Step 3: Implement `readyGrantedSubset`**

In `bin/lib/issues/backlog.js`, add immediately before `function funnelBuckets(records) {`:

```javascript
// records[] -> the ready+granted subset only — the exact candidate set
// overview-mode.md Step 2's native blockedBy pre-attach fetch must target
// (refs #563). NOT the same as Step 3's buildable subset (dispatchable ∪
// granted) — this runs BEFORE funnelBuckets has produced those buckets, so
// "granted" here is computed independently of the in-set-blockers split
// that native resolution is meant to correct.
function readyGrantedSubset(records) {
  return records.filter((r) => r.facets.stage === 'ready' && (r.facets.grants.build || r.facets.grants.merge));
}
```

Add `readyGrantedSubset,` to the `module.exports` block (alongside `funnelBuckets,`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: PASS — all tests in the file, including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/backlog.js tests/bin-lib/issues/backlog.test.js
git commit -m "Add readyGrantedSubset filter for overview Step 2's native blockedBy pre-attach — refs #563"
```

---

### Task 2: `overview-mode.md` Step 2 pre-attach procedure + Step 3 limitation-clause update

**Files:**
- Modify: `skills/backlog/overview-mode.md`

**Interfaces:**
- Consumes: `readyGrantedSubset` (Task 1, `bin/lib/issues/backlog.js`), `buildNativeDependencyQuery` (`bin/lib/issues/record.js`, existing — takes `numbers[]`, returns a GraphQL query string aliased `i{n}`), `hasOpenNativeBlocker` (`bin/lib/issues/record.js`, existing — takes one alias's `{number, blockedBy:{nodes}}` value, returns `true` if any node has `state: 'OPEN'`), `probeCapabilities` (`bin/lib/issues/capabilities-probe.js`, existing — `probeCapabilities({owner, repo}).dependencies` is `true` when the `blockedBy` field is available on this GitHub host).
- Produces: no new exported interface — this task is a skill-markdown procedure/prose change only, consumed at runtime by whichever agent executes `/claude-tweaks:backlog overview`.

- [ ] **Step 1: Insert the native pre-attach procedure into Step 2, before the existing code block**

In `skills/backlog/overview-mode.md`, immediately before the `## Step 2: Route by lens` section's existing ` ```bash ... node -e ... ``` ` block (the one computing `.funnel: bl.funnelBuckets(all)`), insert this new subsection and prose (placed directly under the `## Step 2: Route by lens` heading, before the code block):

```markdown
**Native blocked-by pre-attach (bare mode only, `work-links: native` repos only — refs #563).** Before the funnel-computation script below runs, resolve native `blockedBy` links for the **ready+granted subset only** (`bl.readyGrantedSubset(all)`, `bin/lib/issues/backlog.js`) — the only records whose `granted`/`dispatchable` split this header renders. This is deliberately narrower than Step 3's own buildable subset (`dispatchable` ∪ `granted`, computed only after this script runs) — see that function's own comment for why the two are not interchangeable.

Resolve `work-links` (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links`); skip this subsection entirely on `work-links: body-text` or `work-backend: local-files` repos — `blockersOf`'s existing facets/body-text fallback stands unchanged for them, exactly as it does today.

On `work-links: native`: check field availability via `capabilities-probe.js`'s `probeCapabilities({owner, repo}).dependencies` first. On probe failure or unavailability, skip the fetch entirely (no-op) — funnel computation proceeds below with `r.blockedBy` unset for every candidate, identical to today's behavior. On probe success, fetch every `readyGrantedSubset` candidate's blocked-by set as one aliased GraphQL query using `buildNativeDependencyQuery` (`bin/lib/issues/record.js`), chunked at 50 aliases per request (the same chunking Step 3 already uses), then for each candidate whose alias resolved, set `r.blockedBy = nodes.filter(open).map(number)` using `hasOpenNativeBlocker`-equivalent open-state filtering (`record.js`) — a candidate whose alias is missing or errored inside an otherwise-successful batch gets **nothing attached** (never coerced to `[]`), the same never-coerce rule Step 3 already documents. On whole-fetch failure, no-op the same as probe failure. Any of these degrade paths renders the header exactly as it does today — no hard stop, per this file's failure-only narration convention (one line only when at least one alias inside an otherwise-successful batch failed, naming the affected ids).

The funnel-computation script below then reads `all` with these `r.blockedBy` values already attached — `funnelBuckets`'s existing `blockersOf` precedence (top-level `r.blockedBy` first) buckets a now-attached record into `granted` instead of `dispatchable` with no further change.
```

- [ ] **Step 2: Update Step 3's stale limitation clause**

In the same file, `## Step 3 (bare only): Recommend what to build next`, replace this sentence (currently reading, in full):

> One limitation on that guarantee: the funnel header's own `granted`/`dispatchable` split (Step 2) resolves blockers from body-text/`facets` data only — native `blockedBy` attachment happens here, in Step 3 — so on a `work-links: native` repo a natively-blocked record can still render `dispatchable` in the header even though this step's native fetch would resolve it as blocked. Header-level native resolution is deliberately out of this record's scope (captured as a follow-up record).

with:

> Step 2's own native `blockedBy` pre-attach (above, refs #563) now covers the ready+granted subset this header renders, so the header and this step's recommendation read the same blocker data for the population both touch — this step's own fetch below still runs independently over its own (differently-scoped) buildable candidate set, since the two subsets are not identical (see Step 2's pre-attach note for why).

- [ ] **Step 3: Verify the edit reads correctly end-to-end**

Read the full `## Step 2` and `## Step 3` sections back after editing; confirm no dangling reference to the removed "deliberately out of scope" framing remains elsewhere in the file (`grep -n "Header-level native resolution is deliberately out of this record's scope" skills/backlog/overview-mode.md` should return nothing).

- [ ] **Step 4: Commit**

```bash
git add skills/backlog/overview-mode.md
git commit -m "Document overview Step 2 native blockedBy pre-attach for the funnel header — refs #563"
```
