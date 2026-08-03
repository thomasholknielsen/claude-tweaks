# Live Record-Graph Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `record-graph` type to `/claude-tweaks:visualize` that deterministically renders this project's live open work-record queue (stage columns, `Blocked by #N` edges, six-axis color/badge encoding) as self-contained D2/SVG HTML, closing issue #28.

**Architecture:** A new pure, testable `bin/lib/record-graph/` module (columns → encode → edges → layout → render-d2/render-svg) consumes the faceted-record JSON that `_shared/record-queue-fetch.md`'s existing fetch procedure already produces, and reuses `bin/lib/issues/record.js`'s existing `parseDependencies`/`TYPE_LABELS`/`normalizeLabelNames`. A thin `bin/record-graph.js` CLI wrapper exposes it as `render`. `/claude-tweaks:visualize`'s existing theming/placement/wrapper machinery (`_shared/visual-html-output.md`, `d2-enhanced-path.md`) wraps the output unchanged.

**Tech Stack:** Node 18+ (`node --test`, no new runtime dependencies), D2 diagram language, plain SVG.

## Global Constraints

- No new runtime npm dependencies — this project ships no runtime deps (`package.json` description).
- New library code lives at `bin/lib/record-graph/` (flat sibling directory, not a nested `_shared/` wrapper — that convention is specific to `skills/_shared/`).
- `npm test`'s script in `package.json` must include the new test glob, following the existing pattern of one `bin/lib/{name}/tests/*.test.js` entry per health-suite module.
- No emoji anywhere — generated diagram badges use plain bracket/text tags (`[bug]`, `AUTO-BUILD`), matching this project's skill-writing convention.
- `SKILL.md` has a 40 KB soft ceiling — the full bucketing/encoding/edge contract goes in a new sub-file (`skills/visualize/record-graph.md`), not inlined into `SKILL.md`.
- Every cross-reference this project's own CLAUDE.md repeatedly flags as easy to forget (a skill's Relationship table, a shared file's own consumers list, `/help`'s reference card, `docs/plugin-structure.md`'s sub-file table) must be updated in the same change-set, not left as a follow-up.

---

### Task 1: Stage bucketing + shared test fixtures

**Files:**
- Create: `bin/lib/record-graph/columns.js`
- Create: `bin/lib/record-graph/tests/fixtures.js`
- Test: `bin/lib/record-graph/tests/columns.test.js`

**Interfaces:**
- Produces: `bucketByStage(records: Array<{number, facets: {stage: 'backlog'|'parked'|'ready', ...}}>) -> {backlog: Array, parked: Array, ready: Array}` — the record objects themselves are passed through unchanged, just partitioned by `facets.stage`.
- Produces (fixtures.js): `FIXTURE_RECORDS` — three faceted records covering all three stages, all seven axes' interesting combinations (used by every later task's tests).

- [ ] **Step 1: Write the shared test fixtures**

```javascript
// bin/lib/record-graph/tests/fixtures.js
'use strict';

// Three faceted records — the same shape record-queue-fetch.md's fetch already
// produces (raw gh fields + labels + body, spread with a parsed .facets object).
// Deliberately covers: all three stage buckets; origin set vs. unset (human);
// bot in-progress vs. blocked vs. neither; risk/effort set vs. unset; both
// grants vs. none; acceptance set vs. unset; type via label fallback vs. unset;
// and one Blocked-by edge (#20 -> #10, both open).
const FIXTURE_RECORDS = [
  {
    number: 10,
    title: 'Backlog record with no scoring',
    labels: [],
    issueType: null,
    body: '',
    facets: {
      origin: null, risk: null, effort: null, ceremony: null, priority: null,
      stage: 'backlog',
      grants: { build: false, merge: false },
      bot: { inProgress: false, blocked: false },
      acceptance: null,
    },
  },
  {
    number: 20,
    title: 'Ready record blocked by #10',
    labels: [
      { name: 'by:code-health' }, { name: 'risk:low' }, { name: 'effort:medium' },
      { name: 'ready' }, { name: 'bot:in-progress' },
    ],
    issueType: null,
    body: 'Blocked by #10\n\nSome body text.',
    facets: {
      origin: 'code-health', risk: 'low', effort: 'medium', ceremony: null, priority: null,
      stage: 'ready',
      grants: { build: false, merge: false },
      bot: { inProgress: true, blocked: false },
      acceptance: null,
    },
  },
  {
    number: 30,
    title: 'Parked record with grants',
    labels: [
      { name: 'parked' }, { name: 'auto:build' }, { name: 'auto:merge' },
      { name: 'bot:blocked' }, { name: 'demo:pending' }, { name: 'type:bug' },
    ],
    issueType: null,
    body: '',
    facets: {
      origin: null, risk: null, effort: null, ceremony: null, priority: null,
      stage: 'parked',
      grants: { build: true, merge: true },
      bot: { inProgress: false, blocked: true },
      acceptance: 'pending',
    },
  },
];

module.exports = { FIXTURE_RECORDS };
```

- [ ] **Step 2: Write the failing test for columns.js**

```javascript
// bin/lib/record-graph/tests/columns.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { bucketByStage } = require('../columns');
const { FIXTURE_RECORDS } = require('./fixtures');

test('bucketByStage partitions records into backlog/parked/ready by facets.stage', () => {
  const columns = bucketByStage(FIXTURE_RECORDS);
  assert.deepStrictEqual(columns.backlog.map((r) => r.number), [10]);
  assert.deepStrictEqual(columns.parked.map((r) => r.number), [30]);
  assert.deepStrictEqual(columns.ready.map((r) => r.number), [20]);
});

test('bucketByStage returns all three keys even when a bucket is empty', () => {
  const columns = bucketByStage([FIXTURE_RECORDS[0]]);
  assert.deepStrictEqual(Object.keys(columns).sort(), ['backlog', 'parked', 'ready']);
  assert.deepStrictEqual(columns.parked, []);
  assert.deepStrictEqual(columns.ready, []);
});

test('bucketByStage on an empty array returns three empty buckets', () => {
  const columns = bucketByStage([]);
  assert.deepStrictEqual(columns, { backlog: [], parked: [], ready: [] });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test bin/lib/record-graph/tests/columns.test.js`
Expected: FAIL — `Cannot find module '../columns'`

- [ ] **Step 4: Implement columns.js**

```javascript
// bin/lib/record-graph/columns.js
// Pure: partitions faceted records into the three Stage-axis buckets
// (_shared/work-record.md's Stage axis is exactly backlog | parked | ready —
// Authorization and Bot state are separate axes rendered as badges, not columns).
'use strict';

function bucketByStage(records) {
  const columns = { backlog: [], parked: [], ready: [] };
  for (const record of records) {
    columns[record.facets.stage].push(record);
  }
  return columns;
}

module.exports = { bucketByStage };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test bin/lib/record-graph/tests/columns.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add bin/lib/record-graph/columns.js bin/lib/record-graph/tests/fixtures.js bin/lib/record-graph/tests/columns.test.js
git commit -m "Add record-graph stage bucketing + shared test fixtures"
```

---

### Task 2: Per-record six-axis encoding

**Files:**
- Create: `bin/lib/record-graph/encode.js`
- Test: `bin/lib/record-graph/tests/encode.test.js`

**Interfaces:**
- Consumes: `bin/lib/issues/record.js`'s `TYPE_LABELS` (array of `[label, description]` pairs), `normalizeLabelNames(labels)`.
- Consumes (tests): `FIXTURE_RECORDS` from `./fixtures` (Task 1).
- Produces: `encodeRecord(record) -> {number, title, fillKey, borderStyle, badges}` where `fillKey` is `record.facets.origin || 'human'`, `borderStyle` is `'blocked'|'in-progress'|'default'`, and `badges` is an ordered `string[]` (Type, Scoring, Authorization, Acceptance — omitting any unset axis). This is the single function every renderer (Task 5, Task 6) reads per-node visual data from.

