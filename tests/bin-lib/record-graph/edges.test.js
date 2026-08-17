// bin/lib/record-graph/tests/edges.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { computeEdges } = require('../../../plugin/bin/lib/record-graph/edges');
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
