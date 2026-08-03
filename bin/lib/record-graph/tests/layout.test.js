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
