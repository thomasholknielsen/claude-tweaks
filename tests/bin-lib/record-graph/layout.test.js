// bin/lib/record-graph/tests/layout.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildGraph } = require('../../../plugin/bin/lib/record-graph/layout');
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

test('buildGraph drops a malformed-stage record everywhere at once, even when it participates in an edge', () => {
  // #99 has an unrecognized stage AND is blocked-by #20 — the exact shape that
  // would previously leak past columns.js into encoded/edges, leaving a renderer
  // to look up a node position that was never computed.
  const malformed = {
    number: 99,
    title: 'Malformed-stage record blocked by #20',
    labels: [],
    issueType: null,
    body: 'Blocked by #20',
    facets: { ...FIXTURE_RECORDS[0].facets, stage: 'nonsense' },
  };
  const graph = buildGraph([...FIXTURE_RECORDS, malformed], { workLinks: 'body-text' });
  assert.strictEqual(graph.encoded.has(99), false);
  assert.strictEqual(graph.recordCount, 3);
  for (const key of Object.keys(graph.columns)) {
    assert.ok(!graph.columns[key].some((r) => r.number === 99), `#99 leaked into the ${key} bucket`);
  }
  assert.ok(!graph.edges.some((e) => e.from === 99 || e.to === 99), '#99 leaked into an edge');
  // The well-formed edge (#20 -> #10) is unaffected by #99's presence.
  assert.deepStrictEqual(graph.edges, [{ from: 20, to: 10 }]);
});
