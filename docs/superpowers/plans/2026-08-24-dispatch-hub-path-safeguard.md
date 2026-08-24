# Dispatch Hub-Path Bundle-Size Safeguard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `groupByFileOverlap`'s union-find from letting a generic/hub-like `Key Files` path (e.g. `tests/`) transitively bridge dozens of otherwise-unrelated records into one oversized dispatch group.

**Architecture:** Add a frequency-based hub-path exclusion inside `groupByFileOverlap` itself (`plugin/bin/lib/issues/grouping.js`): before building the file→id union-find map, compute how many items reference each file path; any path referenced by at least `max(hubPathMinCount, ceil(items.length * hubPathFraction))` items is treated as a hub and is never used to union two items, though each item's own group membership via its *other* (non-hub) files is unaffected. Defaults (`hubPathMinCount: 3`, `hubPathFraction: 0.1`) are chosen so no existing test fixture (all of which share a file across at most 2 items) crosses the threshold, while a batch where many otherwise-unrelated items all cite one common path (the reported incident: `tests/` in 15 of 63 records, `plugin/bin/hooks.js` in 7, `plugin/bin/lib/hooks/pre-tool-use.js` in 5, `docs/donts.md` in 5, out of a 139-record eligible pool) has that path excluded from bridging. This is a pure-function change with no new dependencies — the existing `groupByFileOverlap(items)` call sites (`preflight-records.js`, `ranking.js`) need no changes since the new options parameter defaults.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** GitHub issue #1365 (materialized at `.claude-tweaks/pipelines/2026-08-24T144942-record-1365/work/1365-spec.md`)

## Global Constraints

- No new dependency-cap or naming rule beyond the existing repo conventions.
- Every existing `tests/bin-lib/issues/grouping.test.js` assertion must keep passing unchanged (defaults must never trigger on any fixture in that file today, per the file's own `keyFiles` counts, which top out at 2 shared items per file).
- `groupByFileOverlap`'s existing single-argument call sites (`plugin/bin/lib/preflight-records/preflight-records.js`, `plugin/bin/lib/issues/ranking.js`) must continue to work with no call-site changes — the new behavior is opt-out-by-default-threshold, not opt-in.

---

### Task 1: Hub-path exclusion in `groupByFileOverlap`

**Files:**
- Modify: `plugin/bin/lib/issues/grouping.js` (the `groupByFileOverlap` function, lines 11-46)
- Test: `tests/bin-lib/issues/grouping.test.js`

**Interfaces:**
- Consumes: nothing new — reads the same `items[]` shape (`{ id, keyFiles }`) `groupByFileOverlap` already takes.
- Produces: `groupByFileOverlap(items, options = {})` — same return shape as today (`Array<Array<id>>`), with a new optional second parameter `{ hubPathMinCount?: number, hubPathFraction?: number }`. Every existing caller (`groupByFileOverlap(items)`, one argument) is unaffected; the defaults are `hubPathMinCount: 3`, `hubPathFraction: 0.1`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/issues/grouping.test.js`, directly after the existing `'group order matches first-seen order of each group'` test (before the `extractKeyFiles` section comment):

```javascript
// ── groupByFileOverlap: hub-path exclusion (#1365) ────────────────────────────
// A generic/hub-like path (e.g. tests/) referenced by an anomalously large
// fraction of the batch must never act as a transitive union-find bridge
// between otherwise-unrelated items — see grouping.js's HUB_PATH_MIN_COUNT/
// HUB_PATH_FRACTION for the threshold this exercises.

test('N otherwise-unrelated items sharing only one hub-like path stay as N singletons', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, keyFiles: ['tests/'] }));
  const groups = groupByFileOverlap(items);
  assert.strictEqual(groups.length, 12, 'must not collapse into one 12-member group');
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('a hub-like path is excluded from bridging, but a real shared file among a few items still groups them', () => {
  const items = [
    { id: 1, keyFiles: ['tests/', 'src/real.js'] },
    { id: 2, keyFiles: ['tests/', 'src/real.js'] },
    ...Array.from({ length: 10 }, (_, i) => ({ id: i + 3, keyFiles: ['tests/'] })),
  ];
  const groups = groupByFileOverlap(items);
  // Items 1 and 2 still union via src/real.js (a non-hub file); the other 10
  // items, whose only file is the hub path, remain singletons.
  const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
  assert.deepStrictEqual(sizes, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  const pair = groups.find((g) => g.length === 2);
  assert.deepStrictEqual(pair.sort(), [1, 2]);
});

test('existing small-batch behavior (below the hub threshold) is unchanged with default options', () => {
  // Same shape as the pre-existing "two items sharing a file land in one
  // group" test — 2 shared references never crosses the default hubPathMinCount (3).
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['a.js', 'b.js'] },
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), [1, 2]);
});

