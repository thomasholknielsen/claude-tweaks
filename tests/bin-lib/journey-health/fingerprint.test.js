const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeDescription } = require('../../../plugin/bin/lib/journey-health/fingerprint');

test('fingerprint is stable for identical input', () => {
  const args = { journey: 'checkout-flow', category: 'drift', section: 'self-review', description: 'Persona is a placeholder' };
  assert.strictEqual(fingerprint(args), fingerprint(args));
});

test('fingerprint differs when journey differs', () => {
  const base = { category: 'drift', section: 'self-review', description: 'x' };
  assert.notStrictEqual(
    fingerprint({ ...base, journey: 'checkout-flow' }),
    fingerprint({ ...base, journey: 'signup-flow' }),
  );
});

test('fingerprint is stable across cosmetic rewording (whitespace/case)', () => {
  const base = { journey: 'checkout-flow', category: 'drift', section: 'self-review' };
  const a = fingerprint({ ...base, description: 'Persona is a placeholder' });
  const b = fingerprint({ ...base, description: '  persona   IS a Placeholder  ' });
  assert.strictEqual(a, b);
});

test('fingerprint starts with the journeyhealth- prefix', () => {
  const fp = fingerprint({ journey: 'checkout-flow', category: 'drift', section: 'self-review', description: 'x' });
  assert.match(fp, /^journeyhealth-[0-9a-f]{8}$/);
});

test('normalizeDescription collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeDescription('  Foo   Bar  '), 'foo bar');
});
