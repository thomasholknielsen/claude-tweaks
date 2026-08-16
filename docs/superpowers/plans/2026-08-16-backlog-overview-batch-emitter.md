# Backlog Overview Batch Emitter Implementation Plan (#515)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn bare overview's Step 4 hand-off into a per-terminal batch emitter with chain, overlap, and claim integrity, backed by two new pure graph helpers (`buildChains`, `transitiveUnblocksCount`) in `ranking.js`.

**Architecture:** Both helpers call #514's `blockersOf` so blocker precedence stays decided in one place; components are found by undirected BFS over in-set dependency edges, then linearized topologically (ready-batch emission, ties by priority band then id — deterministic, no clocks/randomness); anything never emitted is the cycle group. The skill text consumes helper outputs and owns rendering only: fenced per-stage paste blocks, five integrity rules, the two-channel contract, and the `Next:` line.

**Tech Stack:** Node 18+ `node --test`; pure functions; markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T010024-spec-513-514-515-516/spec-515/work/515-spec.md`

## Global Constraints

- Helpers are pure — no I/O, no `Date.now()`/randomness; all ordering ties break by priority band then id (determinism is a spec Gotcha).
- `buildChains` return shape, the single authoritative form: `{ chains: number[][], independents: number[], cycles: {ids: number[]}[] }` — `cycles` always present (`[]` when none); a cyclic component lands whole in `cycles`, never partially in `chains`.
- `computeUnblocksCount` (direct-only) stays untouched — `rankNextToBuild`'s tie-break callers unchanged.
- The emitter reads claim state (`bot:in-progress` via `facets.bot.inProgress`), never takes or releases claims, and never instructs taking one "to be safe".
- Every emitted command line in every block template is fully-qualified `/claude-tweaks:...`.
- Commit messages: `{Verb} {what} — {detail}` imperative, `refs #515` (never closes/fixes).
- Scope note (logged as add-to-plan): the Two-channel contract's menu half necessarily touches `skills/backlog/SKILL.md`'s "After `overview`" Next Actions block — the spec's Key Files list omits it, but its Deliverables text ("stated in Step 4 + Next Actions") requires it; Task 3 makes the minimal edit there.

---

### Task 1: `transitiveUnblocksCount` + `buildChains` in `ranking.js` (batched — same file pair)

**Files:**
- Modify: `bin/lib/issues/ranking.js`
- Test: `tests/bin-lib/issues/ranking.test.js`

