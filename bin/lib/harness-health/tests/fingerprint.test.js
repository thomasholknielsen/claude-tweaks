const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeDescription } = require('../fingerprint');

test('fingerprint returns a harnesshealth-<8hex> id', () => {
  const id = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.match(id, /^harnesshealth-[0-9a-f]{8}$/);
});

test('fingerprint is stable across whitespace and case differences in description', () => {
  const a = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'Stale   Example Path' });
  const b = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.strictEqual(a, b);
});

test('fingerprint differs when skill, section, or description differs', () => {
  const base = { skill: 'auth', section: 'Key Patterns', description: 'stale example' };
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, skill: 'billing' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, section: 'Anti-Patterns' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, description: 'different text' }));
});

test('normalizeDescription collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeDescription('  Foo   BAR  baz '), 'foo bar baz');
});
