'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { rankNextToBuild, blockersOf } = require('../../../bin/lib/issues/ranking');
const { parseRecordFacets } = require('../../../bin/lib/issues/record');

function candidate(overrides) {
  return {
    id: 1,
    facets: { priority: null, size: null },
    body: '',
    keyFiles: [],
    hasPlan: false,
    ...overrides,
  };
}

test('rankNextToBuild sorts by priority band first (high before medium before low before unset)', () => {
  const low = candidate({ id: 1, facets: { priority: 'low', size: null } });
  const high = candidate({ id: 2, facets: { priority: 'high', size: null } });
  const unset = candidate({ id: 3, facets: { priority: null, size: null } });
  const medium = candidate({ id: 4, facets: { priority: 'medium', size: null } });
  const result = rankNextToBuild([low, high, unset, medium]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 4, 1, 3]);
});

test('an out-of-vocabulary priority value sorts like unset (band 3), never NaN', () => {
  const bogus = candidate({ id: 1, facets: { priority: 'critical', size: null } });
  const high = candidate({ id: 2, facets: { priority: 'high', size: null } });
  const result = rankNextToBuild([bogus, high]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1], 'an out-of-vocabulary priority must sort AFTER a real "high", not corrupt the order');
});

test('within the same priority band, a candidate that unblocks more other candidates ranks first', () => {
  const unblocksTwo = candidate({ id: 1, facets: { priority: 'high', size: null } });
  const unblocksNone = candidate({ id: 2, facets: { priority: 'high', size: null } });
  const blocker = candidate({ id: 3, facets: { priority: 'high', size: null }, body: 'Blocked by #1' });
  const blocker2 = candidate({ id: 4, facets: { priority: 'high', size: null }, body: 'Blocked by #1' });
  const result = rankNextToBuild([unblocksNone, unblocksTwo, blocker, blocker2]);
  assert.strictEqual(result[0].id, 1, 'id 1 unblocks 2 other candidates (ids 3 and 4) and must rank first among same-priority candidates');
});

test('within the same priority and unblocks-count, a candidate with no file overlap with another candidate ranks first', () => {
  const overlapping1 = candidate({ id: 1, facets: { priority: 'high', size: null }, keyFiles: ['src/a.js'] });
  const overlapping2 = candidate({ id: 2, facets: { priority: 'high', size: null }, keyFiles: ['src/a.js'] });
  const clean = candidate({ id: 3, facets: { priority: 'high', size: null }, keyFiles: ['src/b.js'] });
  const result = rankNextToBuild([overlapping1, clean, overlapping2]);
  assert.strictEqual(result[0].id, 3, 'id 3 has no file overlap with any other candidate and must rank first among ties');
});

test('within the same priority/unblocks/overlap tier, smaller size ranks first', () => {
  const sizeHigh = candidate({ id: 1, facets: { priority: 'high', size: 'high' } });
  const sizeLow = candidate({ id: 2, facets: { priority: 'high', size: 'low' } });
  const result = rankNextToBuild([sizeHigh, sizeLow]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1]);
});

test('as the final tie-break, a candidate with an existing plan ranks first', () => {
  const noPlan = candidate({ id: 1, facets: { priority: 'high', size: 'low' }, hasPlan: false });
  const hasPlan = candidate({ id: 2, facets: { priority: 'high', size: 'low' }, hasPlan: true });
  const result = rankNextToBuild([noPlan, hasPlan]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1]);
});

test('unblocks-count only counts candidates within the same input array, and only exact-match blocker ids', () => {
  const target = candidate({ id: 5, facets: { priority: 'high', size: null } });
  const otherTarget = candidate({ id: 6, facets: { priority: 'high', size: null } });
  const blocksTarget = candidate({ id: 7, facets: { priority: 'high', size: null }, body: 'Blocked by #5' });
  const blocksSomethingElse = candidate({ id: 8, facets: { priority: 'high', size: null }, body: 'Blocked by #999' });
  const result = rankNextToBuild([target, otherTarget, blocksTarget, blocksSomethingElse]);
  assert.strictEqual(result[0].id, 5, 'id 5 is unblocked by one in-array candidate; id 6 by zero, so 5 ranks first among the priority:high tier');
});

