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
  deriveCreatedAtFromGit,
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

test('bandOf/riskBandOf treat an out-of-vocabulary facet value like the null/absent case (band 3), never NaN', () => {
  // local-store.js's frontmatter parser accepts priority:/risk: values
  // verbatim with no enum check, so a hand-edited or future-taxonomy record
  // can carry a value outside PRIORITIES/TIERS. Before the fix, RANK['critical']
  // was undefined, and `undefined - 0` is NaN — a NaN-valued sort comparator
  // has spec-undefined ordering, so 'critical' could sort AHEAD of a real
  // 'high' record instead of behind it.
  const bogus = record({ number: 1, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: 'critical' } });
  const high = record({ number: 2, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: 'high' } });
  const result = filterCritical([bogus, high]);
  assert.deepStrictEqual(result.map((r) => r.number), [2, 1], 'an out-of-vocabulary priority must sort AFTER a real "high", not corrupt the order');
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

test('deriveCreatedAtFromGit resolves createdAt for every record from a SINGLE batched git-log call, not one call per record', () => {
  const calls = [];
  const execFn = (cmd) => {
    calls.push(cmd);
    return [
      '\x012026-01-05T12:00:00+00:00',
      'specs/1-foo.md',
      '',
      '\x012026-01-01T00:00:00+00:00',
      'specs/2-bar.md',
      'specs/1-foo.md',
      '',
    ].join('\n');
  };
  const records = [
    { number: 1, path: 'specs/1-foo.md' },
    { number: 2, path: 'specs/2-bar.md' },
  ];
  const result = deriveCreatedAtFromGit(records, { execFn });
  assert.strictEqual(calls.length, 1, 'must resolve every record from a single git-log invocation, not one per record');
  assert.match(calls[0], /^git log --name-only --format=/);
  assert.strictEqual(result[0].createdAt, '2026-01-05T12:00:00+00:00', 'must use the MOST RECENT commit touching the path (first-seen in newest-first git log order)');
  assert.strictEqual(result[0].number, 1);
  assert.strictEqual(result[1].createdAt, '2026-01-01T00:00:00+00:00');
});

test('deriveCreatedAtFromGit falls back to the current time for a record whose path never appears in the git-log history', () => {
  const execFn = () => '\x012026-01-01T00:00:00+00:00\nspecs/1-foo.md\n';
  const before = Date.now();
  const records = [{ number: 2, path: 'specs/2-missing.md' }];
  const result = deriveCreatedAtFromGit(records, { execFn });
  const after = Date.now();
  const fallbackTime = new Date(result[0].createdAt).getTime();
  assert.ok(fallbackTime >= before && fallbackTime <= after, 'createdAt should fall back to now()');
});

test('deriveCreatedAtFromGit falls back to the current time for every record when git log fails (no history / not a git repo)', () => {
  const execFn = () => {
    throw new Error('fatal: not a git repository');
  };
  const before = Date.now();
  const records = [{ number: 2, path: 'specs/2-bar.md' }];
  const result = deriveCreatedAtFromGit(records, { execFn });
  const after = Date.now();
  const fallbackTime = new Date(result[0].createdAt).getTime();
  assert.ok(fallbackTime >= before && fallbackTime <= after, 'createdAt should fall back to now()');
});

test('deriveCreatedAtFromGit falls back to the current time for every record when git log returns empty output', () => {
  const execFn = () => '   \n';
  const records = [{ number: 3, path: 'specs/3-baz.md' }];
  const result = deriveCreatedAtFromGit(records, { execFn });
  assert.ok(!Number.isNaN(new Date(result[0].createdAt).getTime()));
  assert.notStrictEqual(result[0].createdAt, '');
});

test('deriveCreatedAtFromGit preserves record order and does not mutate the input records', () => {
  const execFn = () => [
    '\x012026-02-02T00:00:00+00:00',
    'specs/2-bar.md',
    '',
    '\x012026-01-01T00:00:00+00:00',
    'specs/1-foo.md',
    '',
  ].join('\n');
  const records = [
    { number: 1, path: 'specs/1-foo.md' },
    { number: 2, path: 'specs/2-bar.md' },
  ];
  const result = deriveCreatedAtFromGit(records, { execFn });
  assert.deepStrictEqual(result.map((r) => r.number), [1, 2]);
  assert.strictEqual(records[0].createdAt, undefined, 'must not mutate the input record objects');
});

test('deriveCreatedAtFromGit returns [] immediately (no git call at all) for an empty records array', () => {
  const calls = [];
  const execFn = (cmd) => { calls.push(cmd); return ''; };
  assert.deepStrictEqual(deriveCreatedAtFromGit([], { execFn }), []);
  assert.strictEqual(calls.length, 0);
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
