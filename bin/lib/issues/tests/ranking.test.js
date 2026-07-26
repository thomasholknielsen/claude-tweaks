'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { rankNextToBuild } = require('../ranking');

function candidate(overrides) {
  return {
    id: 1,
    facets: { priority: null, effort: null },
    body: '',
    keyFiles: [],
    hasPlan: false,
    ...overrides,
  };
}

test('rankNextToBuild sorts by priority band first (high before medium before low before unset)', () => {
  const low = candidate({ id: 1, facets: { priority: 'low', effort: null } });
  const high = candidate({ id: 2, facets: { priority: 'high', effort: null } });
  const unset = candidate({ id: 3, facets: { priority: null, effort: null } });
  const medium = candidate({ id: 4, facets: { priority: 'medium', effort: null } });
  const result = rankNextToBuild([low, high, unset, medium]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 4, 1, 3]);
});

test('an out-of-vocabulary priority value sorts like unset (band 3), never NaN', () => {
  const bogus = candidate({ id: 1, facets: { priority: 'critical', effort: null } });
  const high = candidate({ id: 2, facets: { priority: 'high', effort: null } });
  const result = rankNextToBuild([bogus, high]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1], 'an out-of-vocabulary priority must sort AFTER a real "high", not corrupt the order');
});

test('within the same priority band, a candidate that unblocks more other candidates ranks first', () => {
  const unblocksTwo = candidate({ id: 1, facets: { priority: 'high', effort: null } });
  const unblocksNone = candidate({ id: 2, facets: { priority: 'high', effort: null } });
  const blocker = candidate({ id: 3, facets: { priority: 'high', effort: null }, body: 'Blocked by #1' });
  const blocker2 = candidate({ id: 4, facets: { priority: 'high', effort: null }, body: 'Blocked by #1' });
  const result = rankNextToBuild([unblocksNone, unblocksTwo, blocker, blocker2]);
  assert.strictEqual(result[0].id, 1, 'id 1 unblocks 2 other candidates (ids 3 and 4) and must rank first among same-priority candidates');
});

test('within the same priority and unblocks-count, a candidate with no file overlap with another candidate ranks first', () => {
  const overlapping1 = candidate({ id: 1, facets: { priority: 'high', effort: null }, keyFiles: ['src/a.js'] });
  const overlapping2 = candidate({ id: 2, facets: { priority: 'high', effort: null }, keyFiles: ['src/a.js'] });
  const clean = candidate({ id: 3, facets: { priority: 'high', effort: null }, keyFiles: ['src/b.js'] });
  const result = rankNextToBuild([overlapping1, clean, overlapping2]);
  assert.strictEqual(result[0].id, 3, 'id 3 has no file overlap with any other candidate and must rank first among ties');
});

test('within the same priority/unblocks/overlap tier, lower effort ranks first', () => {
  const highEffort = candidate({ id: 1, facets: { priority: 'high', effort: 'high' } });
  const lowEffort = candidate({ id: 2, facets: { priority: 'high', effort: 'low' } });
  const result = rankNextToBuild([highEffort, lowEffort]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1]);
});

test('as the final tie-break, a candidate with an existing plan ranks first', () => {
  const noPlan = candidate({ id: 1, facets: { priority: 'high', effort: 'low' }, hasPlan: false });
  const hasPlan = candidate({ id: 2, facets: { priority: 'high', effort: 'low' }, hasPlan: true });
  const result = rankNextToBuild([noPlan, hasPlan]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1]);
});

test('unblocks-count only counts candidates within the same input array, and only exact-match blocker ids', () => {
  const target = candidate({ id: 5, facets: { priority: 'high', effort: null } });
  const otherTarget = candidate({ id: 6, facets: { priority: 'high', effort: null } });
  const blocksTarget = candidate({ id: 7, facets: { priority: 'high', effort: null }, body: 'Blocked by #5' });
  const blocksSomethingElse = candidate({ id: 8, facets: { priority: 'high', effort: null }, body: 'Blocked by #999' });
  const result = rankNextToBuild([target, otherTarget, blocksTarget, blocksSomethingElse]);
  assert.strictEqual(result[0].id, 5, 'id 5 is unblocked by one in-array candidate; id 6 by zero, so 5 ranks first among the priority:high tier');
});

test('a candidate with a real effort value ranks before a candidate with unset (null) effort', () => {
  const effortUnset = candidate({ id: 1, facets: { priority: 'high', effort: null } });
  const effortLow = candidate({ id: 2, facets: { priority: 'high', effort: 'low' } });
  const result = rankNextToBuild([effortUnset, effortLow]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1], 'a candidate with effort: "low" (band 0) must rank BEFORE one with effort: null (band 3), not after');
});
