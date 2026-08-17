const { test } = require('node:test');
const assert = require('node:assert');
const { bucketByStage } = require('../../../plugin/bin/lib/record-graph/columns');
const { COLUMN_ORDER } = require('../../../plugin/bin/lib/record-graph/palette');
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

test('bucketByStage derives its bucket keys from palette.js COLUMN_ORDER', () => {
  assert.deepStrictEqual(Object.keys(bucketByStage([])), COLUMN_ORDER);
});

test('bucketByStage omits a record with an unrecognized facets.stage rather than throwing', () => {
  const malformed = { ...FIXTURE_RECORDS[0], number: 99, facets: { ...FIXTURE_RECORDS[0].facets, stage: 'nonsense' } };
  let columns;
  assert.doesNotThrow(() => { columns = bucketByStage([...FIXTURE_RECORDS, malformed]); });
  assert.deepStrictEqual(Object.keys(columns), COLUMN_ORDER);
  for (const key of COLUMN_ORDER) {
    assert.ok(!columns[key].some((r) => r.number === 99), `#99 leaked into the ${key} bucket`);
  }
  // The well-formed records around it are unaffected.
  assert.deepStrictEqual(columns.backlog.map((r) => r.number), [10]);
});

test('bucketByStage omits a record whose facets.stage collides with an Object.prototype key', () => {
  const polluted = { ...FIXTURE_RECORDS[0], number: 98, facets: { ...FIXTURE_RECORDS[0].facets, stage: 'constructor' } };
  let columns;
  assert.doesNotThrow(() => { columns = bucketByStage([polluted]); });
  assert.deepStrictEqual(columns, { backlog: [], parked: [], ready: [] });
});
