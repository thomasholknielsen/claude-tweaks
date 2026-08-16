# Backlog Overview Needs-You Lane Implementation Plan (#516)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the dormant-safe Needs-you lane to bare overview: a `needsYou` overlay on `funnelBuckets`, the `└─ needs you: N` branch line, the `── Needs you ──` section with interactive launchers, Shape-block exclusion + batch annotation, and the menu-recommendation rule — plus parent #512's promise F2 (the executable-entry rule #515's residual ruling assigned here).

**Architecture:** `funnelBuckets` gains an overlay list `needsYou: [{id, kind}]` — buckets and populations byte-unchanged (true expand-only; the dormant regression pin enforces it). The skill text renders the lane from the overlay with a render-level join back to the faceted set. Both needs-facets (`needsDefinition`, `solutionUnjustified`) are read on their expected post-#471 key names with reconciliation markers; neither exists yet, so everything no-ops today.

**Tech Stack:** Node 18+ `node --test`; pure functions; markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T010024-spec-513-514-515-516/spec-516/work/516-spec.md`

## Global Constraints

- `funnelBuckets`' existing bucket keys AND populations unchanged — exclusivity and sum-to-total invariants hold exactly as #513's tests pin them; `needsYou` is an overlay, never a ninth stage.
- Do NOT wire `facets.framing` as an interim `solution:unjustified` source (different semantics — spec Gotcha). Read `facets.needsDefinition` / `facets.solutionUnjustified` on the expected key names; absent keys are falsy → dormant.
- `definition` wins when both facets are present — one `needsYou` entry per record.
- Fully-qualified `/claude-tweaks:` commands in all launcher text.
- Commit messages: `{Verb} {what} — {detail}` imperative, `refs #516` (never closes/fixes).
- Scope note (add-to-plan, same ruling as #515's): the menu-recommendation rule requires edits in `skills/backlog/SKILL.md`'s After-`overview` block (a "Decide the top Needs-you item" option must exist for `(Recommended)` to attach to), and promise F2 (parent #512) explicitly assigns the executable-entry fixes to this record's Next-Actions edit — both are in-plan despite the spec's Key Files omitting SKILL.md.

---

### Task 1: `needsYou` overlay in `funnelBuckets`

**Files:**
- Modify: `bin/lib/issues/backlog.js`
- Test: `tests/bin-lib/issues/backlog.test.js`

**Interfaces:**
- Produces: `funnelBuckets(records)` return value gains `needsYou: [{id, kind: 'definition'|'unjustified'}]`; every other key and population unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/issues/backlog.test.js`'s funnelBuckets group (reuse `rec()`):

```js
test('funnelBuckets: dormant regression pin — no needs-facets leaves every bucket byte-identical and needsYou empty', () => {
  const records = [
    rec(1, { bot: { inProgress: true, blocked: false } }),
    rec(2, { stage: 'parked' }),
    rec(3, { stage: 'ready', grants: { build: true, merge: false } }),
    rec(4, { priority: 'high' }),
    rec(5),
  ];
  const b = funnelBuckets(records);
  assert.deepEqual(b.needsYou, []);
  assert.deepEqual(b.inFlight.map((r) => r.number), [1]);
  assert.deepEqual(b.parked.map((r) => r.number), [2]);
  assert.deepEqual(b.dispatchable.map((r) => r.number), [3]);
  assert.deepEqual(b.scored.map((r) => r.number), [4]);
  assert.deepEqual(b.captured.map((r) => r.number), [5]);
  assert.deepEqual(b.granted, []);
  assert.deepEqual(b.shaped, []);
  assert.deepEqual(b.notPlanned, []);
});

test('funnelBuckets: needs:definition record joins needsYou AND keeps its primary stage bucket (overlay semantics)', () => {
  const records = [
    rec(1, { needsDefinition: true }),
    rec(2, { stage: 'ready' }),
  ];
  const b = funnelBuckets(records);
  assert.deepEqual(b.needsYou, [{ id: 1, kind: 'definition' }]);
  assert.deepEqual(b.captured.map((r) => r.number), [1]);
  assert.deepEqual(b.shaped.map((r) => r.number), [2]);
});

// Reads the expected post-#471-rename key (solutionUnjustified) — reconciliation
// marker: if #471 ships a different key this test's fixture goes stale loudly.
test('funnelBuckets: solutionUnjustified facet (expected #471 key) joins needsYou as kind unjustified', () => {
  const b = funnelBuckets([rec(1, { solutionUnjustified: true, priority: 'low' })]);
  assert.deepEqual(b.needsYou, [{ id: 1, kind: 'unjustified' }]);
  assert.deepEqual(b.scored.map((r) => r.number), [1]);
});

// Both facets present: the hard gate dominates — one entry, kind definition (#471).
test('funnelBuckets: both needs-facets yield exactly one needsYou entry with kind definition (#471 precedence)', () => {
  const b = funnelBuckets([rec(1, { needsDefinition: true, solutionUnjustified: true })]);
  assert.deepEqual(b.needsYou, [{ id: 1, kind: 'definition' }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: FAIL — `needsYou` is `undefined`.

- [ ] **Step 3: Implement**

In `funnelBuckets`, add the overlay (after the main loop, before `return`):

```js
  // needsYou is an OVERLAY, never a ninth stage: every record above keeps its
  // one primary bucket (exclusivity and sum-to-total invariants untouched).
  // Both facet keys are the EXPECTED post-#471 names — needsDefinition (#472's
  // parser) and solutionUnjustified (#471's framing:baked rename). Neither
  // exists on this repo yet, so this list is empty (dormant) until they land;
  // if #471 ships a different key, this comment and the #471-citing tests are
  // the reconciliation tripwire. A record carrying both facets yields one
  // entry with kind 'definition' — the hard gate dominates. needs:definition
  // exclusion from the Shape paste block happens at RENDER, never here.
  const needsYou = [];
  for (const r of records) {
    const f = r.facets;
    if (f.needsDefinition === true) needsYou.push({ id: r.number ?? r.id, kind: 'definition' });
    else if (f.solutionUnjustified === true) needsYou.push({ id: r.number ?? r.id, kind: 'unjustified' });
  }
  buckets.needsYou = needsYou;
```

(Adapt to the function's actual return style — if it returns an object literal, add the computed `needsYou` to it.) Update the function's header comment: return shape gains the overlay.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/backlog.test.js tests/bin-lib/issues/ranking.test.js`
Expected: PASS — including every pre-existing funnelBuckets case unchanged.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/backlog.js tests/bin-lib/issues/backlog.test.js
git commit -m "Add dormant-safe needsYou overlay to funnelBuckets — refs #516"
```

---

### Task 2: Needs-you lane in `overview-mode.md` + menu rule + promise F2 in `SKILL.md`

**Files:**
- Modify: `skills/backlog/overview-mode.md` (branch line, Needs-you section, emitter integration, Next:/two-channel updates)
- Modify: `skills/backlog/SKILL.md` (After-`overview` menu: needs-you option + F2 executable-entry fixes)

- [ ] **Step 1: Funnel header branch line (Step 2 bare-mode template)**

Beneath the funnel header's per-stage lines, add the conditional branch line — rendered only when `needsYou` is non-empty:

```
└─ needs you: {needsYou.length}
```

with one sentence: fed from `funnelBuckets`' `needsYou` overlay; omitted entirely at zero (dormant-safe — on a repo without the needs-label family the line never renders).

- [ ] **Step 2: The `── Needs you ──` section (new subsection at the end of Step 4, stated as rendering LAST before Next Actions)**

Add a `### Needs you (human lane)` subsection stating exactly:

- Rendered **last before Next Actions** (the terminal's most prominent position), only when `needsYou` is non-empty. These are the records the batch emitter structurally cannot schedule — the funnel's bottleneck; paste blocks send agents to work, this lane is the work only the human can do.
- One line per record with an interactive launcher, fully qualified:
  - `kind: 'definition'` → `/claude-tweaks:specify #{N}` with a `#`-comment naming the label, waiting-age, and what deciding it releases (e.g. `# needs:definition — waiting {age}; deciding releases {k} records`)
  - `kind: 'unjustified'` → `/claude-tweaks:challenge #{N}` with a `#`-comment naming the one-line call (e.g. `# solution:unjustified — one-line evidence-or-accept-risk call`)
- **Ordering + inputs:** `needsYou` stays `{id, kind}`; the render joins each id back to the faceted record set for `facets.priority` and `createdAt` (already in the overview fetch), and reads releases-count from `transitiveUnblocksCount` (#515's pinned helper) computed over the union of the emitter candidates and the joined needs-you records — sort by releases desc, then priority, then age (oldest first). This join is render-level by design: duplicating rank inputs into the bucket tuple would create a second copy of facet data to drift.
- At most 3 rows named; beyond that, one pointer line: `{M} more human-owed records → /claude-tweaks:backlog attention (when available)` — advisory until that mode ships (#471's decomposition), count always shown.
- **Interim-launcher honesty note, citing #471:** until #471's redirect gate ships, `/claude-tweaks:specify #{N}` on a `needs:definition` record still lands in ordinary shaping mode — acceptable interim (the human is present either way); this caveat is removed by #471's own landing.

- [ ] **Step 3: Emitter integration (Step 4 edits)**

- Shape block exclusion, verbatim comment format (satisfies rule (c)): `# #N excluded — needs:definition: yours to decide (see Needs you below)`
- Batch annotation: `solution:unjustified` records appearing in any batch carry `# ⚠ solution:unjustified — one-line evidence call pending`
- **`Next:` + `(Recommended)` precedence (composes with the MUST, and lands promise F2):** update the `Next:` line definition to this precedence, stated once:
  1. When `needsYou` is non-empty → the `Next:` line names the top Needs-you item (per the section's ordering), recomputed fresh every run — no session state, no stored binding.
  2. Otherwise → the top-ranked **executable** Dispatch entry — comment-only entries (out-of-set-blocked, cyclic, unsynced, flagged, overlap-excluded) are skipped when determining it (promise F2, parent #512: the `Next:` guarantee is one *actionable* sentence).
  3. When the Dispatch block contains **no executable entry** (empty, or comment-only entries throughout) → the existing fallback ladder (grant → specify → refine, ties by id; `Next: backlog is empty` terminal case).
  The menu's `(Recommended)` option MUST match the `Next:` line at every precedence level — unchanged rule, now with a well-defined referent at each level.

- [ ] **Step 4: `skills/backlog/SKILL.md` After-`overview` menu**

- Add an option: `label`: `"Decide the top Needs-you item"`, `description`: `"{the top item's launcher — /claude-tweaks:specify #N or /claude-tweaks:challenge #N} — the one move only the human can make"` — omitted when `needsYou` is empty.
- Update the "Dispatch the top chain here" option's omit condition to: omitted when the Dispatch block contains no executable entry (not merely when empty) — promise F2's second half.
- The computed-`(Recommended)` MUST sentence stays; it now resolves through the three-level precedence above (needs-you first).

- [ ] **Step 5: Verify by grep**

```bash
grep -c "needs you:" skills/backlog/overview-mode.md
grep -c "── Needs you ──\|Needs you (human lane)" skills/backlog/overview-mode.md
grep -c "claude-tweaks:challenge" skills/backlog/overview-mode.md
grep -ci "last before Next Actions" skills/backlog/overview-mode.md
grep -ci "when available" skills/backlog/overview-mode.md
grep -ci "yours to decide" skills/backlog/overview-mode.md
grep -ci "one-line evidence call pending" skills/backlog/overview-mode.md
grep -ci "executable" skills/backlog/overview-mode.md
grep -ci "Decide the top Needs-you item" skills/backlog/SKILL.md
grep -ci "no executable entry" skills/backlog/SKILL.md skills/backlog/overview-mode.md
grep -ci "releases desc\|releases-count\|releases {k}" skills/backlog/overview-mode.md
grep -c "471" skills/backlog/overview-mode.md
```

Every grep must hit.

- [ ] **Step 6: Commit**

```bash
git add skills/backlog/overview-mode.md skills/backlog/SKILL.md
git commit -m "Add needs-you lane, launcher section, and executable-entry Next precedence — refs #516"
```

---

### Task 3: Promise F2 satisfaction bookkeeping

**Files:** none in-repo (parent-issue bookkeeping at review time — this task only records the evidence pointer)

- [ ] **Step 1:** Note in your report that Task 2's Step 3-4 edits are the F2 evidence; the controller marks F2 SATISFIED on parent #512 at the review step (same flow as F1). No repo change.

---

### Task 4: Revert-discrimination + suites (AC 6)

**Files:** transient revert of `bin/lib/issues/backlog.js`

- [ ] **Step 1:** Identify backlog.js's last pre-Task-1 commit (`git log --oneline -3 -- bin/lib/issues/backlog.js`). Revert only that file to it, run `node --test tests/bin-lib/issues/backlog.test.js` — expect the four new needsYou tests to FAIL (the check passing). Restore with `git checkout HEAD -- bin/lib/issues/backlog.js`, re-run — expect PASS. Never stash; never commit the reverted state; a harness "modified externally" reminder after checkout is its own side effect.

- [ ] **Step 2:** Run `node --test tests/bin-lib/issues/*.test.js` — expect PASS. End with `git status --short` clean.

- [ ] **Step 3:** No commit (verification only).
