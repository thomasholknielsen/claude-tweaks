# Backlog Overview Funnel Header Implementation Plan (#513)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/claude-tweaks:backlog overview`'s bare mode into a funnel decision surface backed by a new pure `funnelBuckets` function, demoting the three lens tables and the full trust table to explicit lenses.

**Architecture:** A new pure `funnelBuckets(records)` in `bin/lib/issues/backlog.js` partitions the post-merge faceted record set into eight mutually exclusive buckets (first-match-wins precedence). The skill text (`skills/backlog/overview-mode.md`) consumes it for the bare-mode funnel header, collapses trust rendering to a single consequence line, and adds a `trust` lens. One upstream gap is fixed at the source: `parseRecordFacets` has no not-planned facet today, so a `notPlanned` key (parsed from the existing `wontfix` label) is added to the shared facet shape — expand-only, default `false`.

**Tech Stack:** Node 18+ built-in `node --test`; pure functions, no I/O; markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T010024-spec-513-514-515-516/spec-513/work/513-spec.md`

## Global Constraints

- Every function added to `bin/lib/issues/backlog.js` is pure — no network, no fs (module's own header contract).
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md cross-reference rule).
- `skills/_shared/trust-table.md` may change **only** in its framing-note consumer pointer — the Render contract stays byte-identical (spec AC 3).
- Do not touch `ranking.js`, `grant-mode.md`, `refine-mode.md`, or `help/status-scan.md` (spec Non-Goals).
- Commit messages: `{Verb} {what} — {detail}`, imperative, with `refs #513` (never `closes`/`fixes`).
- Scope note (logged as scope-creep add-to-plan): `bin/lib/issues/facet-shape.js` and `bin/lib/issues/record.js` are outside the spec's Key Files but are modified by Task 1 — the spec's bucket 3 requires a not-planned facet that `parseRecordFacets` does not expose today; adding it at the source is the fail-loud resolution of that spec gap.

---

### Task 1: `notPlanned` shared facet (parsed from `wontfix`)

**Files:**
- Modify: `bin/lib/issues/facet-shape.js` (add `notPlanned: false` to `sharedFacetDefaults()`)
- Modify: `bin/lib/issues/record.js` (parse `LABELS.WONTFIX` → `facets.notPlanned = true` in `parseRecordFacets`)
- Test: `tests/bin-lib/issues/record.test.js` (new cases; also check `tests/bin-lib/issues/facet-shape.test.js` — if it pins the exact default-key set, add the new key there)

**Interfaces:**
- Produces: `facets.notPlanned: boolean` on every faceted record (default `false`; `true` when the record carries the `wontfix` label). Task 2's `funnelBuckets` reads exactly this key.

- [ ] **Step 1: Write the failing test**

In `tests/bin-lib/issues/record.test.js`, next to the existing `parseRecordFacets` cases, add:

```js
test('parseRecordFacets: wontfix label sets notPlanned', () => {
  const facets = parseRecordFacets(['wontfix']);
  assert.equal(facets.notPlanned, true);
});

test('parseRecordFacets: notPlanned defaults to false', () => {
  const facets = parseRecordFacets(['ready']);
  assert.equal(facets.notPlanned, false);
});
```