test('a candidate with a real size value ranks before a candidate with unset (null) size', () => {
  const sizeUnset = candidate({ id: 1, facets: { priority: 'high', size: null } });
  const sizeLow = candidate({ id: 2, facets: { priority: 'high', size: 'low' } });
  const result = rankNextToBuild([sizeUnset, sizeLow]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1], 'a candidate with size: "low" (band 0) must rank BEFORE one with size: null (band 3), not after');
});

// --- real-parser coverage (record #217) ---
// Every candidate above hand-builds its `.facets`, so the effort -> size facet
// rename left this suite green while the size tie-break read an `undefined` key
// for every real candidate. This test routes labels through record.js's ACTUAL
// parseRecordFacets, so the next facet-key change fails here instead of shipping.
test('the size tie-break reads the facet key the real label parser writes', () => {
  const fromLabels = (id, labels) => ({ id, facets: parseRecordFacets(labels), body: '', keyFiles: [], hasPlan: false });

  // Scenario: two candidates identical on every earlier tie-break (same
  // priority, no dependencies between them, no shared keyFiles, no plan) and
  // separated only by their size label. The tie-break rule is low-size-first,
  // so #2 must lead — an expectation from the rule, not from running the sort.
  const large = fromLabels(1, ['priority:high', 'size:high']);
  const small = fromLabels(2, ['priority:high', 'size:low']);
  assert.deepStrictEqual(rankNextToBuild([large, small]).map((c) => c.id), [2, 1]);

  // record.js keeps a permanent read-side effort:* fallback for other repos'
  // records, so a legacy-labelled small candidate must lead the same way.
  const largeAgain = fromLabels(3, ['priority:high', 'size:high']);
  const legacySmall = fromLabels(4, ['priority:high', 'effort:low']);
  assert.deepStrictEqual(rankNextToBuild([largeAgain, legacySmall]).map((c) => c.id), [4, 3]);
});

// --- blockersOf precedence (record #514) ---

test('blockersOf: top-level blockedBy wins over body text when both present and disagree', () => {
  const c = { id: 1, blockedBy: [2], facets: {}, body: 'Blocked by #3' };
  assert.deepEqual(blockersOf(c), [2]);
});

test('blockersOf: no blockedBy key falls back to parseDependencies on the body', () => {
  const c = { id: 1, facets: {}, body: 'Blocked by #3\nsome text' };
  assert.deepEqual(blockersOf(c), [3]);
});

test('blockersOf: blockedBy [] is authoritative — no body fallback', () => {
  const c = { id: 1, blockedBy: [], facets: {}, body: 'Blocked by #3' };
  assert.deepEqual(blockersOf(c), []);
});

test('blockersOf: facets.blockedBy (local driver) used when top-level absent, and [] there is authoritative too', () => {
  assert.deepEqual(blockersOf({ id: 1, facets: { blockedBy: [7] }, body: 'Blocked by #3' }), [7]);
  assert.deepEqual(blockersOf({ id: 1, facets: { blockedBy: [] }, body: 'Blocked by #3' }), []);
});

test('rankNextToBuild: candidate with blockedBy [2] and body "Blocked by #3" ranks using blocker 2, not 3', () => {
  // Three candidates, same priority/size: 2 should gain the unblocks count (1 blocks on it), 3 should not.
  const candidates = [
    { id: 1, blockedBy: [2], facets: {}, body: 'Blocked by #3', keyFiles: [], hasPlan: false },
    { id: 2, facets: {}, body: '', keyFiles: [], hasPlan: false },
    { id: 3, facets: {}, body: '', keyFiles: [], hasPlan: false },
  ];
  const ranked = rankNextToBuild(candidates);
  assert.equal(ranked[0].id, 2); // unblocks 1 other candidate; 3 unblocks none
});

test('rankNextToBuild: no blockedBy keys — body parsing result unchanged (regression pin for /help)', () => {
  const candidates = [
    { id: 1, facets: {}, body: 'Blocked by #2', keyFiles: [], hasPlan: false },
    { id: 2, facets: {}, body: '', keyFiles: [], hasPlan: false },
  ];
  const ranked = rankNextToBuild(candidates);
  assert.equal(ranked[0].id, 2);
});