**Interfaces:**
- Consumes: `blockersOf(candidate)` (existing, #514), `priorityBandOf` (existing module-local helper).
- Produces: `transitiveUnblocksCount(candidates) -> Map<id, number>` (in-set transitive closure; cycle-safe) and `buildChains(candidates) -> { chains, independents, cycles }` — both exported.

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/issues/ranking.test.js`, matching the file's existing candidate style (`{ id, facets, body, ... }` — for these graph tests a minimal `{ id, blockedBy: [...], facets: {} }` per candidate suffices; `blockedBy` present means `blockersOf` uses it verbatim):

```js
// --- transitiveUnblocksCount + buildChains (#515) ---

const chainFixture = [
  { id: 418, blockedBy: [], facets: {} },
  { id: 419, blockedBy: [418], facets: {} },
  { id: 420, blockedBy: [419], facets: {} },
];

test('transitiveUnblocksCount: linear chain head counts every transitively blocked candidate', () => {
  const counts = transitiveUnblocksCount(chainFixture);
  assert.equal(counts.get(418), 2);
  assert.equal(counts.get(419), 1);
  assert.equal(counts.get(420), 0);
});

test('buildChains: linear chain linearizes head-first as one chain', () => {
  const result = buildChains(chainFixture);
  assert.deepEqual(result, { chains: [[418, 419, 420]], independents: [], cycles: [] });
});

test('buildChains: diamond linearizes as one component without duplicating any record', () => {
  const diamond = [
    { id: 1, blockedBy: [], facets: {} },
    { id: 2, blockedBy: [1], facets: {} },
    { id: 3, blockedBy: [1], facets: {} },
    { id: 4, blockedBy: [2, 3], facets: {} },
  ];
  const result = buildChains(diamond);
  assert.deepEqual(result.chains, [[1, 2, 3, 4]]);
  assert.deepEqual(result.independents, []);
  assert.deepEqual(result.cycles, []);
});

test('cycle fixture: both helpers terminate; buildChains routes the component to cycles', () => {
  const cyclic = [
    { id: 7, blockedBy: [8], facets: {} },
    { id: 8, blockedBy: [7], facets: {} },
    { id: 9, blockedBy: [], facets: {} },
  ];
  const counts = transitiveUnblocksCount(cyclic);
  assert.ok(Number.isFinite(counts.get(7)));
  assert.ok(Number.isFinite(counts.get(8)));
  const result = buildChains(cyclic);
  assert.deepEqual(result.chains, []);
  assert.deepEqual(result.independents, [9]);
  assert.deepEqual(result.cycles, [{ ids: [7, 8] }]);
});

test('buildChains: singletons pass through as independents', () => {
  const singles = [
    { id: 5, blockedBy: [], facets: {} },
    { id: 6, facets: {} },
  ];
  assert.deepEqual(buildChains(singles), { chains: [], independents: [5, 6], cycles: [] });
});

test('out-of-set blockers contribute nothing to either helper', () => {
  const set = [
    { id: 10, blockedBy: [999], facets: {} },
    { id: 11, blockedBy: [10], facets: {} },
  ];
  assert.equal(transitiveUnblocksCount(set).get(10), 1);
  assert.equal(transitiveUnblocksCount(set).has(999), false);
  const result = buildChains(set);
  assert.deepEqual(result.chains, [[10, 11]]);
  assert.deepEqual(result.cycles, []);
});
```

Import both new names alongside the file's existing `ranking.js` imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/ranking.test.js`
Expected: FAIL — neither helper exported.

- [ ] **Step 3: Implement both helpers**

In `bin/lib/issues/ranking.js`, after `findUnresolvedDependencyProse`:

```js
// candidates[] -> Map<id, count>: for each candidate, how many OTHER candidates
// in the set are transitively blocked behind it — the chain-head payout the
// batch emitter ranks terminal blocks by. In-set scoping is deliberate: the
// payout answers "of the records you can currently act on, how many are behind
// this one" — an out-of-set blocker can't be dispatched from this report
// anyway (accepted limitation, recorded in the spec). Cycle-safe via a visited
// set: a cyclic pair yields finite counts, never an infinite walk. Blocker
// precedence comes from blockersOf — never re-implemented here.
function transitiveUnblocksCount(candidates) {
  const ids = new Set(candidates.map((c) => c.id));
  const dependents = new Map(candidates.map((c) => [c.id, []]));
  for (const c of candidates) {
    for (const blockerId of blockersOf(c)) {
      if (ids.has(blockerId) && blockerId !== c.id) dependents.get(blockerId).push(c.id);
    }
  }
  const counts = new Map();
  for (const id of ids) {
    const seen = new Set();
    const stack = [...dependents.get(id)];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === id || seen.has(next)) continue;
      seen.add(next);
      stack.push(...dependents.get(next));
    }
    counts.set(id, seen.size);
  }
  return counts;
}

// candidates[] -> { chains: number[][], independents: number[], cycles:
// {ids: number[]}[] } — the single authoritative shape (cycles always
// present, [] when none). Partitions the set into dependency components
// (undirected BFS over in-set blocker edges), then linearizes each
// multi-member component topologically: repeatedly emit ids whose in-set
// blockers are all already emitted, ready-batch ties broken by priority band
// then id for determinism. A component that stalls before emitting every
// member is cyclic — it lands whole under cycles (ids sorted), never
// partially in chains, never an infinite loop. Singleton components are
// independents. Precondition: candidates are the buildable subset
// (funnelBuckets dispatchable ∪ granted) carrying whatever blockedBy the
// caller attached; blocker precedence comes from blockersOf.
function buildChains(candidates) {
  const ids = new Set(candidates.map((c) => c.id));
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const inSetBlockers = new Map(candidates.map((c) => [
    c.id, blockersOf(c).filter((b) => ids.has(b) && b !== c.id),
  ]));
  const adjacency = new Map(candidates.map((c) => [c.id, new Set()]));
  for (const [id, blockers] of inSetBlockers) {
    for (const b of blockers) {
      adjacency.get(id).add(b);
      adjacency.get(b).add(id);
    }
  }
  const seen = new Set();
  const chains = [];
  const independents = [];
  const cycles = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    const component = [];
    const stack = [c.id];
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      component.push(id);
      stack.push(...adjacency.get(id));
    }
    if (component.length === 1) {
      independents.push(component[0]);
      continue;
    }
    const componentSet = new Set(component);
    const emitted = new Set();
    const order = [];
    let progressed = true;
    while (order.length < component.length && progressed) {
      progressed = false;
      const ready = component
        .filter((id) => !emitted.has(id)
          && inSetBlockers.get(id).filter((b) => componentSet.has(b)).every((b) => emitted.has(b)))
        .sort((a, b) => priorityBandOf(byId.get(a)) - priorityBandOf(byId.get(b)) || a - b);
      for (const id of ready) {
        emitted.add(id);
        order.push(id);
        progressed = true;
      }
    }
    if (order.length < component.length) cycles.push({ ids: component.slice().sort((a, b) => a - b) });
    else chains.push(order);
  }
  independents.sort((a, b) => a - b);
  return { chains, independents, cycles };
}
```

Export both alongside the existing exports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/ranking.test.js`
Expected: PASS (all new + pre-existing).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/ranking.js tests/bin-lib/issues/ranking.test.js
git commit -m "Add buildChains and transitiveUnblocksCount graph helpers — refs #515"
```

---

### Task 2: Rewrite `overview-mode.md` Step 4 as the batch emitter (+ SKILL.md menu note)

**Files:**
- Modify: `skills/backlog/overview-mode.md` (Step 4 replaced entirely)
- Modify: `skills/backlog/SKILL.md` ("After `overview`" Next Actions block — minimal two-channel additions)

**Interfaces:**
- Consumes: `funnelBuckets` (`dispatchable` ∪ `granted`), `buildChains`, `transitiveUnblocksCount`, `findUnresolvedDependencyProse` flags (Step 3's `{ ranked, flags }` output), `groupByFileOverlap` (`bin/lib/issues/grouping.js`), `facets.bot.inProgress`.

- [ ] **Step 1: Replace `## Step 4: Hand-off block (contextual)` in `overview-mode.md`**

Replace the whole Step 4 section (heading through the "selection spanning both stages" bullet) with a `## Step 4: Batch emitter (bare mode)` section containing, in order:

1. **Input precondition**: the dispatch-block candidate set is `funnelBuckets`' `dispatchable` ∪ `granted` (Step 2's `.funnel` — already filtered; `needs:definition` records structurally can't be in it since they never reach `ready`; the Shape block's own human-owed filtering belongs to the needs-you sub-issue). The Shape block's population is the `scored` bucket (records shaped next); the Score line's count is the `captured` bucket.
2. **Compute block** (runnable, extending Step 3's outputs):

````markdown
```bash
node -e "
  const { buildChains, transitiveUnblocksCount } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/ranking.js');
  const { groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const candidates = require('/tmp/backlog-overview-candidates.json');
  console.log(JSON.stringify({
    graph: buildChains(candidates),
    payout: Object.fromEntries(transitiveUnblocksCount(candidates)),
    overlapGroups: groupByFileOverlap(candidates.map((c) => ({ id: c.id, keyFiles: c.keyFiles || [] }))),
  }));
" > /tmp/backlog-overview-emitter.json
```
````

3. **Ordering rule**: one combined ranking over dependency components and independents alike — sort key: the component head's `transitiveUnblocksCount` (an independent is its own head; usually 0) descending, then priority, then size, ties by id. No chains-first-then-independents grouping.
4. **Render rules** — one fenced paste block per funnel stage that has members, exactly these templates:

````markdown
```
── Score the rest ──
# {captured-count} unscored records
/claude-tweaks:backlog refine
```

```
── Shape next ──
# Terminal 1 — priority:{tier} — {one-line hook}
/claude-tweaks:specify #{N}
# Terminal 2 — priority:{tier} — {one-line hook}
/claude-tweaks:specify #{M}
```

```
── Dispatch now ──
# Terminal 1 — chain: #A ─▶ #B ─▶ #C (head unblocks {n})
/claude-tweaks:flow #A,#B,#C
# Terminal 2 — independent
/claude-tweaks:flow #D
```
````

  With the prose rules: the Score line's count is comment-only (`refine` has no count flag); Shape lines are priority-ordered, one record per terminal; a chain emits as **one** multi-ref `/claude-tweaks:flow #A,#B,#C` command listing every member in dependency order (one command per chain, never head-only — flow's multi-ref form runs them as a sequential pipeline); independents get their own terminals with plain `/claude-tweaks:flow #N`. All commands fully qualified.
5. **Batch integrity rules**, each stated as its own bullet, greppable:
   - **(a) Overlap serialization** — records `groupByFileOverlap` groups together never appear in different concurrent terminal blocks. Deciding criterion: members of the same dependency component are already serialized in one terminal by construction; a file-overlap group spanning different components/independents serializes them into one terminal when they are few (≤3 combined), otherwise excludes the lower-ranked with a `#`-comment naming the conflict. Group membership is transitive — treat membership, not pairwise overlap, as the signal.
   - **(b) Claim exclusion** — `bot:in-progress`/claimed records are excluded from every block, one `#`-comment reason each (e.g. `# #472 skipped — bot:in-progress`), and counted in the funnel's `in flight` stage. The claim snapshot is read-only and may go stale between render and paste; that staleness is accepted risk, resolved downstream by `/claude-tweaks:dispatch`/`/claude-tweaks:flow`'s own claim-taking at execution time — never read this scan as a completeness guarantee, and never instruct taking a claim from this report.
   - **(c) No silent caps** — anything excluded or truncated is named with a count.
   - **(d) No terminal cap** — blocks emit in ranked order; the human takes the top *k*.
   - **(e) Flagged records** — records flagged by the dependency-mismatch detection (Step 3's `flags`) render as plain independents: no `─▶` arrows, own terminal, with a `#`-comment naming the suppressed chain and pointing at `/claude-tweaks:backlog refine`'s dependency repair — never silently dropped (dropping would violate rule (c)).
6. **Two-channel contract + `Next:` line** (one subsection): paste blocks carry agent-executable/unattended commands only; the `AskUserQuestion` menu carries this-session moves only (run refine here, open a lens, dispatch the top chain here) and is never the delivery channel for other-terminal command lists — terminal-command lists inside `AskUserQuestion` options are forbidden. The report body ends with a single `Next:` line: one sentence naming the top-ranked action, always exactly one. Fallback ladder when `dispatchable` is empty: the top action of the highest-precedence non-empty stage (grant → specify → refine), ties broken by id; when every stage is empty, the literal `Next: backlog is empty`. The menu's `(Recommended)` option MUST match the `Next:` line — one source of truth, stated as a MUST.

- [ ] **Step 2: Minimal `skills/backlog/SKILL.md` edit ("After `overview`" block)**

Add one sentence at the top of the "After `overview`" Next Actions block: `The menu's (Recommended) option MUST match the report's closing `Next:` line (Step 4's two-channel contract — the menu carries this-session moves only, never other-terminal command lists).` Touch nothing else in the block.

- [ ] **Step 3: Verify by grep**

```bash
grep -c "── Score the rest ──" skills/backlog/overview-mode.md
grep -c "── Shape next ──" skills/backlog/overview-mode.md
grep -c "── Dispatch now ──" skills/backlog/overview-mode.md
grep -ci "deciding criterion" skills/backlog/overview-mode.md
grep -ci "staleness is accepted risk\|accepted risk" skills/backlog/overview-mode.md
grep -ci "no silent caps\|named with a count" skills/backlog/overview-mode.md
grep -ci "no terminal cap\|top .k" skills/backlog/overview-mode.md
grep -ci "plain independents" skills/backlog/overview-mode.md
grep -ci "Next: backlog is empty" skills/backlog/overview-mode.md
grep -c "─▶" skills/backlog/overview-mode.md
grep -ci "MUST match" skills/backlog/overview-mode.md skills/backlog/SKILL.md
grep -ci "head unblocks" skills/backlog/overview-mode.md
```

Every grep must hit (non-zero). Also confirm every command line in the three block templates starts with `/claude-tweaks:`.

- [ ] **Step 4: Commit**

```bash
git add skills/backlog/overview-mode.md skills/backlog/SKILL.md
git commit -m "Rewrite overview Step 4 as per-terminal batch emitter with integrity rules — refs #515"
```

---

### Task 3: #467 supersession verification

**Files:** none modified (GitHub bookkeeping check; a comment only if the pointer is missing)

- [ ] **Step 1: Verify the closure pointer**

Run: `gh issue view 467 --repo thomasholknielsen/claude-tweaks --json state,comments --jq '{state, lastComments: [.comments[-3:][].body]}'`
Check the closure comment references this decomposition (#515 and/or parent #512). If it does: record the evidence in your report, done. If it does not: post one comment — `Superseded by #515 (batch emitter sub-issue of #512's funnel redesign) — closed at decomposition time; #515's landing delivers the emitter this record asked for.` — via `gh issue comment 467 --repo thomasholknielsen/claude-tweaks --body "..."`.

- [ ] **Step 2: No commit** (nothing in the repo changes).

---

### Task 4: Revert-discrimination check + suite run (AC 6)

**Files:** transient revert of `bin/lib/issues/ranking.js`

- [ ] **Step 1: Verify test discrimination by reverting**

Identify the file's last pre-Task-1 commit: `git log --oneline -3 -- bin/lib/issues/ranking.js` (the commit before this plan's Task 1 commit). Then:

```bash
git checkout {pre-task-1-sha} -- bin/lib/issues/ranking.js
node --test tests/bin-lib/issues/ranking.test.js
```

Expected: FAIL (the new buildChains/transitiveUnblocksCount tests fail — that failure is the check passing). Restore:

```bash
git checkout HEAD -- bin/lib/issues/ranking.js
node --test tests/bin-lib/issues/ranking.test.js
```

Expected: PASS. (A harness "modified externally" reminder after `git checkout --` is the checkout's own side effect.) NEVER use git stash; never commit the reverted state.

- [ ] **Step 2: Run the issues suites**

Run: `node --test tests/bin-lib/issues/*.test.js`
Expected: PASS.

- [ ] **Step 3: No commit** (verification only).
