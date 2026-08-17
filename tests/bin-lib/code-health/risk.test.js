'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeRisk } = require('../../../plugin/bin/lib/code-health/risk');

const CASES = [
  // [severity, likelihood, expectedRisk]
  ['low', 'low', 'low'],
  ['low', 'medium', 'low'],
  ['low', 'high', 'medium'],
  ['medium', 'low', 'low'],
  ['medium', 'medium', 'medium'],
  ['medium', 'high', 'high'],
  ['high', 'low', 'medium'],
  ['high', 'medium', 'high'],
  ['high', 'high', 'high'],
];

for (const [severity, likelihood, expected] of CASES) {
  test(`computeRisk(${severity}, ${likelihood}) === ${expected}`, () => {
    assert.strictEqual(computeRisk(severity, likelihood), expected);
  });
}

test('computeRisk is pure — same inputs always produce the same output', () => {
  const a = computeRisk('medium', 'high');
  const b = computeRisk('medium', 'high');
  assert.strictEqual(a, b);
  assert.strictEqual(a, 'high');
});

test('computeRisk throws on an unrecognized severity value', () => {
  assert.throws(() => computeRisk('critical', 'medium'), /severity/i);
});

test('computeRisk throws on an unrecognized likelihood value', () => {
  assert.throws(() => computeRisk('medium', 'certain'), /likelihood/i);
});

// Regression: `severity in SCORE` also matches inherited Object.prototype
// property names, not just SCORE's own low/medium/high keys — a bug where
// a malformed value would silently coerce to NaN and bucket() would fall
// through to 'high' instead of the documented throw.
test('computeRisk throws on an inherited Object.prototype property name used as severity ("toString")', () => {
  assert.throws(() => computeRisk('toString', 'high'), /severity/i);
});

test('computeRisk throws on an inherited Object.prototype property name used as likelihood ("constructor")', () => {
  assert.throws(() => computeRisk('high', 'constructor'), /likelihood/i);
});

test('computeRisk throws on "hasOwnProperty" itself used as severity', () => {
  assert.throws(() => computeRisk('hasOwnProperty', 'low'), /severity/i);
});
