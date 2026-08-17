'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeChurn } = require('../../plugin/bin/lib/code-health/cache');

// recordRun/readRuns (local-disk run-log persistence) were removed by the
// health-state migration — run history now lives on the durable health-state
// branch (bin/lib/health-core/durable-state.js). See
// bin/lib/code-health/tests/churn-v2.test.js for real, gh-free coverage of
// the durable read path (a locally-seeded health-state branch) and
// bin/lib/health-core/tests/durable-state.test.js for the write mechanics
// (fake-runner). computeChurn itself is a pure function, unaffected by the
// migration — the tests below still exercise it directly.

test('computeChurn uses union denominator — complete turnover is ratio 1.0', () => {
  const c = computeChurn(['fp-c', 'fp-d'], { fingerprints: ['fp-a', 'fp-b'] });
  // appeared 2 + disappeared 2 = 4; union {a,b,c,d} = 4; 4/4 = 1.0
  assert.strictEqual(c.ratio, 1);
  assert.deepStrictEqual(c.appeared.sort(), ['fp-c', 'fp-d']);
  assert.deepStrictEqual(c.disappeared.sort(), ['fp-a', 'fp-b']);
});

test('computeChurn partial overlap', () => {
  const c = computeChurn(['fp-a', 'fp-c'], { fingerprints: ['fp-a', 'fp-b'] });
  // appeared {c} 1 + disappeared {b} 1 = 2; union {a,b,c} = 3; 2/3 ≈ 0.667
  assert.strictEqual(c.ratio, 0.667);
  assert.deepStrictEqual(c.stayed, ['fp-a']);
});

test('computeChurn with no prior run is ratio 1.0 (everything appeared)', () => {
  const c = computeChurn(['fp-a'], null);
  assert.strictEqual(c.ratio, 1);
});
