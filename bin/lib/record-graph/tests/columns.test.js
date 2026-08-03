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