- [ ] **Step 1: Write the failing tests**

```javascript
// bin/lib/record-graph/tests/encode.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { encodeRecord } = require('../encode');
const { FIXTURE_RECORDS } = require('./fixtures');

test('encodeRecord: backlog record with nothing set gets no badges, human fill, default border', () => {
  const encoded = encodeRecord(FIXTURE_RECORDS[0]);
  assert.strictEqual(encoded.number, 10);
  assert.strictEqual(encoded.title, 'Backlog record with no scoring');
  assert.strictEqual(encoded.fillKey, 'human');
  assert.strictEqual(encoded.borderStyle, 'default');
  assert.deepStrictEqual(encoded.badges, []);
});

test('encodeRecord: code-health-origin, scored, in-progress record gets a scoring badge only', () => {
  const encoded = encodeRecord(FIXTURE_RECORDS[1]);
  assert.strictEqual(encoded.fillKey, 'code-health');
  assert.strictEqual(encoded.borderStyle, 'in-progress');
  assert.deepStrictEqual(encoded.badges, ['R:low E:medium']);
});

test('encodeRecord: bot:blocked wins over bot:inProgress when (hypothetically) both are true', () => {
  const both = { ...FIXTURE_RECORDS[1], facets: { ...FIXTURE_RECORDS[1].facets, bot: { inProgress: true, blocked: true } } };
  assert.strictEqual(encodeRecord(both).borderStyle, 'blocked');
});

test('encodeRecord: fully-badged parked record — type via type:* label fallback, both grants, acceptance', () => {
  const encoded = encodeRecord(FIXTURE_RECORDS[2]);
  assert.strictEqual(encoded.fillKey, 'human');
  assert.strictEqual(encoded.borderStyle, 'blocked');
  assert.deepStrictEqual(encoded.badges, ['[bug]', 'AUTO-BUILD', 'AUTO-MERGE', 'demo:pending']);
});

test('encodeRecord: native Issue Type takes precedence over any type:* label', () => {
  const record = { ...FIXTURE_RECORDS[2], issueType: { name: 'Feature' } };
  assert.deepStrictEqual(encodeRecord(record).badges, ['[feature]', 'AUTO-BUILD', 'AUTO-MERGE', 'demo:pending']);
});

test('encodeRecord: unrecognized native Issue Type name omits the Type badge rather than guessing', () => {
  const record = { ...FIXTURE_RECORDS[0], issueType: { name: 'Epic' } };
  assert.deepStrictEqual(encodeRecord(record).badges, []);
});

test('encodeRecord: only one of risk/effort set still shows a scoring badge with "?" for the other', () => {
  const record = { ...FIXTURE_RECORDS[0], facets: { ...FIXTURE_RECORDS[0].facets, risk: 'high' } };
  assert.deepStrictEqual(encodeRecord(record).badges, ['R:high E:?']);
});

test('encodeRecord: title over 40 chars is truncated with an ellipsis', () => {
  const longTitle = 'x'.repeat(50);
  const record = { ...FIXTURE_RECORDS[0], title: longTitle };
  const encoded = encodeRecord(record);
  assert.strictEqual(encoded.title.length, 40);
  assert.strictEqual(encoded.title, `${'x'.repeat(39)}…`);
});

test('encodeRecord: title at or under 40 chars is left unchanged', () => {
  assert.strictEqual(encodeRecord(FIXTURE_RECORDS[0]).title, 'Backlog record with no scoring');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/record-graph/tests/encode.test.js`
Expected: FAIL — `Cannot find module '../encode'`

- [ ] **Step 3: Implement encode.js**

```javascript
// bin/lib/record-graph/encode.js
// Pure: the six-axis visual-encoding contract from
// docs/superpowers/specs/2026-08-03-visualize-record-graph-design.md. One
// record in, one {fillKey, borderStyle, badges} out — every renderer (D2, SVG)
// reads exclusively from this shape, never from the raw record again.
'use strict';

const { TYPE_LABELS, normalizeLabelNames } = require('../issues/record');

const TITLE_MAX = 40;
const RECOGNIZED_TYPES = TYPE_LABELS.map(([label]) => label.split(':')[1]);

function truncateTitle(title, max = TITLE_MAX) {
  const text = typeof title === 'string' ? title : '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Native Issue Type (facets don't carry this — see facet-shape.js's own note
// that Type has no shared-facet analog) takes precedence over a type:* label,
// since a project could carry a stale label after switching work-types: native.
function typeOf(record) {
  const native = record.issueType;
  if (native && typeof native === 'object' && typeof native.name === 'string') {
    const name = native.name.toLowerCase();
    return RECOGNIZED_TYPES.includes(name) ? name : null;
  }
  const names = normalizeLabelNames(record.labels);
  for (const [label] of TYPE_LABELS) {
    if (names.includes(label)) return label.split(':')[1];
  }
  return null;
}

function scoringBadge(facets) {
  if (facets.risk == null && facets.effort == null) return null;
  return `R:${facets.risk || '?'} E:${facets.effort || '?'}`;
}

function badgesFor(record) {
  const badges = [];
  const type = typeOf(record);
  if (type) badges.push(`[${type}]`);
  const scoring = scoringBadge(record.facets);
  if (scoring) badges.push(scoring);
  if (record.facets.grants.build) badges.push('AUTO-BUILD');
  if (record.facets.grants.merge) badges.push('AUTO-MERGE');
  if (record.facets.acceptance) badges.push(`demo:${record.facets.acceptance}`);
  return badges;
}

function borderStyleFor(bot) {
  if (bot.blocked) return 'blocked';
  if (bot.inProgress) return 'in-progress';
  return 'default';
}

function encodeRecord(record) {
  return {
    number: record.number,
    title: truncateTitle(record.title),
    fillKey: record.facets.origin || 'human',
    borderStyle: borderStyleFor(record.facets.bot),
    badges: badgesFor(record),
  };
}

module.exports = { encodeRecord };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/record-graph/tests/encode.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/record-graph/encode.js bin/lib/record-graph/tests/encode.test.js
git commit -m "Add record-graph per-record six-axis encoding"
```

---

### Task 3: Blocked-by dependency edges

**Files:**
- Create: `bin/lib/record-graph/edges.js`
- Test: `bin/lib/record-graph/tests/edges.test.js`

**Interfaces:**
- Consumes: `bin/lib/issues/record.js`'s `parseDependencies(body)`.
- Consumes (tests): `FIXTURE_RECORDS` from `./fixtures` (Task 1).
- Produces: `computeEdges(records, {workLinks: 'native'|'body-text'}) -> {edges: Array<{from, to}>, edgesOmitted: boolean}`.

- [ ] **Step 1: Write the failing tests**

