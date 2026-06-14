'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { scoreAreas, MAX_STALE_DAYS } = require('../../bin/lib/recon/score');

const NOW = Date.parse('2026-06-14T00:00:00Z');

// Two areas: "hot" has recent churn + prior findings; "cold" is quiet.
const areas = [
  { id: 'src/api', path: 'src/api' },
  { id: 'src/util', path: 'src/util' },
];
const signals = {
  'src/api': { lastSweptMs: NOW - 2 * 86400000, churn: 30, loc: 4000, priorFindings: 8, fanIn: 12 },
  'src/util': { lastSweptMs: NOW - 1 * 86400000, churn: 1, loc: 200, priorFindings: 0, fanIn: 1 },
};

test('scoreAreas ranks the hot area first', () => {
  const ranked = scoreAreas(areas, signals, NOW);
  assert.strictEqual(ranked[0].id, 'src/api');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('scoreAreas returns every area with a numeric score', () => {
  const ranked = scoreAreas(areas, signals, NOW);
  assert.strictEqual(ranked.length, 2);
  for (const a of ranked) assert.strictEqual(typeof a.score, 'number');
});

test('round-robin floor boosts an area past MAX_STALE_DAYS over a fresh busy area', () => {
  const a = [
    { id: 'a/fresh-busy', path: 'a/fresh-busy' },
    { id: 'z/stale-quiet', path: 'z/stale-quiet' },
  ];
  const sig = {
    'a/fresh-busy': { lastSweptMs: NOW - 1 * 86400000, churn: 50, loc: 10000, priorFindings: 20, fanIn: 25 },
    // never swept → daysSinceSwept = Infinity → boosted
    'z/stale-quiet': { lastSweptMs: null, churn: 0, loc: 0, priorFindings: 0, fanIn: 0 },
  };
  const ranked = scoreAreas(a, sig, NOW);
  // staleness(1.0 weighted 0.30) + STALE_BOOST(1.0) = 1.30 beats a maxed-out fresh area (1.0)
  assert.strictEqual(ranked[0].id, 'z/stale-quiet');
});

test('MAX_STALE_DAYS is exported and positive', () => {
  assert.ok(MAX_STALE_DAYS > 0);
});
