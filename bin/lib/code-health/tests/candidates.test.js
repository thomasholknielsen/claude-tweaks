'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { knownFocusValues, getFocusGenerator } = require('../candidates');

test('knownFocusValues includes dead-code', () => {
  assert.deepStrictEqual(knownFocusValues(), ['dead-code']);
});

test('getFocusGenerator("dead-code") returns a generator function and its pinned criterion', () => {
  const entry = getFocusGenerator('dead-code');
  assert.ok(entry, 'dead-code must be registered');
  assert.strictEqual(typeof entry.generator, 'function');
  assert.strictEqual(entry.criterion, 'dead-code');
});

test('getFocusGenerator returns null for an unrecognized focus value', () => {
  assert.strictEqual(getFocusGenerator('not-a-real-focus'), null);
});