```javascript
// bin/lib/record-graph/tests/edges.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { computeEdges } = require('../edges');
const { FIXTURE_RECORDS } = require('./fixtures');

test('computeEdges under work-links: body-text parses Blocked-by lines into edges', () => {
  const { edges, edgesOmitted } = computeEdges(FIXTURE_RECORDS, { workLinks: 'body-text' });
  assert.strictEqual(edgesOmitted, false);
  assert.deepStrictEqual(edges, [{ from: 20, to: 10 }]);
});

test('computeEdges under work-links: native returns no edges and sets edgesOmitted', () => {
  const { edges, edgesOmitted } = computeEdges(FIXTURE_RECORDS, { workLinks: 'native' });
  assert.deepStrictEqual(edges, []);
  assert.strictEqual(edgesOmitted, true);
});

test('computeEdges drops a Blocked-by reference to a number not present in the open record set', () => {
  const withDanglingRef = [
    ...FIXTURE_RECORDS,
    { number: 40, title: 'Blocked by a closed record', body: 'Blocked by #999', facets: FIXTURE_RECORDS[0].facets },
  ];
  const { edges } = computeEdges(withDanglingRef, { workLinks: 'body-text' });
  assert.deepStrictEqual(edges, [{ from: 20, to: 10 }]);
});

test('computeEdges on records with no Blocked-by lines returns an empty edge list', () => {
  const { edges, edgesOmitted } = computeEdges([FIXTURE_RECORDS[0], FIXTURE_RECORDS[2]], { workLinks: 'body-text' });
  assert.deepStrictEqual(edges, []);
  assert.strictEqual(edgesOmitted, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/record-graph/tests/edges.test.js`
Expected: FAIL — `Cannot find module '../edges'`

- [ ] **Step 3: Implement edges.js**

```javascript
// bin/lib/record-graph/edges.js
// Pure: Blocked-by edges for the open record set only. Only populated under
// work-links: body-text (the body field is already in record-queue-fetch.md's
// one fetch pull) — under work-links: native, resolving edges needs a second
// query, out of the issue's explicit "one gh issue list pull" scope, so this
// returns edgesOmitted: true instead (SKILL.md/record-graph.md render a
// visible on-diagram note for that case). A dependency on a number outside the
// open record set (e.g. an already-closed blocker) is dropped rather than
// drawn to a node that doesn't exist in the diagram.
'use strict';

const { parseDependencies } = require('../issues/record');

function computeEdges(records, { workLinks }) {
  if (workLinks !== 'body-text') {
    return { edges: [], edgesOmitted: true };
  }
  const openNumbers = new Set(records.map((r) => r.number));
  const edges = [];
  for (const record of records) {
    for (const depNumber of parseDependencies(record.body)) {
      if (openNumbers.has(depNumber)) edges.push({ from: record.number, to: depNumber });
    }
  }
  return { edges, edgesOmitted: false };
}

module.exports = { computeEdges };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/record-graph/tests/edges.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/record-graph/edges.js bin/lib/record-graph/tests/edges.test.js
git commit -m "Add record-graph Blocked-by dependency edge resolution"
```

---

### Task 4: Graph assembly (the shared IR)

**Files:**
- Create: `bin/lib/record-graph/layout.js`
- Test: `bin/lib/record-graph/tests/layout.test.js`

**Interfaces:**
- Consumes: `bucketByStage` (Task 1), `encodeRecord` (Task 2), `computeEdges` (Task 3).
- Consumes (tests): `FIXTURE_RECORDS` from `./fixtures` (Task 1).
- Produces: `buildGraph(records, {workLinks, truncated}) -> {columns: {backlog, parked, ready}, encoded: Map<number, EncodedRecord>, edges, edgesOmitted, truncated, recordCount}` — the one intermediate representation both renderers (Task 5, Task 6) consume. `columns` values are the original record objects (not encoded) — renderers look up encoded data via `encoded.get(record.number)`.

- [ ] **Step 1: Write the failing tests**

```javascript
// bin/lib/record-graph/tests/layout.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildGraph } = require('../layout');
const { FIXTURE_RECORDS } = require('./fixtures');

test('buildGraph assembles columns, encoded map, and edges from the fetched records', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  assert.deepStrictEqual(graph.columns.backlog.map((r) => r.number), [10]);
  assert.deepStrictEqual(graph.columns.parked.map((r) => r.number), [30]);
  assert.deepStrictEqual(graph.columns.ready.map((r) => r.number), [20]);
  assert.strictEqual(graph.encoded.get(20).fillKey, 'code-health');
  assert.deepStrictEqual(graph.edges, [{ from: 20, to: 10 }]);
  assert.strictEqual(graph.edgesOmitted, false);
  assert.strictEqual(graph.recordCount, 3);
});

test('buildGraph defaults truncated to false when not passed', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  assert.strictEqual(graph.truncated, false);
});

test('buildGraph passes truncated through when set', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text', truncated: true });
  assert.strictEqual(graph.truncated, true);
});

test('buildGraph on an empty record set returns empty columns and a zero record count', () => {
  const graph = buildGraph([], { workLinks: 'body-text' });
  assert.deepStrictEqual(graph.columns, { backlog: [], parked: [], ready: [] });
  assert.strictEqual(graph.encoded.size, 0);
  assert.strictEqual(graph.recordCount, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/record-graph/tests/layout.test.js`
Expected: FAIL — `Cannot find module '../layout'`

- [ ] **Step 3: Implement layout.js**

```javascript
// bin/lib/record-graph/layout.js
// Pure: orchestrates columns.js + encode.js + edges.js into the one shared
// intermediate representation both render-d2.js and render-svg.js consume.
// Neither renderer touches a raw record or facets object directly.
'use strict';

const { bucketByStage } = require('./columns');
const { encodeRecord } = require('./encode');
const { computeEdges } = require('./edges');

function buildGraph(records, { workLinks, truncated = false }) {
  const columns = bucketByStage(records);
  const encoded = new Map(records.map((record) => [record.number, encodeRecord(record)]));
  const { edges, edgesOmitted } = computeEdges(records, { workLinks });
  return {
    columns, encoded, edges, edgesOmitted, truncated, recordCount: records.length,
  };
}

module.exports = { buildGraph };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/record-graph/tests/layout.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/record-graph/layout.js bin/lib/record-graph/tests/layout.test.js
git commit -m "Add record-graph shared graph-assembly IR"
```

---

### Task 5: D2 source renderer (enhanced path)

**Files:**
- Create: `bin/lib/record-graph/render-d2.js`
- Test: `bin/lib/record-graph/tests/render-d2.test.js`

**Interfaces:**
- Consumes: `buildGraph`'s output shape (Task 4) — `{columns, encoded, edges, edgesOmitted, truncated}`.
- Produces: `renderD2(graph, {generatedAt}) -> string` — valid `.d2` source: one container per stage column, one node per record (multi-line label: title + badges), cross-container edges, a header comment block. Consumed by `/visualize`'s enhanced path (`d2-enhanced-path.md`), which hands this string to the `d2` binary unmodified — this function never invokes `d2` itself.

- [ ] **Step 1: Write the failing tests**

