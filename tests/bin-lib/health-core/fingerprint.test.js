'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeText, fingerprintFromBasis, createFingerprint } = require('../../../plugin/bin/lib/health-core/fingerprint');

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

test('createFingerprint: skillName dashes are stripped to build the id prefix', () => {
  const { fingerprint } = createFingerprint('journey-health', ['journey', 'category', 'section', 'description']);
  const id = fingerprint({ journey: 'checkout-flow', category: 'drift', section: 'self-review', description: 'x' });
  assert.match(id, /^journeyhealth-[0-9a-f]{8}$/);
});

test('createFingerprint: fingerprint pulls basis fields in the given order, normalizing description', () => {
  const { fingerprint } = createFingerprint('docs-health', ['assetType', 'target', 'section', 'description']);
  const a = fingerprint({ assetType: 'doc', target: 'guides/setup', section: 'Overview', description: 'Stale   Count' });
  const b = fingerprint({ assetType: 'doc', target: 'guides/setup', section: 'Overview', description: 'stale count' });
  assert.strictEqual(a, b);
  const c = fingerprint({ assetType: 'doc', target: 'guides/other', section: 'Overview', description: 'Stale   Count' });
  assert.notStrictEqual(a, c);
});

test('createFingerprint: two skills with the same basis fields still produce different ids (prefix isolation)', () => {
  const journey = createFingerprint('journey-health', ['assetType', 'target', 'section', 'description']);
  const docs = createFingerprint('docs-health', ['assetType', 'target', 'section', 'description']);
  const args = { assetType: 'doc', target: 'x', section: 'y', description: 'z' };
  assert.notStrictEqual(journey.fingerprint(args), docs.fingerprint(args));
});

test('createFingerprint: normalizeDescription is exposed and behaves like normalizeText', () => {
  const { normalizeDescription } = createFingerprint('journey-health', ['description']);
  assert.strictEqual(normalizeDescription('  Foo   BAR  baz '), 'foo bar baz');
});
