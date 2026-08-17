'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeChurn } = require('../../../plugin/bin/lib/health-core/runs');

// recordRun/readRuns (local-disk run-log persistence) were removed by the
// durable-state migration — run history now lives on the health-state git
// branch (bin/lib/health-core/durable-state.js), read via
// readDurableState(root).runs, not from a local runsDir. recordRun had zero
// callers outside its own tests (harness-health, journey-health, and
// docs-health only ever import computeChurn from this module), so it was
// deleted rather than wired up.

test('runs module exports only computeChurn — recordRun was removed as dead code', () => {
  const runs = require('../../../plugin/bin/lib/health-core/runs');
  assert.deepStrictEqual(Object.keys(runs), ['computeChurn']);
});

test('computeChurn: no prior run treats every fingerprint as appeared, giving ratio 1', () => {
  const result = computeChurn(['a', 'b'], null);
  assert.deepStrictEqual(result.appeared, ['a', 'b']);
  assert.deepStrictEqual(result.disappeared, []);
  assert.strictEqual(result.ratio, 1);
});

test('computeChurn: identical current and prior gives ratio 0', () => {
  const prior = { fingerprints: ['a', 'b'] };
  assert.strictEqual(computeChurn(['a', 'b'], prior).ratio, 0);
});

test('computeChurn: complete turnover gives ratio 1', () => {
  const prior = { fingerprints: ['a', 'b'] };
  assert.strictEqual(computeChurn(['c', 'd'], prior).ratio, 1);
});

test('computeChurn: partial overlap gives a ratio between 0 and 1', () => {
  const prior = { fingerprints: ['a', 'b', 'c'] };
  const result = computeChurn(['b', 'c', 'd'], prior);
  assert.deepStrictEqual(result.appeared, ['d']);
  assert.deepStrictEqual(result.disappeared, ['a']);
  assert.strictEqual(result.ratio, 0.5);
});

test('computeChurn degrades gracefully instead of throwing when currentFps is malformed/missing — the same guard priorRun.fingerprints already had', () => {
  const prior = { fingerprints: ['a', 'b'] };
  assert.doesNotThrow(() => computeChurn(undefined, prior));
  const result = computeChurn(undefined, prior);
  assert.deepStrictEqual(result.appeared, []);
  assert.deepStrictEqual(result.disappeared, ['a', 'b']);
  assert.deepStrictEqual(result.stayed, []);
  assert.strictEqual(result.ratio, 1);
});
