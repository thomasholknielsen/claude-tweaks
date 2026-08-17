const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeDescription } = require('../../../plugin/bin/lib/docs-health/fingerprint');

test('fingerprint returns a docshealth-<8hex> id', () => {
  const id = fingerprint({ assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'stated count is stale' });
  assert.match(id, /^docshealth-[0-9a-f]{8}$/);
});

test('fingerprint is stable across whitespace and case differences in description', () => {
  const a = fingerprint({ assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'Stale   Item Count' });
  const b = fingerprint({ assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'stale item count' });
  assert.strictEqual(a, b);
});

test('fingerprint differs when assetType, target, section, or description differs', () => {
  const base = { assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'stale count' };
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, assetType: 'other' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, target: 'guides/setup' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, section: 'Overview' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, description: 'different text' }));
});

test('normalizeDescription collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeDescription('  Foo   BAR  baz '), 'foo bar baz');
});