(Match the file's existing import style and assertion helpers — read the top of the file first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/record.test.js`
Expected: FAIL — `notPlanned` is `undefined`, not `true`/`false`.

- [ ] **Step 3: Implement**

In `bin/lib/issues/facet-shape.js`, add to the returned object of `sharedFacetDefaults()` (after `isParentIssue: false`):

```js
    notPlanned: false,
```

Also extend the file's header comment's shared-key rationale by one clause if it enumerates keys (it does not — only extend the code).

In `bin/lib/issues/record.js`'s `parseRecordFacets` label loop, add (next to the other `LABELS.*` checks, e.g. after the `BOT_BLOCKED` branch):

```js
    if (name === LABELS.WONTFIX) {
      facets.notPlanned = true;
      continue;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/record.test.js tests/bin-lib/issues/facet-shape.test.js tests/bin-lib/issues/local-store.test.js`
Expected: PASS. If `facet-shape.test.js` or `local-store.test.js` fail on a pinned key set, extend their expected shapes with `notPlanned: false` — that loud failure is the facet-shape contract working as designed.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/facet-shape.js bin/lib/issues/record.js tests/bin-lib/issues/record.test.js tests/bin-lib/issues/facet-shape.test.js tests/bin-lib/issues/local-store.test.js
git commit -m "Add notPlanned shared facet parsed from wontfix label — refs #513"
```

(Only add the test files actually modified.)

---

### Task 2: `funnelBuckets` in `bin/lib/issues/backlog.js`

**Files:**
- Modify: `bin/lib/issues/backlog.js` (new export `funnelBuckets`)
- Test: `tests/bin-lib/issues/backlog.test.js`

**Interfaces:**
- Consumes: `facets.bot.inProgress`, `facets.stage`, `facets.notPlanned` (Task 1), `facets.grants.build/.merge`, `facets.priority/.risk/.size`; optional `record.blockedBy: number[]` (absent until #514 lands).
- Produces: `funnelBuckets(records) -> { captured, scored, shaped, granted, dispatchable, inFlight, parked, notPlanned }` — arrays of the input records, mutually exclusive, first match wins.

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/issues/backlog.test.js` (read the file's existing fixture helpers first and reuse its record-building style), add a `describe`/`test` group:

```js
// Minimal faceted-record builder for funnelBuckets cases. Mirrors
// sharedFacetDefaults()'s shape — keys funnelBuckets reads are explicit.
function rec(number, facetOverrides = {}, extra = {}) {
  return {
    number,
    facets: {
      origin: null, risk: null, size: null, ceremony: null, framing: false,
      priority: null, stage: 'backlog',
      grants: { build: false, merge: false },
      bot: { inProgress: false, blocked: false },
      acceptance: null, isParentIssue: false, notPlanned: false,
      ...facetOverrides,
    },
    ...extra,
  };
}

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
  ];
  const b = funnelBuckets(records);
  const all = [...b.captured, ...b.scored, ...b.shaped, ...b.granted, ...b.dispatchable, ...b.inFlight, ...b.parked, ...b.notPlanned];
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
});

test('funnelBuckets: empty input yields eight empty buckets', () => {
  const b = funnelBuckets([]);
  for (const key of ['captured', 'scored', 'shaped', 'granted', 'dispatchable', 'inFlight', 'parked', 'notPlanned']) {
    assert.deepEqual(b[key], []);
  }
});

// Adjacent-precedence pins (spec Deliverables): bot-state outranks stage labels;
// granted outranks dispatchable.
test('funnelBuckets precedence: bot:in-progress + parked resolves to inFlight', () => {
  const b = funnelBuckets([rec(1, { stage: 'parked', bot: { inProgress: true, blocked: false } })]);
  assert.deepEqual(b.inFlight.map((r) => r.number), [1]);
  assert.deepEqual(b.parked, []);
});

test('funnelBuckets precedence: bot:in-progress + ready + grant resolves to inFlight', () => {
  const b = funnelBuckets([rec(1, { stage: 'ready', grants: { build: true, merge: false }, bot: { inProgress: true, blocked: false } })]);
  assert.deepEqual(b.inFlight.map((r) => r.number), [1]);
  assert.deepEqual(b.dispatchable, []);
});

test('funnelBuckets precedence: ready + grant + non-empty in-set blockedBy is granted, not dispatchable', () => {
  const records = [
    rec(1, { stage: 'ready', grants: { build: true, merge: false } }, { blockedBy: [2] }),
    rec(2, { stage: 'ready', grants: { build: false, merge: true } }),
  ];
  const b = funnelBuckets(records);
  assert.deepEqual(b.granted.map((r) => r.number), [1]);
  assert.deepEqual(b.dispatchable.map((r) => r.number), [2]);
});

test('funnelBuckets: blockedBy ids outside the open input set do not demote to granted', () => {
  const b = funnelBuckets([rec(1, { stage: 'ready', grants: { build: true, merge: false } }, { blockedBy: [999] })]);
  assert.deepEqual(b.dispatchable.map((r) => r.number), [1]);
  assert.deepEqual(b.granted, []);
});

test('funnelBuckets: blockedBy absent means every granted record is dispatchable (pre-#514 dormancy)', () => {
  const b = funnelBuckets([rec(1, { stage: 'ready', grants: { build: true, merge: true } })]);
  assert.deepEqual(b.dispatchable.map((r) => r.number), [1]);
  assert.deepEqual(b.granted, []);
});

test('funnelBuckets: scored means any of priority/risk/size without ready stage', () => {
  const b = funnelBuckets([rec(1, { risk: 'low' }), rec(2, { size: 'medium' }), rec(3, { priority: 'low' }), rec(4)]);
  assert.deepEqual(b.scored.map((r) => r.number), [1, 2, 3]);
  assert.deepEqual(b.captured.map((r) => r.number), [4]);
});
```

Import `funnelBuckets` alongside the file's existing `backlog.js` imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: FAIL — `funnelBuckets` is not a function / not exported.

- [ ] **Step 3: Implement `funnelBuckets`**

In `bin/lib/issues/backlog.js`, after `mergeUnsyncedRecords`:

```js
// records[] -> { captured, scored, shaped, granted, dispatchable, inFlight,
// parked, notPlanned }. Mutually exclusive buckets over the post-merge faceted
// set (github + unsynced) — the funnel decision surface /claude-tweaks:backlog
// overview's bare mode renders. First match wins, in this order; the precedence
// rationale: bot-state outranks stage labels because live work reflects current
// reality (a record simultaneously bot:in-progress and parked/ready resolves
// toward what is actually happening right now), and granted is checked before
// dispatchable so a blocked grant can never render as go-now. `blockedBy` is an
// optional number[] attached upstream (absent until the native blocked-by
// resolution ships — #514); only ids within the open input set count as
// blockers, since an out-of-set blocker cannot be acted on from this report.
function funnelBuckets(records) {
  const buckets = {
    captured: [], scored: [], shaped: [], granted: [],
    dispatchable: [], inFlight: [], parked: [], notPlanned: [],
  };
  const openIds = new Set(records.map((r) => r.number ?? r.id).filter((n) => n != null));
  for (const r of records) {
    const f = r.facets;
    const granted = f.grants.build || f.grants.merge;
    const inSetBlockers = Array.isArray(r.blockedBy)
      ? r.blockedBy.filter((id) => openIds.has(id))
      : [];
    if (f.bot.inProgress) buckets.inFlight.push(r);
    else if (f.stage === 'parked') buckets.parked.push(r);
    else if (f.notPlanned) buckets.notPlanned.push(r);
    else if (f.stage === 'ready' && granted && inSetBlockers.length > 0) buckets.granted.push(r);
    else if (f.stage === 'ready' && granted) buckets.dispatchable.push(r);
    else if (f.stage === 'ready') buckets.shaped.push(r);
    else if (f.priority || f.risk || f.size) buckets.scored.push(r);
    else buckets.captured.push(r);
  }
  return buckets;
}
```

Add `funnelBuckets` to `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: PASS (all new cases plus every pre-existing case in the file).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/backlog.js tests/bin-lib/issues/backlog.test.js
git commit -m "Add pure funnelBuckets partitioning faceted records into eight funnel stages — refs #513"
```

---

### Task 3: Rewrite `overview-mode.md` bare mode (funnel header, consequence-line trust, `trust` lens, narration rule)

**Files:**
- Modify: `skills/backlog/overview-mode.md` (Step 1.5, Step 2, Step 3 buildable-subset wording; new narration rule)
- Modify: `skills/_shared/trust-table.md` (framing-note consumer pointer only)

**Interfaces:**
- Consumes: `funnelBuckets` (Task 2), trust verdict vocabulary from `bin/lib/issues/trust.js` (`clean` / `mixed` / `insufficient-evidence`).
- Produces: the rewritten bare-mode render contract Tasks in #515/#516 later anchor to (funnel header block, annotation lines, `trust` lens heading).

- [ ] **Step 1: Rewrite `## Step 1.5` in `skills/backlog/overview-mode.md`**

Replace the current Step 1.5 body (keep the heading and the local-files omission note) with text that states exactly:

- The trust fetch/computation still runs **once per invocation**, independent of which lens (or none) was requested, per `_shared/trust-table.md`'s Fetch section verbatim (including its `work-links` resolution sub-section) — unchanged from before.
- **Bare mode renders only a single collapsed consequence line**, never the table: one line, all non-clean cells folded in semicolon-separated, e.g. `trust: clean, except human:human|low (mixed) → merges below stay PR-gated`. The consequence line renders for cells whose verdict is neither `clean` nor `insufficient-evidence` (with `trust.js`'s current vocabulary that means exactly the `mixed` cells). When no cell's verdict requires it, render **nothing at all** — no "trust: clean" line. `insufficient-evidence` cells render nothing in bare mode — their table is one lens away.
- The verdict vocabulary is read verbatim from `bin/lib/issues/trust.js`'s row verdicts as `_shared/trust-table.md` defines them — nothing new is invented here.
- The full table render moves to the `trust` lens (Step 2).

- [ ] **Step 2: Rewrite `## Step 2` (bare mode = funnel header; lenses keep full renders; add `trust` lens)**

Keep the existing Step 2 compute block and the `critical` / `risk-value` / `cleanup` lens paragraphs (their full renders and skip-to-Step-4 routing are unchanged). Make these changes:

1. Extend the compute block's `node -e` script with `funnel: bl.funnelBuckets(all),` in the emitted JSON object.
2. Add a **`trust`** lens paragraph: renders the full trust table per `_shared/trust-table.md`'s Render section verbatim (uncapped — that contract's "never cap or truncate the row count" rule applies unchanged), using the computation Step 1.5 already ran. Skip to Step 4. Under `work-backend: local-files` the lens reports that the trust table is not applicable (same omission rationale as Step 1.5).
3. Replace the **Bare (no lens)** paragraph with the funnel render:

````markdown
**Bare (no lens)** — render the funnel header from `.funnel` (`funnelBuckets` output), then continue to Step 3. The header is populations + verbs only — **no record ids, and no Critical/Risk-Value/Cleanup tables** (those remain one lens away). Template:

```
captured ▶ scored ▶ shaped ▶ granted ▶ dispatchable ▶ in flight
  {captured.length}   {scored.length}   {shaped.length}   {granted.length}   {dispatchable.length}   {inFlight.length}

captured      {n} → /claude-tweaks:backlog refine (score them)
scored        {n} → /claude-tweaks:specify #N (shape them)
shaped        {n} → /claude-tweaks:backlog grant (or dispatch here with the human gate)
granted       {n}   (no pointer — waiting on blockers; the blocker itself appears in the dispatch hand-off)
dispatchable  {n} → /claude-tweaks:dispatch / /claude-tweaks:flow #N
in flight     {n}   (no pointer — informational; claims honored)
```

The header ends at `in flight` deliberately even though it is not the most actionable stage: the header is the process axis read left-to-right; the terminal-tail actionability principle is satisfied by the report's *body* ending in the hand-off and Next sections, not by the header's last column. The header replaces the summary counts too — do not re-add a prose counts paragraph above it; the header *is* the counts.

Then at most **two annotation lines total**:

- The trust consequence line from Step 1.5, when any applicable cell verdict requires it (all non-clean cells collapsed into that single semicolon-separated line — the per-cell phrasing never multiplies lines). Nothing when clean.
- `parked {N} · not-planned {M} → /claude-tweaks:tidy owns these` — rendered from `.funnel.parked.length` / `.funnel.notPlanned.length`, only when either count is non-zero.

Every record appears exactly once across the header's populations (`funnelBuckets` is mutually exclusive by construction) — never re-list a record in a second stage or an extra summary.
````

- [ ] **Step 3: Add the failure-only narration rule and update Step 3's buildable subset**

Near the top of `overview-mode.md` (after the opening paragraph), add:

```markdown
**Failure-only narration:** interstitial status lines render only when a check fails or degrades (truncation warning hit, fetch fallback taken, trust fetch skipped) — never to announce that a step ran or passed. A clean step is silent; its output speaks through the report itself.
```

In `## Step 3`, replace the opening sentence's predicate ("Restricted to the buildable subset — `facets.stage === 'ready'` and (`facets.grants.build` or `facets.grants.merge`) — the same population `/help`'s Stage 1 "authorized" bucket already defines.") with:

```markdown
Restricted to the buildable subset — `funnelBuckets` output `dispatchable` ∪ `granted` (Step 2's `.funnel` view) — one predicate, owned by `funnelBuckets`, so the header's counts and this recommendation's population can never drift apart.
```

- [ ] **Step 4: Update the framing-note pointer in `skills/_shared/trust-table.md`**

In the opening framing note, change the consumer reference `(overview-mode.md Step 1.5)` to this exact text: `(overview-mode.md — Step 1.5 computes once per invocation; bare mode renders a collapsed consequence line and the trust lens renders this table)`. Touch nothing else in the file.

- [ ] **Step 5: Verify by grep (spec ACs 2, 3, 3b, 4)**

Run each; every one must hit:

```bash
grep -c "captured ▶ scored ▶ shaped ▶ granted ▶ dispatchable ▶ in flight" skills/backlog/overview-mode.md
grep -ci "Critical/Risk-Value/Cleanup tables" skills/backlog/overview-mode.md
grep -ci "trust.. lens\|trust lens" skills/backlog/overview-mode.md
grep -ci "insufficient-evidence" skills/backlog/overview-mode.md
grep -c "dispatchable.*granted" skills/backlog/overview-mode.md
grep -ci "failure-only narration" skills/backlog/overview-mode.md
git diff --stat skills/_shared/trust-table.md
```

The last command must show exactly one file with a small hunk count (framing note only).

- [ ] **Step 6: Commit**

```bash
git add skills/backlog/overview-mode.md skills/_shared/trust-table.md
git commit -m "Rewrite backlog overview bare mode as funnel decision surface — refs #513"
```

---

### Task 4: `skills/backlog/SKILL.md` lens surface gains `trust`

**Files:**
- Modify: `skills/backlog/SKILL.md` (frontmatter `argument-hint`, Input section lens bullet, Next Actions Option 4 wording)

**Interfaces:**
- Consumes: the `trust` lens Task 3 added to `overview-mode.md`.

- [ ] **Step 1: Edit the three surfaces**

1. Frontmatter: `argument-hint: "[refine|overview|grant] [critical|risk-value|cleanup|trust] [--budget <n>] [--origin <origin>]"`
2. Input section lens bullet: `critical` / `risk-value` / `cleanup` / `trust` → lens sub-arguments (rest of the sentence unchanged).
3. Next Actions "After `overview`" Option 4: change "naming exactly one of the two named lenses not yet run this session" to "naming exactly one of the named lenses not yet run this session" (the lens count is no longer two — avoid a literal count per CLAUDE.md's cardinality rule).

- [ ] **Step 2: Verify by grep**

```bash
grep -c "critical|risk-value|cleanup|trust" skills/backlog/SKILL.md
grep -ci "named lenses not yet run" skills/backlog/SKILL.md
```

Both must hit.

- [ ] **Step 3: Commit**

```bash
git add skills/backlog/SKILL.md
git commit -m "Add trust lens to backlog skill argument surface — refs #513"
```

---

### Task 5: Full-suite verification and skill-graph check

**Files:**
- Read-only check: `docs/skill-graph.md` (update only if an edge names overview's trust render)

- [ ] **Step 1: Check `docs/skill-graph.md`**

Run: `grep -n -i "trust" docs/skill-graph.md`
If any edge names overview's Step 1.5 trust render placement, update that edge to the `trust` lens; otherwise leave the file untouched (adding the lens is intra-skill).

- [ ] **Step 2: Run the affected suites**

Run: `node --test tests/bin-lib/issues/`
Expected: PASS.

- [ ] **Step 3: Commit (only if skill-graph changed)**

```bash
git add docs/skill-graph.md
git commit -m "Point skill-graph trust edge at overview trust lens — refs #513"
```
