'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { refineWorklist, selectBudgetSlice } = require('../../../bin/lib/issues/backlog');

// Minimal faceted-record builder for refineWorklist cases — matches the
// shape refineWorklist reads: grants.{build,merge}, bot.{blocked,inProgress},
// priority, risk, size. createdAt matters only for the slicing tests, which
// need selectBudgetSlice's oldest-first ordering to be exercisable.
function rec(number, facetOverrides = {}, createdAt = '2026-01-01T00:00:00Z') {
  return {
    number,
    createdAt,
    facets: {
      grants: { build: false, merge: false },
      bot: { blocked: false, inProgress: false },
      priority: null,
      risk: null,
      size: null,
      ...facetOverrides,
    },
  };
}

test('refineWorklist: fresh/blocked/inProgress are mutually exclusive and jointly cover the ungranted readyRows', () => {
  const fresh = rec(1);
  const blocked = rec(2, { bot: { blocked: true, inProgress: false } });
  const inProgress = rec(3, { bot: { blocked: false, inProgress: true } });
  const readyRows = [fresh, blocked, inProgress];
  const result = refineWorklist({ allRows: readyRows, readyRows, priorityBudget: 10, grantBudget: 10 });

  assert.deepStrictEqual(result.fresh.map((r) => r.number), [1]);
  assert.deepStrictEqual(result.blocked.map((r) => r.number), [2]);
  assert.deepStrictEqual(result.inProgress.map((r) => r.number), [3]);

  const all = [...result.fresh, ...result.blocked, ...result.inProgress];
  assert.strictEqual(all.length, readyRows.length, 'the three lanes must jointly cover every ungranted readyRow');
  assert.strictEqual(new Set(all.map((r) => r.number)).size, all.length, 'the three lanes must be mutually exclusive');
});

test('refineWorklist: a record with both bot.blocked and bot.inProgress lands in blocked only', () => {
  const both = rec(1, { bot: { blocked: true, inProgress: true } });
  const result = refineWorklist({ allRows: [both], readyRows: [both], priorityBudget: 10, grantBudget: 10 });
  assert.deepStrictEqual(result.blocked.map((r) => r.number), [1]);
  assert.deepStrictEqual(result.inProgress, []);
  assert.deepStrictEqual(result.fresh, []);
});

test('refineWorklist: a granted record (build or merge) reaches no lane', () => {
  const grantedBuild = rec(1, { grants: { build: true, merge: false } });
  const grantedMerge = rec(2, { grants: { build: false, merge: true } });
  const readyRows = [grantedBuild, grantedMerge];
  const result = refineWorklist({ allRows: readyRows, readyRows, priorityBudget: 10, grantBudget: 10 });
  assert.deepStrictEqual(result.fresh, []);
  assert.deepStrictEqual(result.blocked, []);
  assert.deepStrictEqual(result.inProgress, []);
});

test('refineWorklist: a record with priority set but no risk/size appears in missingRiskSize only', () => {
  const r = rec(1, { priority: 'high', risk: null, size: null });
  const result = refineWorklist({ allRows: [r], readyRows: [], priorityBudget: 10, grantBudget: 10 });
  assert.deepStrictEqual(result.missingRiskSize.map((x) => x.number), [1]);
  assert.deepStrictEqual(result.missingPriority, []);
});

test('refineWorklist: a record with risk/size set but no priority appears in missingPriority only', () => {
  const r = rec(1, { priority: null, risk: 'high', size: 'low' });
  const result = refineWorklist({ allRows: [r], readyRows: [], priorityBudget: 10, grantBudget: 10 });
  assert.deepStrictEqual(result.missingPriority.map((x) => x.number), [1]);
  assert.deepStrictEqual(result.missingRiskSize, []);
});

test('refineWorklist: a record missing all three (priority, risk, size) appears in both missingPriority and missingRiskSize', () => {
  const r = rec(1, { priority: null, risk: null, size: null });
  const result = refineWorklist({ allRows: [r], readyRows: [], priorityBudget: 10, grantBudget: 10 });
  assert.deepStrictEqual(result.missingPriority.map((x) => x.number), [1]);
  assert.deepStrictEqual(result.missingRiskSize.map((x) => x.number), [1]);
});

