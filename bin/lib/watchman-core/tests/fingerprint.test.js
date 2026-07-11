'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeText, fingerprintFromBasis } = require('../fingerprint');

test('normalizeText collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeText('  Foo   BAR  baz '), 'foo bar baz');
});

test('fingerprintFromBasis returns a <prefix>-<8hex> id', () => {
  const id = fingerprintFromBasis('someprefix', ['a', 'b', 'c']);
  assert.match(id, /^someprefix-[0-9a-f]{8}$/);
});

test('fingerprintFromBasis is stable for identical basis arrays', () => {
  assert.strictEqual(
    fingerprintFromBasis('p', ['a', 'b']),
    fingerprintFromBasis('p', ['a', 'b']),
  );
});

test('fingerprintFromBasis differs when the basis array differs', () => {
  assert.notStrictEqual(
    fingerprintFromBasis('p', ['a', 'b']),
    fingerprintFromBasis('p', ['a', 'c']),
  );
});

test('fingerprintFromBasis differs when the prefix differs, even with the same basis', () => {
  assert.notStrictEqual(
    fingerprintFromBasis('p1', ['a', 'b']),
    fingerprintFromBasis('p2', ['a', 'b']),
  );
});