```javascript
// bin/lib/record-graph/tests/render-d2.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderD2, ORIGIN_COLORS, BORDER_COLORS } = require('../render-d2');
const { buildGraph } = require('../layout');
const { FIXTURE_RECORDS } = require('./fixtures');

const GENERATED_AT = '2026-08-03T12:00:00.000Z';

test('renderD2 emits a generated-at header and a re-run hint', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderD2(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /# Generated 2026-08-03T12:00:00\.000Z/);
  assert.match(output, /re-run \/claude-tweaks:visualize record-graph to refresh/);
});

test('renderD2 emits one container per stage column with its label', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderD2(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /backlog: "Backlog" \{/);
  assert.match(output, /parked: "Parked" \{/);
  assert.match(output, /ready: "Ready" \{/);
});

test('renderD2 emits a node per record with title + badges joined by \\n, and origin/border colors', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderD2(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /n10: "Backlog record with no scoring" \{/);
  assert.match(output, /n20: "Ready record blocked by #10\\nR:low E:medium" \{/);
  assert.match(output, /n30: "Parked record with grants\\n\[bug\]\\nAUTO-BUILD\\nAUTO-MERGE\\ndemo:pending" \{/);
  assert.ok(output.includes(`style.fill: "${ORIGIN_COLORS['code-health']}"`));
  assert.ok(output.includes(`style.stroke: "${BORDER_COLORS.blocked}"`));
  assert.match(output, /style\.stroke-dash: 3/);
});

test('renderD2 emits a cross-container edge using qualified node paths', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderD2(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /ready\.n20 -> backlog\.n10/);
});

test('renderD2 emits the edges-omitted note and no edge lines under work-links: native', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'native' });
  const output = renderD2(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /# Dependency edges unavailable under work-links: native/);
  assert.ok(!output.includes(' -> '));
});

test('renderD2 emits a truncation note when graph.truncated is set', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text', truncated: true });
  const output = renderD2(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /# Showing the fetch cap.s worth of records/);
});

test('renderD2 escapes double quotes in a title', () => {
  const record = { ...FIXTURE_RECORDS[0], title: 'A "quoted" title' };
  const graph = buildGraph([record], { workLinks: 'body-text' });
  const output = renderD2(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /n10: "A \\"quoted\\" title" \{/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/record-graph/tests/render-d2.test.js`
Expected: FAIL — `Cannot find module '../render-d2'`

- [ ] **Step 3: Implement render-d2.js**

```javascript
// bin/lib/record-graph/render-d2.js
// Emits .d2 source text for the enhanced /visualize path. D2's own theme
// system doesn't bind live CSS variables (d2-enhanced-path.md Step 3), so
// this uses a small fixed literal-hex palette; the existing generic
// re-theming step maps each distinct hex to the nearest project token after
// the d2 binary renders this to SVG. This function never shells out to d2.
'use strict';

const ORIGIN_COLORS = {
  'code-health': '#5b8def',
  'harness-health': '#9b59b6',
  'journey-health': '#16a085',
  'docs-health': '#e67e22',
  capture: '#34495e',
  dispatch: '#c0392b',
  human: '#7f8c8d',
};

const BORDER_COLORS = {
  blocked: '#c0392b',
  'in-progress': '#2980b9',
  default: '#95a5a6',
};

const COLUMN_LABELS = { backlog: 'Backlog', parked: 'Parked', ready: 'Ready' };
const COLUMN_ORDER = ['backlog', 'parked', 'ready'];

function d2Escape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeId(number) {
  return `n${number}`;
}

function renderNode(encoded) {
  const label = [encoded.title, ...encoded.badges].map(d2Escape).join('\\n');
  const fill = ORIGIN_COLORS[encoded.fillKey] || ORIGIN_COLORS.human;
  const stroke = BORDER_COLORS[encoded.borderStyle] || BORDER_COLORS.default;
  const lines = [
    `  ${nodeId(encoded.number)}: "${label}" {`,
    `    style.fill: "${fill}"`,
    `    style.stroke: "${stroke}"`,
  ];
  if (encoded.borderStyle === 'blocked') lines.push('    style.stroke-dash: 3');
  lines.push('  }');
  return lines.join('\n');
}

function renderColumn(key, records, encoded) {
  const nodes = records.map((r) => renderNode(encoded.get(r.number))).join('\n');
  return [`${key}: "${COLUMN_LABELS[key]}" {`, nodes, '}'].filter(Boolean).join('\n');
}

function numberToColumnMap(columns) {
  const map = new Map();
  for (const key of COLUMN_ORDER) {
    for (const record of columns[key]) map.set(record.number, key);
  }
  return map;
}

function renderEdges(edges, columns) {
  const numberToColumn = numberToColumnMap(columns);
  return edges
    .map(({ from, to }) => `${numberToColumn.get(from)}.${nodeId(from)} -> ${numberToColumn.get(to)}.${nodeId(to)}`)
    .join('\n');
}

function renderD2(graph, { generatedAt }) {
  const header = [
    `# Generated ${generatedAt} — re-run /claude-tweaks:visualize record-graph to refresh`,
    graph.truncated ? '# Showing the fetch cap’s worth of records — raise backlog-fetch-limit for more' : null,
    graph.edgesOmitted ? '# Dependency edges unavailable under work-links: native — requires a second query, out of scope' : null,
  ].filter(Boolean).join('\n');

  const columns = COLUMN_ORDER.map((key) => renderColumn(key, graph.columns[key], graph.encoded)).join('\n\n');
  const edges = renderEdges(graph.edges, graph.columns);

  return `${[header, columns, edges].filter(Boolean).join('\n\n')}\n`;
}

module.exports = { renderD2, ORIGIN_COLORS, BORDER_COLORS };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/record-graph/tests/render-d2.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/record-graph/render-d2.js bin/lib/record-graph/tests/render-d2.test.js
git commit -m "Add record-graph D2 source renderer"
```

---

### Task 6: SVG fragment renderer (baseline path)

**Files:**
- Create: `bin/lib/record-graph/render-svg.js`
- Test: `bin/lib/record-graph/tests/render-svg.test.js`

**Interfaces:**
- Consumes: `buildGraph`'s output shape (Task 4).
- Produces: `renderSvg(graph, {generatedAt}) -> string` — a `visual-html-output.md`-Step-3-shaped core fragment (`<svg class="vz-record-graph">` + a scoped `<style>` block defining this diagram's own light/dark custom properties, following that file's `:root` / `:root[data-theme="dark"]` / `@media (prefers-color-scheme: dark)` shape). Used only when the `d2` binary is unavailable.

- [ ] **Step 1: Write the failing tests**

```javascript
// bin/lib/record-graph/tests/render-svg.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderSvg } = require('../render-svg');
const { buildGraph } = require('../layout');
const { FIXTURE_RECORDS } = require('./fixtures');

const GENERATED_AT = '2026-08-03T12:00:00.000Z';

test('renderSvg emits a scoped root svg with the vz-record-graph class', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /<svg class="vz-record-graph"/);
});

test('renderSvg defines scoped light+dark custom properties for every origin and border state', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /--vz-rg-origin-code-health:/);
  assert.match(output, /--vz-rg-origin-human:/);
  assert.match(output, /--vz-rg-border-blocked:/);
  assert.match(output, /:root\[data-theme="dark"\] \.vz-record-graph \{/);
  assert.match(output, /@media \(prefers-color-scheme: dark\)/);
});

test('renderSvg draws one rect+text group per record, using var()-bound fill/stroke keyed by fillKey/borderStyle', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /fill="var\(--vz-rg-origin-code-health\)"/);
  assert.match(output, /stroke="var\(--vz-rg-border-blocked\)"/);
  assert.match(output, /stroke-dasharray="4 3"/);
  assert.match(output, /<tspan[^>]*>Ready record blocked by #10<\/tspan>/);
  assert.match(output, /<tspan[^>]*>R:low E:medium<\/tspan>/);
});

test('renderSvg draws one line per edge between the two node rects', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /<line class="vz-record-graph-edge"/);
});

test('renderSvg draws no edge lines and includes the omitted note under work-links: native', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'native' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.ok(!output.includes('vz-record-graph-edge'));
  assert.match(output, /Dependency edges unavailable under work-links: native/);
});

