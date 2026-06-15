'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recordRun, readRuns, computeChurn } = require('../../bin/lib/recon/cache');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-churn-'));
}

test('recordRun then readRuns round-trips fingerprints', () => {
  const root = tmpRoot();
  recordRun(root, '2026-06-14T100000', { fingerprints: ['fp-a', 'fp-b'], areasSwept: [] });
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 1);
  assert.deepStrictEqual(runs[0].fingerprints.sort(), ['fp-a', 'fp-b']);
});

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
