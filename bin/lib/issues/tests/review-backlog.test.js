'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  splitScoredUnscored,
  filterCritical,
  rankRiskValue,
  filterCleanup,
  selectBudgetSlice,
  mergeUnsyncedRecords,
} = require('../review-backlog');

function record(overrides) {
  return {
    number: 1,
    title: 'untitled',
    createdAt: '2026-01-01T00:00:00Z',
    facets: { risk: null, effort: null, priority: null },
    ...overrides,
  };
}

test('splitScoredUnscored buckets by presence of both risk and effort', () => {
  const scored = record({ number: 1, facets: { risk: 'high', effort: 'low', priority: null } });
  const riskOnly = record({ number: 2, facets: { risk: 'high', effort: null, priority: null } });
  const unscored = record({ number: 3, facets: { risk: null, effort: null, priority: null } });
  const result = splitScoredUnscored([scored, riskOnly, unscored]);
  assert.deepStrictEqual(result.scored, [scored]);
  assert.deepStrictEqual(result.unscored, [riskOnly, unscored]);
});

test('filterCritical keeps only risk:high, sorted by priority band then oldest-first', () => {
  const high1 = record({ number: 1, createdAt: '2026-02-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: null } });
  const high2 = record({ number: 2, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: 'high' } });
  const medium = record({ number: 3, facets: { risk: 'medium', effort: 'low', priority: 'high' } });
  const result = filterCritical([high1, high2, medium]);
  assert.deepStrictEqual(result.map((r) => r.number), [2, 1]);
});

test('rankRiskValue sorts scored records by priority band then risk band then oldest-first, trailing unscored separately', () => {
  const a = record({ number: 1, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'low', effort: 'low', priority: 'high' } });
  const b = record({ number: 2, createdAt: '2026-01-02T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: 'high' } });
  const c = record({ number: 3, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: null } });
  const unscored1 = record({ number: 4, createdAt: '2026-01-05T00:00:00Z', facets: { risk: null, effort: null, priority: null } });
  const unscored2 = record({ number: 5, createdAt: '2026-01-03T00:00:00Z', facets: { risk: null, effort: null, priority: null } });
  const result = rankRiskValue([a, b, c, unscored1, unscored2]);
  assert.deepStrictEqual(result.ranked.map((r) => r.number), [2, 1, 3]);
  assert.deepStrictEqual(result.unscored.map((r) => r.number), [5, 4]);
});

test('filterCleanup keeps only effort:low, sorted by priority band then oldest-first', () => {
  const low1 = record({ number: 1, createdAt: '2026-02-01T00:00:00Z', facets: { risk: 'low', effort: 'low', priority: null } });
  const low2 = record({ number: 2, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'low', effort: 'low', priority: 'high' } });
  const highEffort = record({ number: 3, facets: { risk: 'low', effort: 'high', priority: 'high' } });
  const result = filterCleanup([low1, low2, highEffort]);
  assert.deepStrictEqual(result.map((r) => r.number), [2, 1]);
});

test('selectBudgetSlice picks the oldest N and reports an honest remaining count', () => {
  const records = [
    record({ number: 1, createdAt: '2026-01-03T00:00:00Z' }),
    record({ number: 2, createdAt: '2026-01-01T00:00:00Z' }),
    record({ number: 3, createdAt: '2026-01-02T00:00:00Z' }),
  ];
  const result = selectBudgetSlice(records, 2);
  assert.deepStrictEqual(result.selected.map((r) => r.number), [2, 3]);
  assert.strictEqual(result.remaining, 1);
});

test('selectBudgetSlice reports zero remaining when the budget covers everything', () => {
  const records = [record({ number: 1 }), record({ number: 2 })];
  const result = selectBudgetSlice(records, 5);
  assert.strictEqual(result.remaining, 0);
  assert.strictEqual(result.selected.length, 2);
});

test('mergeUnsyncedRecords concatenates github-first then unsynced, tagging facets.unsynced explicitly on both', () => {
  const githubRecord = record({
    number: 1,
    // parseRecordFacets never sets an `unsynced` key at all — simulate that shape.
    facets: { risk: 'low', effort: 'low', priority: null },
  });
  const unsyncedRecord = record({
    number: 2,
    facets: { risk: null, effort: null, priority: null, unsynced: true },
  });
  const result = mergeUnsyncedRecords([githubRecord], [unsyncedRecord]);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].number, 1);
  assert.strictEqual(result[0].facets.unsynced, false);
  assert.strictEqual(result[1].number, 2);
  assert.strictEqual(result[1].facets.unsynced, true);
});