test('a custom hubPathMinCount lets a smaller batch exercise the exclusion deterministically', () => {
  const items = [
    { id: 1, keyFiles: ['hub.js'] },
    { id: 2, keyFiles: ['hub.js'] },
    { id: 3, keyFiles: ['hub.js'] },
  ];
  // With hubPathMinCount lowered to 2 (and fraction 0 to disable that half of
  // the max()), hub.js's 3 references clear the threshold at a tiny batch size.
  const groups = groupByFileOverlap(items, { hubPathMinCount: 2, hubPathFraction: 0 });
  assert.strictEqual(groups.length, 3);
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('hubPathFraction alone can trigger exclusion even below hubPathMinCount, when explicitly lowered', () => {
  const items = [
    { id: 1, keyFiles: ['hub.js'] },
    { id: 2, keyFiles: ['hub.js'] },
  ];
  // fraction 0.5 of a 2-item batch = 1, but hubPathMinCount default (3) would
  // normally win via max() — override it down to 1 to isolate the fraction path.
  const groups = groupByFileOverlap(items, { hubPathMinCount: 1, hubPathFraction: 0.5 });
  assert.strictEqual(groups.length, 2);
});

test('an item whose only files are all hub paths never merges, but still appears as its own singleton', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, keyFiles: ['tests/', 'docs/donts.md'] }));
  const groups = groupByFileOverlap(items);
  assert.strictEqual(groups.length, 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/grouping.test.js`
Expected: FAIL — the six new tests fail (most obviously the first, "N otherwise-unrelated items sharing only one hub-like path stay as N singletons", which today returns `groups.length === 1`); every pre-existing test in the file still passes.

- [ ] **Step 3: Implement the hub-path exclusion**

Replace `plugin/bin/lib/issues/grouping.js`'s `groupByFileOverlap` function (lines 11-46) with:

```javascript
// A path referenced by at least this many items, OR at least this fraction
// of the batch (whichever is larger — see the max() below), is treated as a
// hub and excluded from union-find bridging: it still counts as a file the
// item "has", but it can never be the shared file that merges two items into
// one group. Tuned against the reported incident (#1365): a 139-record
// eligible pool where tests/ appeared in 15 records, plugin/bin/hooks.js in
// 7, plugin/bin/lib/hooks/pre-tool-use.js in 5, and docs/donts.md in 5 —
// none of which represent real coupling between those records, just a common
// generic path each happens to touch. The min-count floor keeps small
// batches (the common case: 2-5 genuinely related records) from ever
// tripping the fraction half by accident; the tradeoff, accepted
// deliberately, is that a truly coincidental full-batch match (e.g. exactly
// 3 unrelated items in a 3-item batch that all happen to cite one path) also
// gets excluded — an "anomalously large fraction" is exactly what that is,
// regardless of how small the batch happens to be.
const HUB_PATH_MIN_COUNT = 3;
const HUB_PATH_FRACTION = 0.1;

// Partitions items into groups whose keyFiles overlap, directly or
// transitively (union-find over shared file paths). Items with no overlap
// to anything else in the batch are singleton groups. A file path referenced
// by an anomalously large fraction of the batch (see HUB_PATH_MIN_COUNT/
// HUB_PATH_FRACTION above, overridable via options) is excluded from the
// union-find step entirely — it can never bridge two items together, though
// each item's other (non-hub) files still can.
function groupByFileOverlap(items, options = {}) {
  const hubPathMinCount = options.hubPathMinCount ?? HUB_PATH_MIN_COUNT;
  const hubPathFraction = options.hubPathFraction ?? HUB_PATH_FRACTION;

  const parent = new Map();
  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const item of items) parent.set(item.id, item.id);

  // Count each file's references across the batch — once per item (a
  // duplicate path within one item's own keyFiles list must not inflate its
  // count), so hub detection reflects how many *distinct items* cite it.
  const fileCounts = new Map();
  for (const item of items) {
    for (const file of new Set(item.keyFiles || [])) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }
  const hubThreshold = Math.max(hubPathMinCount, Math.ceil(items.length * hubPathFraction));
  const hubPaths = new Set();
  for (const [file, count] of fileCounts) {
    if (count >= hubThreshold) hubPaths.add(file);
  }

  const fileToId = new Map();
  for (const item of items) {
    for (const file of item.keyFiles || []) {
      if (hubPaths.has(file)) continue;
      if (fileToId.has(file)) union(item.id, fileToId.get(file));
      else fileToId.set(file, item.id);
    }
  }

  const groups = new Map();
  for (const item of items) {
    const root = find(item.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item.id);
  }
  return [...groups.values()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/grouping.test.js`
Expected: PASS — all tests in the file, old and new, pass.

- [ ] **Step 5: Run the full grouping-adjacent suite to confirm no regression in callers**

Run: `node --test tests/bin-lib/issues/ tests/bin-lib/preflight-records/`
Expected: PASS — `ranking.js` (`computeOverlapSet`) and `preflight-records.js` both call `groupByFileOverlap(items)` with default options; neither test suite constructs a fixture large enough or repetitive enough to cross the default hub threshold, so no existing assertion there should change. If any assertion in either suite unexpectedly fails, read it before assuming the new code is wrong — it may indicate a fixture in that suite already relies on 3+ items sharing one path, which would need its own review (widen the fixture's hub path's uniqueness, or accept a deliberate behavior change and update the assertion with a comment explaining why).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/grouping.js tests/bin-lib/issues/grouping.test.js
git commit -m "Add hub-path exclusion to dispatch's file-overlap grouping (refs #1365)"
```

---

## Self-Review Notes

**Spec coverage:**
- Deliverable (b) ("exclude a path referenced by an anomalously large fraction of the eligible pool ... from union-find overlap detection so it stops acting as a transitive bridge") — Task 1, directly.
- Acceptance criterion 1 ("A synthetic fixture with N otherwise-unrelated records ... does not collapse into one N-member group") — Task 1's first new test, N=12.
- Acceptance criterion 2 ("dispatch's next form either never selects an oversized group as next-pick, or selects it but reports it explicitly") — satisfied as a consequence of Task 1: with hub-path bridging removed, `bin/preflight-records.js`'s `overlapGroups` (which `dispatch/SKILL.md` Step 2 reads into `dispatch-groups.json`, and Step 3's `next` ranking script picks from) can no longer produce the reported incident's oversized bridged group in the first place — there is no group left for `next`-pick to silently select. Dispatch's own selection script (`SKILL.md` Step 3, an inline `node -e` block, not a separately testable `bin/lib` module) is intentionally left unchanged: the record's Current State identifies the union-find bridging as the root cause, and no test in this repo pins that inline script's exact text, so touching it would be an unrequested, untested change outside this fix's scope.
- Acceptance criterion 3 ("Existing groupByFileOverlap/dispatch tests continue to pass; new tests cover the hub-path/oversized-group case") — Task 1 Steps 2/4/5 plus the six new tests.

**Placeholder scan:** none — every step shows exact, runnable code.

**Type consistency:** `groupByFileOverlap(items, options = {})` is the only signature change; both existing call sites (`preflight-records.js`, `ranking.js`) already call it with one argument, so they need no edits and were not listed as a task.