test('refineWorklist: prioritySlice draws from missingPriority only — a priority-carrying record never enters it, regardless of scoring', () => {
  const missingPrio1 = rec(1, { priority: null, risk: 'high', size: 'low' }, '2026-01-03T00:00:00Z');
  const missingPrio2 = rec(2, { priority: null, risk: null, size: null }, '2026-01-01T00:00:00Z');
  const hasPriorityUnscored = rec(3, { priority: 'high', risk: null, size: null }, '2025-01-01T00:00:00Z');
  const allRows = [missingPrio1, missingPrio2, hasPriorityUnscored];
  const result = refineWorklist({ allRows, readyRows: [], priorityBudget: 10, grantBudget: 10 });

  assert.strictEqual(
    result.prioritySlice.selected.some((r) => r.number === 3),
    false,
    'a record that already carries priority must never enter prioritySlice, even though it is otherwise unscored'
  );
  assert.deepStrictEqual(result.prioritySlice.selected.map((r) => r.number).sort(), [1, 2]);
});

test('refineWorklist: prioritySlice/grantSlice remaining math matches selectBudgetSlice\'s directly', () => {
  const missingPrio = [rec(1, { priority: null }, '2026-01-03T00:00:00Z'), rec(2, { priority: null }, '2026-01-01T00:00:00Z'), rec(3, { priority: null }, '2026-01-02T00:00:00Z')];
  const freshRows = [rec(10, {}, '2026-01-02T00:00:00Z'), rec(11, {}, '2026-01-01T00:00:00Z')];
  const allRows = missingPrio;
  const readyRows = freshRows;
  const priorityBudget = 2;
  const grantBudget = 1;
  const result = refineWorklist({ allRows, readyRows, priorityBudget, grantBudget });

  const expectedPrioritySlice = selectBudgetSlice(missingPrio, priorityBudget);
  const expectedGrantSlice = selectBudgetSlice(freshRows, grantBudget);
  assert.deepStrictEqual(result.prioritySlice, expectedPrioritySlice);
  assert.deepStrictEqual(result.grantSlice, expectedGrantSlice);
  assert.strictEqual(result.prioritySlice.remaining, 1);
  assert.strictEqual(result.grantSlice.remaining, 1);
});

test('refineWorklist: omitting readyRows (work-backend: local-files) defaults it to [] — fresh/blocked/inProgress and grantSlice.selected come back empty while missingPriority/prioritySlice still compute from allRows', () => {
  const missingPrio = rec(1, { priority: null, risk: 'high', size: 'low' }, '2026-01-01T00:00:00Z');
  const hasPrio = rec(2, { priority: 'high', risk: null, size: null }, '2026-01-02T00:00:00Z');
  const allRows = [missingPrio, hasPrio];
  const result = refineWorklist({ allRows, priorityBudget: 10, grantBudget: 10 });

  assert.deepStrictEqual(result.fresh, []);
  assert.deepStrictEqual(result.blocked, []);
  assert.deepStrictEqual(result.inProgress, []);
  assert.deepStrictEqual(result.grantSlice.selected, []);
  assert.strictEqual(result.grantSlice.remaining, 0);
  assert.deepStrictEqual(result.missingPriority.map((r) => r.number), [1]);
  assert.deepStrictEqual(result.prioritySlice.selected.map((r) => r.number), [1]);
});

test('refineWorklist: counts has exactly the five expected keys, each equal to its array\'s length', () => {
  const readyRows = [
    rec(1),
    rec(2, { bot: { blocked: true, inProgress: false } }),
    rec(3, { bot: { blocked: false, inProgress: true } }),
    rec(4, { grants: { build: true, merge: false } }),
  ];
  const allRows = [
    ...readyRows,
    rec(5, { priority: null, risk: 'high', size: 'low' }),
    rec(6, { priority: 'high', risk: null, size: null }),
  ];
  const result = refineWorklist({ allRows, readyRows, priorityBudget: 10, grantBudget: 10 });

  assert.deepStrictEqual(Object.keys(result.counts).sort(), ['blocked', 'fresh', 'inProgress', 'missingPriority', 'missingRiskSize']);
  assert.strictEqual(result.counts.fresh, result.fresh.length);
  assert.strictEqual(result.counts.blocked, result.blocked.length);
  assert.strictEqual(result.counts.inProgress, result.inProgress.length);
  assert.strictEqual(result.counts.missingPriority, result.missingPriority.length);
  assert.strictEqual(result.counts.missingRiskSize, result.missingRiskSize.length);
});
