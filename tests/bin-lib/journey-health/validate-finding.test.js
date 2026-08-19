const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../../../plugin/bin/lib/journey-health/validate-finding');

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

// ── relatedSections (bundled coverage findings) ──────────────────────────────

test('validateFinding: relatedSections is optional — absent is valid', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage' }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedSections, undefined);
});

test('validateFinding: relatedSections accepted on a coverage finding as an array of non-empty strings', () => {
  const result = validateFinding(validFinding({
    category: 'coverage', section: 'coverage',
    relatedSections: ['signup-flow: steps 2,3', 'login-flow: steps 4'],
  }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.relatedSections, ['signup-flow: steps 2,3', 'login-flow: steps 4']);
});

test('validateFinding: relatedSections fails when not an array', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage', relatedSections: 'signup-flow' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains an empty string', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage', relatedSections: ['signup-flow: steps 2,3', ''] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains a non-string entry', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage', relatedSections: ['signup-flow: steps 2,3', 7] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: a self-review (non-coverage) finding remains valid and unaffected by relatedSections', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
});
