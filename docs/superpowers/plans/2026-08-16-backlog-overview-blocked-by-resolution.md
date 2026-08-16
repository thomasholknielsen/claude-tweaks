# Backlog Overview Blocked-By Resolution Implementation Plan (#514)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dependency mis-ranking in `/claude-tweaks:backlog overview` impossible to hit silently: native blocked-by data reaches the ranker, `blockersOf` becomes the single precedence decision, prose-vs-resolved mismatches get a loud flag with headline replacement, and `refine` offers a mode-aware repair.

**Architecture:** Expand-contract on `ranking.js`: a new `blockersOf(candidate)` helper (top-level `blockedBy` → `facets.blockedBy` → `parseDependencies(body)` fallback) that `computeUnblocksCount` and #513's `funnelBuckets` both delegate to, so blocker precedence is decided exactly once. New pure `findUnresolvedDependencyProse` powers the mismatch flag. Skill text changes wire the native GraphQL fetch (reusing `buildNativeDependencyQuery`), the detection render rules, and refine's repair. Two #513 carry-ins are resolved here: the `blockersOf` consolidation (staged reflect-1) and parent #512's promise F1 (namespace rule: an `unsynced: true` record's blockers are never resolved against the merged set).

**Tech Stack:** Node 18+ built-in `node --test`; pure functions; markdown skill files; `gh api graphql` (skill-text only).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T010024-spec-513-514-515-516/spec-514/work/514-spec.md`

## Global Constraints

- `ranking.js` stays pure — no I/O; all fetches happen in skill-text Step 3 assembly.
- `parseDependencies` semantics unchanged (line-start `DEP_RE` contract has other consumers).
- `blockersOf(candidate)` is a fixed export name — #515 imports it verbatim.
- `blockedBy: []` (or `facets.blockedBy: []`) is authoritative "no blockers" — never falls through to body parsing.
- Every current `rankNextToBuild` caller without `blockedBy` keys stays byte-compatible (AC 1b regression pin protects `/help`).
- Do not fix #460/#461 in `refine-mode.md`; do not change its Step 4 human-confirm gate semantics.
- Commit messages: `{Verb} {what} — {detail}` imperative, `refs #514` (never closes/fixes).
- Namespace ruling (promise F1, parent #512): blockedBy ids are interpreted in the record's own driver namespace. In a `github-issues` merged set, an `unsynced: true` fallback record's `facets.blockedBy` references local ids — it is never matched against GitHub issue numbers: `funnelBuckets` skips blocker resolution for unsynced records, and overview Step 3 attaches nothing to them.

---

### Task 1: `blockersOf` helper + `computeUnblocksCount` migration in `ranking.js`

**Files:**
- Modify: `bin/lib/issues/ranking.js`
- Test: `tests/bin-lib/issues/ranking.test.js`

**Interfaces:**
- Produces: `blockersOf(candidate) -> number[]` — precedence: `Array.isArray(c.blockedBy)` → verbatim; else `Array.isArray(c.facets?.blockedBy)` → verbatim; else `parseDependencies(c.body || '')`. Exported. (The `facets.blockedBy` middle tier is a deliberate superset of the spec's two-tier wording: the local-files driver already carries native-shaped data there, and #513's `funnelBuckets` — which delegates to this helper in Task 3 — reads it today. Both explicit tiers are authoritative even when empty.)
- Produces: `computeUnblocksCount` now iterates `blockersOf(c)` instead of `parseDependencies(c.body)`.

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/issues/ranking.test.js` (read the file's existing candidate-builder/import style first and match it), add:

```js
test('blockersOf: top-level blockedBy wins over body text when both present and disagree', () => {
  const c = { id: 1, blockedBy: [2], facets: {}, body: 'Blocked by #3' };
  assert.deepEqual(blockersOf(c), [2]);
});

test('blockersOf: no blockedBy key falls back to parseDependencies on the body', () => {
  const c = { id: 1, facets: {}, body: 'Blocked by #3\nsome text' };
  assert.deepEqual(blockersOf(c), [3]);
});

test('blockersOf: blockedBy [] is authoritative — no body fallback', () => {
  const c = { id: 1, blockedBy: [], facets: {}, body: 'Blocked by #3' };
  assert.deepEqual(blockersOf(c), []);
});

test('blockersOf: facets.blockedBy (local driver) used when top-level absent, and [] there is authoritative too', () => {
  assert.deepEqual(blockersOf({ id: 1, facets: { blockedBy: [7] }, body: 'Blocked by #3' }), [7]);
  assert.deepEqual(blockersOf({ id: 1, facets: { blockedBy: [] }, body: 'Blocked by #3' }), []);
});

test('rankNextToBuild: candidate with blockedBy [2] and body "Blocked by #3" ranks using blocker 2, not 3', () => {
  // Three candidates, same priority/size: 2 should gain the unblocks count (1 blocks on it), 3 should not.
  const candidates = [
    { id: 1, blockedBy: [2], facets: {}, body: 'Blocked by #3', keyFiles: [], hasPlan: false },
    { id: 2, facets: {}, body: '', keyFiles: [], hasPlan: false },
    { id: 3, facets: {}, body: '', keyFiles: [], hasPlan: false },
  ];
  const ranked = rankNextToBuild(candidates);
  assert.equal(ranked[0].id, 2); // unblocks 1 other candidate; 3 unblocks none
});

test('rankNextToBuild: no blockedBy keys — body parsing result unchanged (regression pin for /help)', () => {
  const candidates = [
    { id: 1, facets: {}, body: 'Blocked by #2', keyFiles: [], hasPlan: false },
    { id: 2, facets: {}, body: '', keyFiles: [], hasPlan: false },
  ];
  const ranked = rankNextToBuild(candidates);
  assert.equal(ranked[0].id, 2);
});
```

(Fold facet defaults into the file's existing candidate-builder helper if one exists; the `facets: {}` shape above is a minimal stand-in — adapt to what `ranking.test.js` already uses. `priorityBandOf`/`sizeBandOf` tolerate missing keys via `c.facets.priority` truthiness, so `facets: {}` is safe.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/ranking.test.js`
Expected: FAIL — `blockersOf` not exported.

- [ ] **Step 3: Implement**

In `bin/lib/issues/ranking.js`, above `computeUnblocksCount`:

```js
// candidate -> number[]. THE single blocker-precedence decision, shared by
// computeUnblocksCount here and funnelBuckets (backlog.js) — never re-implement
// it at a call site. Precedence: top-level `blockedBy` (attached by the
// overview's native fetch, or any caller that resolved blockers itself) wins;
// then the local-files driver's `facets.blockedBy` (already native-shaped
// frontmatter data); then record.js's parseDependencies over the body
// (work-links: body-text). Both explicit tiers are authoritative even when
// empty — `[]` means "confirmed no blockers", never "fall through to prose".
function blockersOf(candidate) {
  if (Array.isArray(candidate.blockedBy)) return candidate.blockedBy;
  if (candidate.facets && Array.isArray(candidate.facets.blockedBy)) return candidate.facets.blockedBy;
  return parseDependencies(candidate.body || '');
}
```

Change `computeUnblocksCount`'s inner loop from `parseDependencies(c.body)` to `blockersOf(c)`, and update its comment (it no longer reads only body declarations). Update the module header comment's input contract (candidates *may* carry `blockedBy`/`facets.blockedBy`; precedence lives in `blockersOf`). Export `blockersOf`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/ranking.test.js`
Expected: PASS (new + all pre-existing cases).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/ranking.js tests/bin-lib/issues/ranking.test.js
git commit -m "Add blockersOf precedence helper and migrate computeUnblocksCount — refs #514"
```

---

### Task 2: `findUnresolvedDependencyProse` in `ranking.js`

**Files:**
- Modify: `bin/lib/issues/ranking.js`
- Test: `tests/bin-lib/issues/ranking.test.js`

**Interfaces:**
- Consumes: `blockersOf` (Task 1).
- Produces: `findUnresolvedDependencyProse(candidates) -> Array<{id, mention}>` — exported; `mention` is the trimmed full containing line of the first `/blocked by #\d+/i` match; a candidate is included only when its body matches anywhere AND `blockersOf(c)` resolves empty.

- [ ] **Step 1: Write the failing tests**

```js
test('findUnresolvedDependencyProse: mid-line prose with empty resolved blockers is flagged, mention is the trimmed line', () => {
  const c = { id: 418, facets: {}, body: 'Overview text.\n  Hard prerequisites, wired as Blocked by links: #418 and #419.  \nMore.' };
  const hits = findUnresolvedDependencyProse([c]);
  assert.deepEqual(hits, [{ id: 418, mention: 'Hard prerequisites, wired as Blocked by links: #418 and #419.' }]);
});

test('findUnresolvedDependencyProse: not flagged when blockedBy is attached non-empty', () => {
  const c = { id: 420, blockedBy: [418, 419], facets: {}, body: 'wired as Blocked by links: #418 and #419' };
  assert.deepEqual(findUnresolvedDependencyProse([c]), []);
});

test('findUnresolvedDependencyProse: not flagged when a canonical line-start declaration resolves via fallback', () => {
  const c = { id: 5, facets: {}, body: 'Blocked by #418\nrest of body' };
  assert.deepEqual(findUnresolvedDependencyProse([c]), []);
});

test('findUnresolvedDependencyProse: case-insensitive match', () => {
  const c = { id: 6, facets: {}, body: 'This is BLOCKED BY #7 in prose only' };
  assert.equal(findUnresolvedDependencyProse([c]).length, 1);
});

test('findUnresolvedDependencyProse: no prose mention, no flag (negative control)', () => {
  const c = { id: 8, facets: {}, body: 'No dependencies at all.' };
  assert.deepEqual(findUnresolvedDependencyProse([c]), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/ranking.test.js`
Expected: FAIL — `findUnresolvedDependencyProse` not exported.

- [ ] **Step 3: Implement**

```js
// candidates[] -> [{id, mention}] for every candidate whose body mentions a
// dependency anywhere (/blocked by #\d+/i — deliberately broader than
// record.js's line-anchored DEP_RE, mid-line prose included) while
// blockersOf(c) resolves empty: prose claims a dependency, but neither the
// native graph, the local driver, nor a canonical line backs it — the
// ranker is about to treat this candidate as unblocked, and the caller
// should say so loudly. Fires only on EMPTY resolved blockers by design: a
// partially wired record (non-empty blockedBy missing some prose-mentioned
// id) is not flagged — prose #N mentions have no mechanical ground truth,
// so partial-coverage checking would guess. `mention` is the trimmed full
// containing line of the first match.
const PROSE_DEP_RE = /blocked by #\d+/i;
function findUnresolvedDependencyProse(candidates) {
  const hits = [];
  for (const c of candidates) {
    const body = c.body || '';
    if (!PROSE_DEP_RE.test(body)) continue;
    if (blockersOf(c).length > 0) continue;
    const line = body.split('\n').find((l) => PROSE_DEP_RE.test(l));
    hits.push({ id: c.id, mention: line.trim() });
  }
  return hits;
}
```

Export alongside `rankNextToBuild` and `blockersOf`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/ranking.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/ranking.js tests/bin-lib/issues/ranking.test.js
git commit -m "Add findUnresolvedDependencyProse mismatch detector — refs #514"
```

---

### Task 3: `funnelBuckets` delegates to `blockersOf` + unsynced namespace rule (carry-ins from #513)

**Files:**
- Modify: `bin/lib/issues/backlog.js`
- Test: `tests/bin-lib/issues/backlog.test.js`

**Interfaces:**
- Consumes: `blockersOf` from `./ranking` (no require cycle: ranking.js requires only record.js/grouping.js).
- Produces: `funnelBuckets` blocker resolution now = `facets.unsynced === true ? [] : blockersOf(record)`, in-set filtering unchanged. Resolves staged reflect-1 (one precedence owner) and parent #512 promise F1 (namespace rule in Global Constraints).

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/issues/backlog.test.js`'s funnelBuckets group (reuse the `rec()` helper):

```js
test('funnelBuckets: body-text canonical declaration now resolves via blockersOf — granted, not dispatchable', () => {
  const records = [
    rec(1, { stage: 'ready', grants: { build: true, merge: false } }, { body: 'Blocked by #2' }),
    rec(2, { stage: 'ready', grants: { build: false, merge: true } }),
  ];
  const b = funnelBuckets(records);
  assert.deepEqual(b.granted.map((r) => r.number), [1]);
  assert.deepEqual(b.dispatchable.map((r) => r.number), [2]);
});

test('funnelBuckets: unsynced record blockers are never resolved against the merged set (namespace rule)', () => {
  const records = [
    rec(1, { stage: 'ready', grants: { build: true, merge: false }, unsynced: true, blockedBy: [2] }),
    rec(2, { stage: 'ready', grants: { build: false, merge: true } }),
  ];
  const b = funnelBuckets(records);
  // Record 1's facets.blockedBy [2] references a LOCAL id; record 2 here is a
  // GitHub record — cross-namespace matching is forbidden, so 1 is dispatchable.
  assert.deepEqual(b.dispatchable.map((r) => r.number), [1, 2]);
  assert.deepEqual(b.granted, []);
});
```

(`rec()`'s facet overrides spread into the facets object, so `unsynced: true` and `blockedBy: [2]` land as `facets.unsynced`/`facets.blockedBy`. The existing funnelBuckets tests — top-level wins over facets, `[]` authoritative, absent-blockedBy dormancy — must keep passing unchanged: `blockersOf`'s precedence is a superset of the inline logic it replaces, except records whose body carries canonical `Blocked by #N` lines, which now resolve (first test above).)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: the two new tests FAIL (body-text case buckets 1 as dispatchable today; unsynced case buckets 1 as granted today).

- [ ] **Step 3: Implement**

In `bin/lib/issues/backlog.js`: add `const { blockersOf } = require('./ranking');` to the imports. In `funnelBuckets`, replace the inline `blockers`/`inSetBlockers` resolution with:

```js
    // Blocker precedence is owned by ranking.js's blockersOf — one decision,
    // shared with rankNextToBuild (refs #514). An unsynced fallback record's
    // facets.blockedBy references LOCAL record ids, a different namespace from
    // the GitHub numbers in a merged set — never cross-match them (parent
    // #512 promise F1): its blockers resolve as none here.
    const inSetBlockers = f.unsynced === true
      ? []
      : blockersOf(r).filter((id) => openIds.has(id));
```

Update the function's header comment: the `blockedBy` sentence now points at `blockersOf` for precedence (top-level → facets → body-text fallback) and states the unsynced namespace rule.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/backlog.test.js tests/bin-lib/issues/ranking.test.js`
Expected: PASS — including every pre-existing funnelBuckets case.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/backlog.js tests/bin-lib/issues/backlog.test.js
git commit -m "Delegate funnelBuckets blocker precedence to blockersOf with unsynced namespace rule — refs #514"
```

---

### Task 4: `overview-mode.md` Step 3 — blocker attachment, mismatch detection, headline replacement

**Files:**
- Modify: `skills/backlog/overview-mode.md` (Step 3 only)

**Interfaces:**
- Consumes: `blockersOf`/`findUnresolvedDependencyProse` (Tasks 1-2), `buildNativeDependencyQuery` (`bin/lib/issues/record.js`), `probeSchema` (`bin/lib/issues/capabilities-probe.js`).

- [ ] **Step 1: Extend Step 3's candidate assembly**

After the existing three bullet inputs (`keyFiles`, `hasPlan`, `body`) in `## Step 3`, add a fourth bullet plus the attachment procedure. The added text must state exactly:

- `blockedBy` — resolved per `work-links`/`work-backend`:
  - **`work-links: native`** (resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links`): fetch every candidate's blocked-by set as **one aliased GraphQL query** using `buildNativeDependencyQuery` (`bin/lib/issues/record.js`) — one alias per candidate issue, chunked at 50 aliases per request (buildable candidate sets are small, so one chunk is the norm) — and attach `blockedBy: [ids]` (the open blockers' numbers from each alias's `blockedBy.nodes`). A candidate whose node is missing or errored inside an otherwise-successful batch response gets **nothing attached** for that id only — never coerce a failed node to `[]`, since an empty array means "confirmed no blockers" and the mismatch detection below runs on exactly that distinction. Before the fetch, check field availability via `capabilities-probe.js`'s `probeSchema` (the `blockedBy` field itself — its count-only sibling `issueDependenciesSummary` is insufficient); probe unavailability or whole-fetch failure degrades to the body-text fallback with one failure-only narration line (per this file's failure-only narration rule), never a hard stop.
  - **`work-backend: local-files`**: attach `facets.blockedBy` as the `blockedBy` array — it is already native-shaped data (and `blockersOf`'s own `facets.blockedBy` tier makes this attachment a no-op safety net rather than load-bearing).
  - **`work-links: body-text`**: attach nothing — `blockersOf`'s `parseDependencies` fallback stands.
  - **`unsynced: true` fallback records** (any driver): attach nothing, and their own `facets.blockedBy` is deliberately not consulted — those ids live in the local-record namespace and must never cross-match GitHub issue numbers in the merged set (parent #512 promise F1; `funnelBuckets` applies the same rule).

- [ ] **Step 2: Add the detection + render rules after the ranking call**

After the `rankNextToBuild` block, add a `### Dependency-mismatch detection` subsection stating exactly:

- Run `findUnresolvedDependencyProse` (from `ranking.js`) over the candidates. On any hit, render a loud flag naming the affected ids with their `mention` lines, and **suppress every chain-shaped claim** about them ("unblocks N", dependency-order phrasing) — no corrected chain is drawn (chain rendering is the batch-emitter sub-issue).
- The accepted limitation, verbatim: the check fires only on empty resolved blockers; a *partially* wired record (non-empty `blockedBy` missing some prose-mentioned id) is not flagged — prose mentions have no mechanical ground truth, so partial-coverage checking would guess.
- **Headline-replacement rule:** when detection fires, the flagged candidates get no mechanical recommendation. Either (a) the output cites explicit dependency evidence it holds — native links on other candidates, the flagged records' own prose — as a **corrected** "Recommended next" with the citation inline, in which case the corrected pick IS the headline and the raw ranker pick demotes to a one-line footnote (never render a recommendation the same output retracts); or (b) when no such evidence resolves an order, the output states plainly that ranking is unreliable for the flagged set and points at `/claude-tweaks:backlog refine`'s dependency repair.
- A worked example tracing the observed #418/#419/#420 failure: three records wired `#420 blocked-by #419 blocked-by #418` in the native graph, bodies carrying only prose mentions ("Hard prerequisites, wired as Blocked by links: …"). Pre-#514: bodies parse as zero-dependency, `rankNextToBuild` recommends #420 (the chain's *last* record) first. Post-#514: the native fetch attaches `blockedBy: [419]`/`[418]`/`[]`, the ranker sees the true order, and #418 heads the recommendation; had the fetch failed, `findUnresolvedDependencyProse` flags all three (prose mention, empty resolution) and case (b) replaces the headline with the unreliable-ranking statement.

- [ ] **Step 3: Verify by grep**

```bash
grep -ci "corrected" skills/backlog/overview-mode.md
grep -c "buildNativeDependencyQuery" skills/backlog/overview-mode.md
grep -ci "probeSchema\|capabilities-probe" skills/backlog/overview-mode.md
grep -ci "418" skills/backlog/overview-mode.md
grep -ci "never coerce a failed node" skills/backlog/overview-mode.md
grep -ci "partially.*wired\|partial-coverage" skills/backlog/overview-mode.md
```

Every grep must hit (non-zero).

- [ ] **Step 4: Commit**

```bash
git add skills/backlog/overview-mode.md
git commit -m "Wire native blocked-by attachment and mismatch detection into overview Step 3 — refs #514"
```

---

### Task 5: `refine-mode.md` Apply step — mode-aware dependency repair

**Files:**
- Modify: `skills/backlog/refine-mode.md` (Step 5 Apply only)

- [ ] **Step 1: Add the repair block**

At the end of `## Step 5: Apply` (after the Grant rows block), add a `**Dependency-repair rows:**` block stating exactly:

- For records flagged by overview's `findUnresolvedDependencyProse` detection (carried into this refine run's worklist), offer the mode-aware repair as a new confirmable item type in the existing Step 4 unified table + confirm gate — surfaced and applied exactly like every other write in this step, never bypassing or altering when the gate fires or that it blocks until confirmed.
- **`work-links: native`**: wire the native blocked-by link via the same dependency API `/claude-tweaks:specify`'s Step 4 linking uses.
- **`work-links: body-text`**: append a canonical line-start `Blocked by #N` line to the record body (`gh issue edit --body-file` under `github-issues`; `writeRecord` + `git add`/`git commit` under `local-files`, same as the Related-line path above).
- **Never write both representations for one edge.**

- [ ] **Step 2: Verify by grep**

```bash
grep -ci "blocked.by" skills/backlog/refine-mode.md
grep -ci "never write both" skills/backlog/refine-mode.md
```

Both must hit.

- [ ] **Step 3: Commit**

```bash
git add skills/backlog/refine-mode.md
git commit -m "Add mode-aware dependency repair to refine Apply step — refs #514"
```

---

### Task 6: Revert-discrimination check + suite run (AC 5)

**Files:**
- Read-only / transient: `bin/lib/issues/ranking.js`

- [ ] **Step 1: Verify test discrimination by reverting**

Run (one command per call; measure the baseline with `git stash push` NEVER — use targeted checkout of the single file):

```bash
git checkout 2ba0e2b4 -- bin/lib/issues/ranking.js
node --test tests/bin-lib/issues/ranking.test.js
```

Expected: FAIL (the new blockersOf/findUnresolvedDependencyProse tests fail against the pre-#514 file — that failure is the check passing). Note: `2ba0e2b4` is the branch commit immediately before this plan's Task 1 commit; if a different commit is the actual pre-Task-1 tip at execution time, substitute it (`git log --oneline bin/lib/issues/ranking.js` shows the file's last pre-plan commit). Then restore:

```bash
git checkout HEAD -- bin/lib/issues/ranking.js
node --test tests/bin-lib/issues/ranking.test.js
```

Expected: PASS. A harness reminder about the file being "modified externally" after `git checkout -- ` is the checkout's own side effect, not real signal.

- [ ] **Step 2: Run the issues suites**

Run: `node --test tests/bin-lib/issues/*.test.js` (glob form — a bare directory arg doesn't recurse on this node version)
Expected: PASS.

- [ ] **Step 3: No commit** (nothing changed — this task is verification only; if Step 1's revert was accidentally committed, stop and report BLOCKED).
