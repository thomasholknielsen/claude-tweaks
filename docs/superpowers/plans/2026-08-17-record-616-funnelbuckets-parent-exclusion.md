# funnelBuckets isParentIssue Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop decomposition-parent records from rendering as `scored` (or any buildable bucket) in `/claude-tweaks:backlog overview`'s funnel, so the funnel header and Shape paste block never point a human at `/claude-tweaks:specify #{parent}` for a record `/specify` already decomposed.

**Architecture:** `funnelBuckets` (`bin/lib/issues/backlog.js`) gains a ninth, dedicated `parents` bucket. A record is routed there — instead of `captured`/`scored`/`shaped`/`granted`/`dispatchable` — when `facets.isParentIssue === true`, checked after the existing `inFlight`/`parked`/`notPlanned` precedence (unchanged) and before the ready-stage/scored/captured checks. `skills/backlog/overview-mode.md`'s bare-mode annotation section renders the new bucket's count as a one-line pointer to the lane that actually owns parent close-out (`/claude-tweaks:wrap-up`'s verification brief / `/claude-tweaks:demo`'s parent-close path), mirroring the existing `parked`/`not-planned` annotation line. `skills/backlog/refine-mode.md` needs no change — its priority/Related worklist reads `refineWorklist`, a function that never touches `funnelBuckets` or `facets.isParentIssue`, verified during research (Task 3 pins this with an explicit grep, not a silent skip).

**Tech Stack:** Node.js (`bin/lib/issues/backlog.js`), `node --test` (tests/bin-lib/issues/backlog.test.js), Markdown skill files (no test harness — inspection only).

