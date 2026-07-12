const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../validate-finding');

function validFinding(overrides = {}) {
  return {
    journey: 'checkout-flow',
    category: 'drift',
    section: 'self-review',
    description: 'Persona is a placeholder',
    reason: 'Step 2 says "User clicks Buy" with no named persona',
    confidence: 'high',
    severity: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}

test('validateFinding accepts a complete valid finding', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.journey, 'checkout-flow');
});

test('validateFinding rejects a non-object', () => {
  assert.strictEqual(validateFinding(null).ok, false);
  assert.strictEqual(validateFinding('x').ok, false);
});

test('validateFinding rejects a missing required string', () => {
  const f = validFinding();
  delete f.reason;
  const result = validateFinding(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('reason:')));
});

test('validateFinding rejects an invalid category', () => {
  const result = validateFinding(validFinding({ category: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category:')));
});

test('validateFinding rejects an invalid section', () => {
  const result = validateFinding(validFinding({ section: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('section:')));
});

test('validateFinding rejects an invalid confidence', () => {
  const result = validateFinding(validFinding({ confidence: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence:')));
});

test('validateFinding accepts all three valid categories', () => {
  for (const category of ['drift', 'coverage', 'regression-suspected']) {
    assert.strictEqual(validateFinding(validFinding({ category })).ok, true, category);
  }
});

test('validateFinding rejects an invalid severity', () => {
  const result = validateFinding(validFinding({ severity: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity:')));
});
