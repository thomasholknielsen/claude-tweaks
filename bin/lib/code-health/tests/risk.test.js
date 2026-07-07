'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeRisk } = require('../risk');

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