**Spec:** `.claude-tweaks/pipelines/2026-08-17T060205-record-616/work/616-spec.md` (materialized from GitHub issue #616)

## Global Constraints

- No new dependencies — pure additions to existing pure functions.
- `facets.isParentIssue` is already live on both drivers (`bin/lib/issues/record.js` line 313/318 for `work-backend: github-issues`; `bin/lib/issues/local-store.js` line 139 for `work-backend: local-files`) — this plan only adds a *reader*, never touches the parse side.
- Every existing `funnelBuckets` test fixture (the `rec()` helper in `tests/bin-lib/issues/backlog.test.js`) already defaults `isParentIssue: false`, so no existing test needs updating for the new field — only new fixtures opt in.
- Mutual-exclusivity invariant: every open record still lands in exactly one of the nine buckets (`captured`, `scored`, `shaped`, `granted`, `dispatchable`, `inFlight`, `parked`, `notPlanned`, `parents`); the `needsYou` overlay is unaffected (unchanged code path).

---

### Task 1: `funnelBuckets` gains a `parents` bucket

**Files:**
- Modify: `bin/lib/issues/backlog.js:149-227` (doc comment above `funnelBuckets` + the function body)
- Test: `tests/bin-lib/issues/backlog.test.js`

**Interfaces:**
- Consumes: `facets.isParentIssue` (boolean, already parsed by both drivers — no change needed there).
- Produces: `funnelBuckets(records)` now returns `{ captured, scored, shaped, granted, dispatchable, inFlight, parked, notPlanned, parents, needsYou }` — every downstream reader (`overview-mode.md` Step 2/3/4, this plan's Task 2) reads `.funnel.parents` (an array of records, same shape as every other bucket) and `.funnel.parents.length`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/issues/backlog.test.js`, directly after the existing `'funnelBuckets: empty input yields empty buckets and overlay'` test (currently ending around line 282):

```javascript
test('funnelBuckets: empty input yields empty parents bucket too', () => {
  const b = funnelBuckets([]);
  assert.deepEqual(b.parents, []);
});

test('funnelBuckets: a parent record with risk/size labels lands in parents, not scored or captured', () => {
  const b = funnelBuckets([
    rec(1, { isParentIssue: true, risk: 'low', size: 'medium' }),
    rec(2, { isParentIssue: true }),
  ]);
  assert.deepEqual(b.parents.map((r) => r.number), [1, 2]);
  assert.deepEqual(b.scored, []);
  assert.deepEqual(b.captured, []);
});

test('funnelBuckets: a parent record is never shaped, granted, or dispatchable even if stage is ready', () => {
  const b = funnelBuckets([
    rec(1, { isParentIssue: true, stage: 'ready' }),
    rec(2, { isParentIssue: true, stage: 'ready', grants: { build: true, merge: false } }),
  ]);
  assert.deepEqual(b.parents.map((r) => r.number), [1, 2]);
  assert.deepEqual(b.shaped, []);
  assert.deepEqual(b.dispatchable, []);
  assert.deepEqual(b.granted, []);
});

test('funnelBuckets: bot:in-progress still outranks isParentIssue (existing precedence unchanged)', () => {
  const b = funnelBuckets([rec(1, { isParentIssue: true, bot: { inProgress: true, blocked: false } })]);
  assert.deepEqual(b.inFlight.map((r) => r.number), [1]);
  assert.deepEqual(b.parents, []);
});
```

Also extend the existing sum-to-total test (`'funnelBuckets: every open record lands in exactly one bucket and sizes sum to input length'`, currently lines 251-274) to include a parent record and the new bucket in its `all` concatenation:

```javascript
test('funnelBuckets: every open record lands in exactly one bucket and sizes sum to input length', () => {
  const records = [
    rec(1, { bot: { inProgress: true, blocked: false } }),                                    // inFlight
    rec(2, { stage: 'parked' }),                                                              // parked
    rec(3, { notPlanned: true }),                                                             // notPlanned
    rec(4, { stage: 'ready', grants: { build: true, merge: false } }, { blockedBy: [5] }),    // granted (5 in set)
    rec(5, { stage: 'ready', grants: { build: true, merge: false } }),                        // dispatchable
    rec(6, { stage: 'ready' }),                                                               // shaped
    rec(7, { priority: 'high' }),                                                             // scored
    rec(8),                                                                                   // captured
    rec(9, { isParentIssue: true, risk: 'low', size: 'medium' }),                             // parents
  ];
  const b = funnelBuckets(records);
  const all = [...b.captured, ...b.scored, ...b.shaped, ...b.granted, ...b.dispatchable, ...b.inFlight, ...b.parked, ...b.notPlanned, ...b.parents];
  assert.equal(all.length, records.length);
  assert.equal(new Set(all.map((r) => r.number)).size, records.length);
  assert.deepEqual(b.inFlight.map((r) => r.number), [1]);
  assert.deepEqual(b.parked.map((r) => r.number), [2]);
  assert.deepEqual(b.notPlanned.map((r) => r.number), [3]);
  assert.deepEqual(b.granted.map((r) => r.number), [4]);
  assert.deepEqual(b.dispatchable.map((r) => r.number), [5]);
  assert.deepEqual(b.shaped.map((r) => r.number), [6]);
  assert.deepEqual(b.scored.map((r) => r.number), [7]);
  assert.deepEqual(b.captured.map((r) => r.number), [8]);
  assert.deepEqual(b.parents.map((r) => r.number), [9]);
});
```

This replaces the existing version of that test in place (same test name, extended body) — do not leave the old 8-bucket version alongside a duplicate.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: FAIL — `b.parents` is `undefined` (`TypeError: Cannot read properties of undefined`), and the parent-record fixture tests show `isParentIssue: true` records landing in `scored`/`captured`/`shaped`/`dispatchable` instead of a `parents` bucket.

- [ ] **Step 3: Implement `parents` bucket**

In `bin/lib/issues/backlog.js`, update the doc comment directly above `funnelBuckets` (currently starting `// records[] -> { captured, scored, shaped, granted, dispatchable, inFlight,` around line 149) — change the return-shape line and the "eight stage keys" sentence:

```javascript
// records[] -> { captured, scored, shaped, granted, dispatchable, inFlight,
// parked, notPlanned, parents }. The nine stage keys (captured..parents)
// are mutually exclusive buckets over the post-merge faceted set (github +
```

Then update the function body:

```javascript
function funnelBuckets(records) {
  const buckets = {
    captured: [], scored: [], shaped: [], granted: [],
    dispatchable: [], inFlight: [], parked: [], notPlanned: [], parents: [],
  };
  const openIds = new Set(records.map((r) => r.number ?? r.id).filter((n) => n != null));
  for (const r of records) {
    const f = r.facets;
    const granted = f.grants.build || f.grants.merge;
    // Blocker precedence, INCLUDING the unsynced-namespace short-circuit, is
    // owned by ranking.js's blockersOf — one decision, shared with
    // rankNextToBuild (refs #514).
    const inSetBlockers = blockersOf(r).filter((id) => openIds.has(id));
    if (f.bot.inProgress) buckets.inFlight.push(r);
    else if (f.stage === 'parked') buckets.parked.push(r);
    else if (f.notPlanned) buckets.notPlanned.push(r);
    else if (f.isParentIssue) buckets.parents.push(r);
    else if (f.stage === 'ready' && granted && inSetBlockers.length > 0) buckets.granted.push(r);
    else if (f.stage === 'ready' && granted) buckets.dispatchable.push(r);
    else if (f.stage === 'ready') buckets.shaped.push(r);
    else if (f.priority || f.risk || f.size) buckets.scored.push(r);
    else buckets.captured.push(r);
  }
```

Everything below this block (the `needsYou` overlay loop and `buckets.needsYou = needsYou; return buckets;`) is unchanged — leave it exactly as-is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: PASS — every existing test plus the four new/extended ones.

- [ ] **Step 5: Verify the new tests actually discriminate**

Temporarily revert the `else if (f.isParentIssue) buckets.parents.push(r);` line only (comment it out or `git stash` the Step 3 change), re-run `node --test tests/bin-lib/issues/backlog.test.js`, confirm the new parent-fixture tests fail (not just pass vacuously), then restore the fix and re-run to confirm green again. This project's own convention (verify test discrimination by reverting) requires this — do not skip it.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/backlog.js tests/bin-lib/issues/backlog.test.js
git commit -m "Add funnelBuckets parents bucket — exclude isParentIssue records from scored/captured/shaped/granted/dispatchable

refs #616"
```

---

### Task 2: Render the `parents` annotation line in overview-mode.md

**Files:**
- Modify: `skills/backlog/overview-mode.md` (bare-mode annotation section, currently the two bullets directly below the funnel-header template — search for `parked {N} · not-planned {M}`)

**Interfaces:**
- Consumes: `.funnel.parents.length` (Task 1's new bucket, already present in `/tmp/backlog-overview-views.json`'s `funnel` key — no change needed to Step 2's compute script, since it already does `funnel: bl.funnelBuckets(all)`).
- Produces: nothing consumed by a later task — this is a pure rendering-instruction change to a Markdown skill file, not code.

- [ ] **Step 1: Locate and update the annotation-lines section**

Find this text in `skills/backlog/overview-mode.md` (currently reads, right after the funnel-header template block):

```
Then at most **two annotation lines total**:

- The trust consequence line from Step 1.5, when any applicable cell verdict requires it (all
  non-clean cells collapsed into that single semicolon-separated line — the per-cell phrasing never
  multiplies lines). Nothing when clean.
- `parked {N} · not-planned {M} → /claude-tweaks:tidy owns these` — rendered from
  `.funnel.parked.length` / `.funnel.notPlanned.length`, only when either count is non-zero.
```

Replace it with:

```
Then at most **three annotation lines total**:

- The trust consequence line from Step 1.5, when any applicable cell verdict requires it (all
  non-clean cells collapsed into that single semicolon-separated line — the per-cell phrasing never
  multiplies lines). Nothing when clean.
- `parked {N} · not-planned {M} → /claude-tweaks:tidy owns these` — rendered from
  `.funnel.parked.length` / `.funnel.notPlanned.length`, only when either count is non-zero.
- `parents {N} → close-out via /claude-tweaks:wrap-up's verification brief / /claude-tweaks:demo, not /specify` —
  rendered from `.funnel.parents.length`, only when non-zero. A decomposition parent is never
  `ready` and is not agent-sized work (`_shared/work-record.md`'s Decomposition rules) — its
  close-out is the parent-gate path (`wrap-up/verification-brief.md`, backstopped by
  `/claude-tweaks:tidy`'s `Open parent gate` action) or `/claude-tweaks:demo`'s parent-close
  branch, never `/claude-tweaks:specify`.
```

- [ ] **Step 2: Update the "Every record appears exactly once" sentence's bucket list**

Directly below the annotation-lines section, find:

```
Every record appears exactly once across the header's populations (`funnelBuckets` is mutually
exclusive by construction) — never re-list a record in a second stage or an extra summary — the
`needs you` branch line is the deliberate exception: an overlay over the stages above, its members
counted twice by design.
```

This sentence already says "the header's populations" generically (no literal bucket-name list to update) — leave it unchanged. Verify by reading it fresh: confirm it does not enumerate `captured/scored/shaped/granted/dispatchable/inFlight/parked/notPlanned` anywhere that would now be stale. If it does enumerate them, update the list to include `parents`; if not (expected), no edit needed here — just confirm and move on.

- [ ] **Step 3: Verify the Shape block needs no separate change**

Read Step 4's Shape-block section (`skills/backlog/overview-mode.md`, the `── Shape next ──` template and the sentence "The Shape block's population is the `scored` bucket"). Confirm it sources from `.funnel.scored` (via the Step 3/4 candidate-set derivation) and not from a separately-filtered population. Since Task 1 already excludes `isParentIssue` records from `.funnel.scored`, no parent record can reach the Shape block's `/claude-tweaks:specify #{N}` line once Task 1 lands — this step is a read-only confirmation, not an edit. If the population turns out to be derived some other way (not directly from `.funnel.scored`), stop and flag it — this plan's assumption would be wrong and needs a fix, not a silent pass.

- [ ] **Step 4: Commit**

```bash
git add skills/backlog/overview-mode.md
git commit -m "Render parents annotation line in backlog overview funnel header

refs #616"
```

---

### Task 3: Verify refine-mode.md needs no change, and doc-comment the finding

**Files:**
- Modify: none (verification-only task) — if the grep below turns up a hit, stop and treat this as a plan-invalidating discovery rather than silently proceeding.

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Re-confirm `refineWorklist` never reads `facets.isParentIssue`**

```bash
grep -n "isParentIssue\|funnelBuckets" bin/lib/issues/backlog.js
```

Expected output: `isParentIssue` appears only inside `funnelBuckets` (the lines Task 1 just added/kept), never inside `refineWorklist` (defined further down in the same file, currently starting around line 237). `funnelBuckets` itself is never called from `refineWorklist`'s own body — confirm `refineWorklist`'s definition (`function refineWorklist({ allRows, readyRows = [], priorityBudget, grantBudget }) { ... }`) contains no reference to `funnelBuckets` or `isParentIssue`.

- [ ] **Step 2: Re-confirm `skills/backlog/refine-mode.md` doesn't independently reference `funnelBuckets` or parent-exclusion**

```bash
grep -n "funnelBuckets\|isParentIssue" skills/backlog/refine-mode.md
```

Expected output: no matches. `refine-mode.md`'s priority/Related worklist (Step 1's `refineWorklist` compute block, Step 2's priority/Related synthesis) operates on `missingPriority`/`missingRiskSize`/`fresh`/`blocked`/`inProgress` populations — none of which route through `funnelBuckets`'s stage buckets, and a parent record legitimately benefits from a `priority:*` suggestion or a `**Related:**` cross-reference the same as any other record. No code or doc change needed here.

- [ ] **Step 3: No commit** — this task is verification-only. If either grep in Step 1/2 surfaces a hit contradicting the expectation above, STOP: the plan's premise (deliverable 3 needs no change) is wrong, and this task must be re-scoped as a real code/doc change before Task 4 (Final Verification) runs. Do not paper over a surprising grep result.

---

### Task 4: Final verification

**Files:** none — verification only.

**Interfaces:** none.

- [ ] **Step 1: Run the full backlog test suite**

```bash
node --test tests/bin-lib/issues/
```

Expected: PASS, all files including `backlog.test.js`'s new/extended tests.

- [ ] **Step 2: Run the full project test suite**

```bash
npm test
```

Expected: PASS. If anything outside `tests/bin-lib/issues/` fails, investigate before considering this plan complete — a failure elsewhere in the suite is this plan's problem to explain (even if the root cause turns out to be unrelated flakiness from a concurrent session, per this project's own machine-load caveat), not something to wave past.

- [ ] **Step 3: Confirm the acceptance criteria**

- A parent record with `risk:*`/`size:*` labels is not in `scored`, `captured`, or any buildable bucket — confirmed by Task 1's Step 1 tests.
- The buckets still sum to the record total plus the parent count — confirmed by Task 1's extended sum-to-total test.
- No paste block in `overview-mode.md`'s bare-mode render names a parent with a `/claude-tweaks:specify` line — confirmed by Task 2's Step 3 read-through.

No commit for this task (nothing changes) — if all three checks pass, the plan is complete.
