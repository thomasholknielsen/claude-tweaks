'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recordRun, computeChurn } = require('../runs');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'watchman-core-runs-')); }

test('recordRun writes a run file under the given runsDir', () => {
  const dir = path.join(tmp(), 'runs');
  const record = recordRun(dir, 'run-1', ['a', 'b']);
  assert.strictEqual(record.runId, 'run-1');
  assert.deepStrictEqual(record.fingerprints, ['a', 'b']);
  assert.ok(fs.existsSync(path.join(dir, 'run-1.json')));
});

test('recordRun creates the runsDir if it does not exist', () => {
  const dir = path.join(tmp(), 'nested', 'runs');
  recordRun(dir, 'run-1', ['a']);
  assert.ok(fs.existsSync(dir));
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