test('renderSvg XML-escapes a title containing angle brackets and ampersands', () => {
  const record = { ...FIXTURE_RECORDS[0], title: 'A <weird> & tricky title' };
  const graph = buildGraph([record], { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /A &lt;weird&gt; &amp; tricky title/);
  assert.ok(!output.includes('A <weird>'));
});

test('renderSvg includes the generated-at + refresh-hint note text', () => {
  const graph = buildGraph(FIXTURE_RECORDS, { workLinks: 'body-text' });
  const output = renderSvg(graph, { generatedAt: GENERATED_AT });
  assert.match(output, /Generated 2026-08-03T12:00:00\.000Z/);
  assert.match(output, /re-run \/claude-tweaks:visualize record-graph to refresh/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/record-graph/tests/render-svg.test.js`
Expected: FAIL — `Cannot find module '../render-svg'`

- [ ] **Step 3: Implement render-svg.js**

```javascript
// bin/lib/record-graph/render-svg.js
// Emits the baseline (no d2 binary) core SVG fragment, following
// visual-html-output.md Step 3's scoped-class + light/dark-:root shape.
// Fixed-width lane layout, not a graph-layout algorithm — mechanical, not
// freehand, per the design doc's baseline-path decision.
'use strict';

const COLUMN_ORDER = ['backlog', 'parked', 'ready'];
const COLUMN_LABELS = { backlog: 'Backlog', parked: 'Parked', ready: 'Ready' };
const COLUMN_X = { backlog: 20, parked: 300, ready: 580 };
const NODE_WIDTH = 240;
const NODE_HEIGHT = 90;
const GAP = 16;
const WIDTH = 900;

const STYLE_BLOCK = `.vz-record-graph {
  --vz-rg-origin-code-health: #5b8def;
  --vz-rg-origin-harness-health: #9b59b6;
  --vz-rg-origin-journey-health: #16a085;
  --vz-rg-origin-docs-health: #e67e22;
  --vz-rg-origin-capture: #34495e;
  --vz-rg-origin-dispatch: #c0392b;
  --vz-rg-origin-human: #7f8c8d;
  --vz-rg-border-blocked: #c0392b;
  --vz-rg-border-in-progress: #2980b9;
  --vz-rg-border-default: #95a5a6;
  --vz-rg-column-bg: #f3f4f6;
  --vz-rg-text: #1a1d23;
}
:root[data-theme="dark"] .vz-record-graph {
  --vz-rg-column-bg: #1d2026;
  --vz-rg-text: #e7e9ed;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .vz-record-graph {
    --vz-rg-column-bg: #1d2026;
    --vz-rg-text: #e7e9ed;
  }
}`;

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nodePositions(columns) {
  const positions = new Map();
  let maxY = 140;
  for (const key of COLUMN_ORDER) {
    let y = 50;
    for (const record of columns[key]) {
      positions.set(record.number, { x: COLUMN_X[key], y });
      y += NODE_HEIGHT + GAP;
    }
    maxY = Math.max(maxY, y);
  }
  return { positions, maxY };
}

function renderNode(encoded, pos) {
  const lines = [encoded.title, ...encoded.badges];
  const tspans = lines
    .map((line, i) => `<tspan x="${pos.x + 8}" dy="${i === 0 ? 18 : 16}">${escapeXml(line)}</tspan>`)
    .join('');
  const fill = `var(--vz-rg-origin-${encoded.fillKey})`;
  const stroke = `var(--vz-rg-border-${encoded.borderStyle})`;
  const dash = encoded.borderStyle === 'blocked' ? ' stroke-dasharray="4 3"' : '';
  return `<g class="vz-record-graph-node">
<rect x="${pos.x}" y="${pos.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"${dash} />
<text x="${pos.x + 8}" y="${pos.y + 18}" fill="var(--vz-rg-text)">${tspans}</text>
</g>`;
}

function renderColumns(columns, encoded, positions) {
  return COLUMN_ORDER.map((key) => {
    const label = `<text class="vz-record-graph-column-label" x="${COLUMN_X[key]}" y="30" fill="var(--vz-rg-text)">${COLUMN_LABELS[key]}</text>`;
    const nodes = columns[key].map((r) => renderNode(encoded.get(r.number), positions.get(r.number))).join('\n');
    return [label, nodes].filter(Boolean).join('\n');
  }).join('\n');
}

function renderEdges(edges, positions) {
  return edges.map(({ from, to }) => {
    const a = positions.get(from);
    const b = positions.get(to);
    const x1 = a.x + NODE_WIDTH;
    const y1 = a.y + NODE_HEIGHT / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_HEIGHT / 2;
    return `<line class="vz-record-graph-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--vz-rg-text)" />`;
  }).join('\n');
}

function renderSvg(graph, { generatedAt }) {
  const { positions, maxY } = nodePositions(graph.columns);
  const notes = [
    `Generated ${generatedAt} — re-run /claude-tweaks:visualize record-graph to refresh`,
    graph.truncated ? 'Showing the fetch cap’s worth of records — raise backlog-fetch-limit for more' : null,
    graph.edgesOmitted ? 'Dependency edges unavailable under work-links: native' : null,
  ].filter(Boolean).join(' — ');

  return `<svg class="vz-record-graph" viewBox="0 0 ${WIDTH} ${maxY}" xmlns="http://www.w3.org/2000/svg">
<style>
${STYLE_BLOCK}
</style>
<text class="vz-record-graph-note" x="20" y="${maxY - 10}" fill="var(--vz-rg-text)">${escapeXml(notes)}</text>
${renderEdges(graph.edges, positions)}
${renderColumns(graph.columns, graph.encoded, positions)}
</svg>`;
}

module.exports = { renderSvg };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/record-graph/tests/render-svg.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/record-graph/render-svg.js bin/lib/record-graph/tests/render-svg.test.js
git commit -m "Add record-graph baseline SVG renderer"
```

---

### Task 7: CLI wrapper + npm test wiring

**Files:**
- Create: `bin/record-graph.js`
- Test: `bin/lib/record-graph/tests/cli-render.test.js`
- Modify: `package.json` (test script)

**Interfaces:**
- Consumes: `buildGraph` (Task 4), `renderD2` (Task 5), `renderSvg` (Task 6).
- Produces: `node bin/record-graph.js render <faceted-json-path> --format <d2|svg> --work-links <native|body-text> [--fetch-limit N] [--generated-at <ISO8601>] [--out <path>]` — writes to `--out` when given, else stdout. This is the exact CLI invocation `skills/visualize/record-graph.md` (Task 8) documents and the skill executes.

- [ ] **Step 1: Write the failing CLI test**

```javascript
// bin/lib/record-graph/tests/cli-render.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FIXTURE_RECORDS } = require('./fixtures');

const CLI = path.resolve(__dirname, '..', '..', '..', 'record-graph.js');

function tmpJson(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-graph-cli-'));
  const file = path.join(dir, 'records.json');
  fs.writeFileSync(file, JSON.stringify(records));
  return file;
}

test('render --format d2 writes valid-looking D2 source to stdout', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const out = execFileSync('node', [
    CLI, 'render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--generated-at', '2026-08-03T12:00:00.000Z',
  ], { encoding: 'utf8' });
  assert.match(out, /backlog: "Backlog" \{/);
  assert.match(out, /ready\.n20 -> backlog\.n10/);
});

test('render --format svg writes an svg fragment to stdout', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const out = execFileSync('node', [
    CLI, 'render', jsonPath, '--format', 'svg', '--work-links', 'body-text', '--generated-at', '2026-08-03T12:00:00.000Z',
  ], { encoding: 'utf8' });
  assert.match(out, /<svg class="vz-record-graph"/);
});

test('render --out writes the file instead of stdout', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-graph-cli-out-'));
  const outPath = path.join(outDir, 'record-graph.d2');
  // execFileSync's return value is always stdout, never stderr, regardless of
  // stdio config — spawnSync is used here instead because it exposes both
  // streams directly on its result object for a successful (non-throwing) run.
  const result = spawnSync('node', [
    CLI, 'render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--out', outPath,
  ], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.ok(fs.existsSync(outPath));
  assert.match(fs.readFileSync(outPath, 'utf8'), /backlog: "Backlog" \{/);
  assert.match(result.stderr, /wrote .*record-graph\.d2 \(3 records, 1 edges\)/);
});

test('render sets truncated when record count equals --fetch-limit', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  const out = execFileSync('node', [
    CLI, 'render', jsonPath, '--format', 'd2', '--work-links', 'body-text', '--fetch-limit', '3',
  ], { encoding: 'utf8' });
  assert.match(out, /Showing the fetch cap.s worth of records/);
});

test('render rejects an unrecognized --format with exit code 2', () => {
  const jsonPath = tmpJson(FIXTURE_RECORDS);
  assert.throws(() => {
    execFileSync('node', [CLI, 'render', jsonPath, '--format', 'png', '--work-links', 'body-text'], { encoding: 'utf8' });
  }, /Command failed/);
});

test('unknown command exits with code 2 and a usage message on stderr', () => {
  let error;
  try {
    execFileSync('node', [CLI, 'bogus'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    error = e;
  }
  assert.ok(error);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /unknown command "bogus"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/record-graph/tests/cli-render.test.js`
Expected: FAIL — `Cannot find module '.../record-graph.js'` (ENOENT spawning node with a nonexistent script)

- [ ] **Step 3: Implement bin/record-graph.js**

```javascript
#!/usr/bin/env node
// record-graph CLI: render — the only command. Reads an already-fetched
// faceted-record JSON file (produced by _shared/record-queue-fetch.md's
// existing fetch procedure) and deterministically emits D2 or SVG source.
// No gh/network I/O happens in this file — see bin/lib/record-graph/*.js.
'use strict';

const fs = require('fs');
const { buildGraph } = require('./lib/record-graph/layout');
const { renderD2 } = require('./lib/record-graph/render-d2');
const { renderSvg } = require('./lib/record-graph/render-svg');

function parseArgs(argv) {
  const args = { _: [], generatedAt: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') args.format = argv[++i];
    else if (a === '--work-links') args.workLinks = argv[++i];
    else if (a === '--fetch-limit') args.fetchLimit = Number(argv[++i]);
    else if (a === '--generated-at') args.generatedAt = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else args._.push(a);
  }
  return args;
}

function cmdRender(args) {
  const jsonPath = args._[0];
  if (!jsonPath) {
    process.stderr.write('render: missing <faceted-json-path>\n');
    process.exit(2);
  }
  if (args.format !== 'd2' && args.format !== 'svg') {
    process.stderr.write('render: --format must be "d2" or "svg"\n');
    process.exit(2);
  }
  if (args.workLinks !== 'native' && args.workLinks !== 'body-text') {
    process.stderr.write('render: --work-links must be "native" or "body-text"\n');
    process.exit(2);
  }
  const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const truncated = Number.isFinite(args.fetchLimit) && records.length === args.fetchLimit;
  const graph = buildGraph(records, { workLinks: args.workLinks, truncated });
  const output = args.format === 'd2'
    ? renderD2(graph, { generatedAt: args.generatedAt })
    : renderSvg(graph, { generatedAt: args.generatedAt });

  if (args.out) {
    fs.writeFileSync(args.out, output);
    const omitted = graph.edgesOmitted ? ', edges omitted' : '';
    process.stderr.write(`render: wrote ${args.out} (${records.length} records, ${graph.edges.length} edges${omitted})\n`);
  } else {
    process.stdout.write(output);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  if (cmd === 'render') {
    cmdRender(args);
    return;
  }
  process.stderr.write(`record-graph: unknown command "${cmd}" (expected: render)\n`);
  process.exit(2);
}

main();
```

- [ ] **Step 4: Run the CLI test to verify it passes**

Run: `node --test bin/lib/record-graph/tests/cli-render.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire the new tests into `npm test`**

Modify `package.json`'s `scripts.test` — append `bin/lib/record-graph/tests/*.test.js` to the existing glob list:

```json
{
  "name": "claude-tweaks",
  "private": true,
  "version": "6.7.0",
  "description": "claude-tweaks plugin — test harness only; the plugin itself ships no runtime npm deps.",
  "scripts": {
    "test": "node --test tests/ bin/lib/code-health/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js bin/lib/journey-health/tests/*.test.js bin/lib/health-core/tests/*.test.js bin/lib/docs-health/tests/*.test.js bin/lib/record-graph/tests/*.test.js"
  }
}
```

(Only the `test` script's glob list changes — every other field in `package.json` stays exactly as-is.)

- [ ] **Step 6: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS — all pre-existing suites plus the 40 new `bin/lib/record-graph/tests/*.test.js` tests (3 in columns.test.js + 9 in encode.test.js + 4 in edges.test.js + 4 in layout.test.js + 7 in render-d2.test.js + 7 in render-svg.test.js + 6 in cli-render.test.js = 40; exact count isn't load-bearing, just confirm zero failures).

- [ ] **Step 7: Best-effort live D2 smoke test (only if the `d2` binary is installed)**

```bash
if command -v d2 >/dev/null 2>&1; then
  node -e "
    const { FIXTURE_RECORDS } = require('./bin/lib/record-graph/tests/fixtures');
    require('fs').writeFileSync('/tmp/record-graph-fixtures.json', JSON.stringify(FIXTURE_RECORDS));
  "
  node bin/record-graph.js render /tmp/record-graph-fixtures.json --format d2 --work-links body-text --out /tmp/record-graph-smoke.d2
  d2 --layout=elk /tmp/record-graph-smoke.d2 /tmp/record-graph-smoke.svg && echo "d2 smoke render OK"
else
  echo "d2 binary not installed in this environment — skipping live smoke test (the string-level render-d2.test.js assertions in Task 5 are the only coverage here); a future session with d2 installed should run this once before the enhanced path is trusted end-to-end."
fi
```

This mirrors `d2-enhanced-path.md`'s own "verify current support with a throwaway smoke render" discipline for a new construct (here: cross-container edges via qualified `container.node` paths) — best-effort because this repo's own dev environment does not have `d2` installed as of this plan.

- [ ] **Step 8: Commit**

```bash
git add bin/record-graph.js bin/lib/record-graph/tests/cli-render.test.js package.json
git commit -m "Add record-graph CLI wrapper, wire into npm test"
```

---

### Task 8: New sub-file — `skills/visualize/record-graph.md`

**Files:**
- Create: `skills/visualize/record-graph.md`

**Interfaces:**
- Consumes: `bin/record-graph.js render`'s exact CLI signature (Task 7) and `_shared/record-queue-fetch.md`'s existing fetch procedure (unmodified).
- Produces: the procedure `skills/visualize/SKILL.md` (Task 9) reads for the `record-graph` type, in place of Step 4 (baseline) / in addition to `d2-enhanced-path.md` (enhanced) for that one type.

- [ ] **Step 1: Write the sub-file**

```markdown
# Record Graph — Live Work-Record Queue Diagram

Used by `/claude-tweaks:visualize record-graph` only. Read from `SKILL.md`'s Step 1
once `<type>` resolves to `record-graph` — this file replaces Step 4 (baseline
authoring) entirely for this type, and supplies the D2 source `d2-enhanced-path.md`'s
Step 1 hands to the `d2` binary for the enhanced path. No topic is ever resolved for
this type; skip Input's "if `$ARGUMENTS` is empty, ask the user for both" entirely —
`record-graph` alone is a complete invocation.

## Step A: Fetch the open record queue

Run `_shared/record-queue-fetch.md`'s existing fetch procedure exactly as written,
with one addition: append `body` to `{EXTRA_FIELDS}` (needed for `Blocked by #N`
parsing below). This produces the same faceted-record JSON `/help`, `/tidy`, and
`/backlog` already consume — no new fetch logic, this type is one more consumer of
that shared procedure.

Also read `work-links` from the project's CLAUDE.md (`_shared/work-record.md`'s
Config keys table) — a missing key defaults to `body-text`, matching that table's
own default.

## Step B: Render

Resolve `--format` from `SKILL.md` Step 1's already-computed enhanced/baseline
decision: `d2` when enhanced, `svg` when baseline. Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/record-graph.js" render "{tmp-faceted-file}" \
  --format <d2|svg> \
  --work-links "$WORK_LINKS" \
  --fetch-limit "${BACKLOG_FETCH_LIMIT:-1000}" \
  --out "{destination-path}.{d2|html-fragment-scratch}"
```

For the **enhanced** path, `--out` targets the `.d2` source file at the same base
path as the eventual HTML output (matching `d2-enhanced-path.md` Step 1's existing
convention) — then continue at `d2-enhanced-path.md` Step 2 (`d2 --layout=elk`) and
Step 3 (re-theme) exactly as written for every other enhanced type. The re-theming
step's "map each distinct hex to the nearest project token, by role — use judgment,
there's no universal 1:1 mapping" guidance applies here too: this type's six-value
Origin fill palette will commonly map several origins onto the same nearest token
on a project with fewer than six accent-ish colors in `DESIGN.md` — an accepted,
inherited limitation of the existing generic mechanism, not something this type
works around.

For the **baseline** path, the render call's `svg` output IS the core fragment
`SKILL.md` Step 4 would otherwise author by hand — skip Step 4's own instructions
entirely for this type and pass this output straight to `visual-html-output.md`
Step 4's wrapper adapters.

## Step C: Placement (overrides SKILL.md Step 3's table for this type only)

`record-graph` always resolves to `docs/diagrams/record-graph.html` (+ `.d2` source
alongside it on the enhanced path) — regardless of whether this was a direct
invocation, `--source`, or `--ephemeral` was passed. Skip Step 3's persist-vs-
ephemeral `AskUserQuestion` entirely for this type: always persisted, always
overwritten and committed on every run. This is a deliberate override of the
general persist-vs-ephemeral rule — a live-state snapshot that isn't saved defeats
the point of a "living dashboard" file you regenerate on demand.

`SKILL.md` Step 6 (registry update) applies completely unchanged — this path
matches the existing `docs/diagrams/{slug}.html` fallback convention exactly, so
no new registry logic is needed here.

## Error handling

- **Zero open records** — `bin/record-graph.js` still renders a valid 3-column
  empty diagram (no special-casing needed; `buildGraph([], ...)` returns empty
  column arrays and `renderD2`/`renderSvg` handle empty containers/groups
  correctly). Note on the diagram: still shows the "Generated {timestamp}" line;
  the empty columns communicate "no open work records" on their own.
- **Truncated fetch** — `--fetch-limit` is always passed from
  `backlog-fetch-limit` (or its default 1000); when the fetched count equals it,
  `bin/record-graph.js` renders the on-diagram truncation note itself (Task 7) —
  no separate handling needed here beyond passing the flag through.
- **`work-backend: local-files`** — Step A's fetch already branches on
  `work-backend` per `record-queue-fetch.md`; both drivers land in the same
  faceted-record shape, so no change is needed here. Not separately verified
  against real local-files data.
```

- [ ] **Step 2: Commit**

```bash
git add skills/visualize/record-graph.md
git commit -m "Add record-graph sub-file: fetch + render + placement contract"
```

---

### Task 9: Wire `record-graph` into `skills/visualize/SKILL.md`

**Files:**
- Modify: `skills/visualize/SKILL.md`

**Interfaces:**
- Consumes: `skills/visualize/record-graph.md` (Task 8).

- [ ] **Step 1: Update the frontmatter**

In the `description` line, append a clause naming this new trigger. Find:

```
description: Use when you want a themed, project-local visual diagram — architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layer stack, venn, or pyramid — generated as self-contained HTML+SVG and styled from the project's own DESIGN.md tokens. Works standalone or as a soft-hook suggestion from /journeys, /specify, and /review.
```

Replace with:

```
description: Use when you want a themed, project-local visual diagram — architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layer stack, venn, pyramid, or a live diagram of this project's own open work-record queue — generated as self-contained HTML+SVG and styled from the project's own DESIGN.md tokens. Works standalone or as a soft-hook suggestion from /journeys, /specify, and /review.
```

In the `argument-hint` line, find:

```
argument-hint: "<architecture|flowchart|sequence|state|er|timeline|swimlane|quadrant|nested|tree|org-chart|layers|venn|pyramid> <topic> [--source <caller>] [--ephemeral]"
```

Replace with:

```
argument-hint: "<architecture|flowchart|sequence|state|er|timeline|swimlane|quadrant|nested|tree|org-chart|layers|venn|pyramid|record-graph> [topic] [--source <caller>] [--ephemeral]"
```

(`[topic]` is now bracketed rather than bare — it's required for every type except `record-graph`, which the Input section below states explicitly.)

- [ ] **Step 2: Add the `record-graph` row to the Input type table**

Find the type table (ends at `| `pyramid` | Stacked priority/maturity levels |`) and its following sentence. Add a row and a clarifying sentence immediately after:

```markdown
| `pyramid` | Stacked priority/maturity levels |
| `record-graph` | This project's own live open work-record queue — stage columns, dependency edges, six-axis badges. No topic. |

`<topic>` is free text describing what to diagram. If `$ARGUMENTS` is empty, ask the user for both — except `record-graph`, which takes no topic at all: `/claude-tweaks:visualize record-graph` alone is a complete invocation, and `$ARGUMENTS` being exactly `record-graph` should never trigger the "ask for both" fallback.
```

(This replaces the original single sentence `` `<topic>` is free text describing what to diagram. If `$ARGUMENTS` is empty, ask the user for both. `` with the row-plus-extended-sentence above.)

- [ ] **Step 3: Add `record-graph` to Step 1's enhanced/baseline table, with a routing note**

Find Step 1's table (ends at `| `timeline`, `swimlane`, `venn`, `pyramid` | Baseline only | No native fit |`). Add a row and a note immediately after:

```markdown
| `timeline`, `swimlane`, `venn`, `pyramid` | Baseline only | No native fit |
| `record-graph` | Enhanced when `d2` is installed, baseline otherwise (same rule as every other type) | Container-based directed graph (stage-column containers, record nodes, dependency edges) |

For `record-graph`, skip topic resolution entirely and read `record-graph.md` in this skill's directory now — it owns the fetch (Step A), render (Step B), and placement (Step C, which overrides Step 3 below for this type only) for the whole type. Return here only if `record-graph.md` hands control back for a step it doesn't override (there are none as of this writing — Steps 2, 4, and 5's generic instructions are fully superseded by `record-graph.md` for this type).
```

- [ ] **Step 4: Add `record-graph` to Step 3's placement table**

Find Step 3's placement table (ends at the "`--ephemeral` passed" row). Add a row:

```markdown
| `record-graph` (any invocation) | Overridden entirely by `record-graph.md` Step C — always `docs/diagrams/record-graph.html` (+ `.d2` source), no `AskUserQuestion`, always persisted and overwritten. |
```

- [ ] **Step 5: Add an Anti-Patterns row**

Find the Anti-Patterns table. Add a row:

```markdown
| Model hand-authoring `record-graph`'s D2/SVG source from the fetched JSON | Defeats the type's whole purpose — it exists specifically to avoid LLM transcription of structured queue data (wrong issue numbers, dropped labels). Always route through `bin/record-graph.js render`. |
```

- [ ] **Step 6: Add a Relationship-table row**

Find the Relationship to Other Skills table. Add a row (after the `visual-html-output.md` row):

```markdown
| `skills/_shared/record-queue-fetch.md` | `record-graph.md` Step A reuses this shared fetch-and-facet-parse procedure verbatim (with `body` added to `{EXTRA_FIELDS}`) — the same procedure `/help`, `/tidy`, and `/backlog` already consume. |
```

- [ ] **Step 7: Commit**

```bash
git add skills/visualize/SKILL.md
git commit -m "Wire record-graph type into /visualize's dispatch tables"
```

---

### Task 10: Cross-references — keep every other file in sync

This task exists specifically because this project's own CLAUDE.md repeatedly
documents the same recurring bug: a change lands correctly in the primary file but
a second, non-adjacent file that names the same fact goes stale. Each edit below
targets one such file.

**Files:**
- Modify: `skills/_shared/record-queue-fetch.md`
- Modify: `skills/_shared/work-record.md`
- Modify: `skills/help/reference-card.md`
- Modify: `docs/plugin-structure.md`

**Interfaces:**
- Consumes: nothing new — this task only makes existing shared files' own "who consumes/reads this" prose accurate again after Tasks 8-9 added a new consumer.

- [ ] **Step 1: Add `/visualize` to `record-queue-fetch.md`'s consumers list**

In `skills/_shared/record-queue-fetch.md`, find the opening paragraph:

```
Single source of truth for the first read every open-work-record scan performs: resolve
`work-backend`, fetch the queue, and facet-parse it. Consumed by `/claude-tweaks:help`
(`status-scan.md` Stage 1), `/claude-tweaks:tidy` (`scan-procedures.md` Step 1), and
`/claude-tweaks:backlog` (both `refine-mode.md`'s and `overview-mode.md`'s Step 1) — every one
of these scans starts from the identical fetch below before branching into its own
consumer-specific classification (dashboard bucket counts for `/help`; the seven finding shapes
for `/tidy`; priority/Related synthesis plus the grant worklist for `/backlog refine`, lens
routing plus the build recommendation for `/backlog overview`).
```

Replace with:

```
Single source of truth for the first read every open-work-record scan performs: resolve
`work-backend`, fetch the queue, and facet-parse it. Consumed by `/claude-tweaks:help`
(`status-scan.md` Stage 1), `/claude-tweaks:tidy` (`scan-procedures.md` Step 1),
`/claude-tweaks:backlog` (both `refine-mode.md`'s and `overview-mode.md`'s Step 1), and
`/claude-tweaks:visualize` (`visualize/record-graph.md` Step A) — every one of these scans
starts from the identical fetch below before branching into its own consumer-specific
classification (dashboard bucket counts for `/help`; the seven finding shapes for `/tidy`;
priority/Related synthesis plus the grant worklist for `/backlog refine`, lens routing plus the
build recommendation for `/backlog overview`; stage-column bucketing plus six-axis encoding for
`/visualize record-graph`).
```

- [ ] **Step 2: Add `/visualize` to `work-record.md`'s Consumers table**

In `skills/_shared/work-record.md`, find the Consumers table's last row (`| /init | ... |`)
and add a new row immediately after it:

```markdown
| `/visualize` | Read-only — `record-graph` type renders the live open-record queue (stage columns, dependency edges, six-axis badges) as a diagram; never writes labels or body content |
```

- [ ] **Step 3: Add `record-graph` to `/help`'s reference card**

In `skills/help/reference-card.md`, find the `/claude-tweaks:visualize` row:

```
| `/claude-tweaks:visualize` | Themed diagram generation — architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid | `<architecture\|flowchart\|sequence\|state\|er\|timeline\|swimlane\|quadrant\|nested\|tree\|org-chart\|layers\|venn\|pyramid> <topic> [--source <caller>] [--ephemeral]` |
```

Replace with:

```
| `/claude-tweaks:visualize` | Themed diagram generation — architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid, or a live diagram of this project's own open work-record queue | `<architecture\|flowchart\|sequence\|state\|er\|timeline\|swimlane\|quadrant\|nested\|tree\|org-chart\|layers\|venn\|pyramid\|record-graph> [topic] [--source <caller>] [--ephemeral]` |
```

- [ ] **Step 4: Add `record-graph.md` to `docs/plugin-structure.md`'s visualize row**

In `docs/plugin-structure.md`, find:

```
| visualize | d2-enhanced-path.md | D2 CLI invocation + re-theming procedure (loaded only when the `d2` binary is installed and the diagram type maps to it) |
```

Replace with:

```
| visualize | d2-enhanced-path.md, record-graph.md | D2 CLI invocation + re-theming procedure (loaded only when the `d2` binary is installed and the diagram type maps to it); record-graph.md — live open-work-record-queue fetch + render + placement contract (loaded only for the `record-graph` type) |
```

- [ ] **Step 5: Verify no other file names the old (pre-Task-8) state**

```bash
grep -rn "d2-enhanced-path.md" skills/ docs/ README.md 2>/dev/null | grep -v "skills/visualize/d2-enhanced-path.md:" | grep -v "record-graph.md"
```

Expected: only `docs/plugin-structure.md`'s now-updated row and `skills/visualize/SKILL.md`'s own references — confirm no stray file still describes visualize's sub-file set as exactly one file.

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/record-queue-fetch.md skills/_shared/work-record.md skills/help/reference-card.md docs/plugin-structure.md
git commit -m "Sync record-graph cross-references across shared/help/structure docs"
```

---

### Task 11: Version bump + CHANGELOG entry

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing — final task, no downstream consumer.

- [ ] **Step 1: Check for a concurrent version bump before bumping**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```

If a bump landed upstream after this branch started that isn't reflected in the
current `.claude-plugin/plugin.json` version, renumber this task's bump to the
next free version instead of the one below.

- [ ] **Step 2: Bump the version**

In `.claude-plugin/plugin.json`, change `"version": "6.24.0"` to `"version": "6.25.0"`
(minor bump — feature addition, per CLAUDE.md's versioning convention).

- [ ] **Step 3: Add a CHANGELOG entry**

In `CHANGELOG.md`, insert a new section immediately after the `# Changelog` header,
before the existing `## v6.24.0` section:

```markdown
## v6.25.0 — Live record-graph visualization (closes #28)

`/claude-tweaks:visualize` gains a `record-graph` type: a deterministic diagram of
this project's own live open work-record queue — stage columns (backlog/parked/
ready), `Blocked by #N` dependency edges, and a six-axis color/badge encoding
(Origin, Bot state, Type, Scoring, Authorization, Acceptance). No topic argument;
always persisted to `docs/diagrams/record-graph.html`, regenerated on demand.

A new `bin/record-graph.js` CLI (backed by pure, unit-tested `bin/lib/record-graph/`
modules) does all data-shape work deterministically — stage bucketing, six-axis
encoding, and Blocked-by edge resolution reuse the existing, tested
`bin/lib/issues/record.js` facet/dependency parsing rather than any model-authored
transcription of issue numbers, titles, or labels. Content is a point-in-time
snapshot, not a live-refreshing view — the diagram carries a "Generated {timestamp}
— re-run to refresh" note rather than a client-side data fetch.
```

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json CHANGELOG.md
git commit -m "Bump to 6.25.0, add CHANGELOG entry for record-graph visualization"
```
