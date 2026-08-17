'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { requireNonEmptyStrings, validateRelatedSections } = require('../../../plugin/bin/lib/health-core/finding-validation');

// ── requireNonEmptyStrings ───────────────────────────────────────────────────

test('requireNonEmptyStrings returns [] when every field is a non-empty string', () => {
  const errors = requireNonEmptyStrings({ a: 'x', b: 'y' }, ['a', 'b']);
  assert.deepStrictEqual(errors, []);
});

test('requireNonEmptyStrings reports a missing field', () => {
  const errors = requireNonEmptyStrings({ a: 'x' }, ['a', 'b']);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /^b: required non-empty string/);
});

test('requireNonEmptyStrings reports a blank (whitespace-only) field', () => {
  const errors = requireNonEmptyStrings({ a: '   ' }, ['a']);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /^a: required non-empty string/);
});

test('requireNonEmptyStrings reports a non-string field', () => {
  const errors = requireNonEmptyStrings({ a: 42 }, ['a']);
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].includes('42'));
});

test('requireNonEmptyStrings reports one error per missing/blank field, in field order', () => {
  const errors = requireNonEmptyStrings({ a: '', c: 'ok' }, ['a', 'b', 'c']);
  assert.strictEqual(errors.length, 2);
  assert.match(errors[0], /^a:/);
  assert.match(errors[1], /^b:/);
});

// ── validateRelatedSections ──────────────────────────────────────────────────

test('validateRelatedSections returns [] when relatedSections is absent', () => {
  assert.deepStrictEqual(validateRelatedSections({}), []);
});

test('validateRelatedSections returns [] for a valid array of non-empty strings', () => {
  assert.deepStrictEqual(validateRelatedSections({ relatedSections: ['a', 'b'] }), []);
});

test('validateRelatedSections returns [] for an explicitly empty array', () => {
  assert.deepStrictEqual(validateRelatedSections({ relatedSections: [] }), []);
});

test('validateRelatedSections reports a non-array value', () => {
  const errors = validateRelatedSections({ relatedSections: 'not-an-array' });
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /^relatedSections:/);
});

test('validateRelatedSections reports an array containing a blank string', () => {
  const errors = validateRelatedSections({ relatedSections: ['ok', '  '] });
  assert.strictEqual(errors.length, 1);
});

test('validateRelatedSections reports an array containing a non-string', () => {
  const errors = validateRelatedSections({ relatedSections: ['ok', 5] });
  assert.strictEqual(errors.length, 1);
});

// Regression: this module is shared by harness-health/validate-finding.js,
// journey-health/validate-finding.js, and docs-health/validate-finding.js —
// previously two byte-identical blocks (the required-string loop and the
// relatedSections shape check) duplicated across all three files with zero
// require() calls tying them together.
test('requireNonEmptyStrings and validateRelatedSections back every consumer validate-finding.js', () => {
  const { validateFinding: harnessValidate } = require('../../../plugin/bin/lib/harness-health/validate-finding');
  const { validateFinding: journeyValidate } = require('../../../plugin/bin/lib/journey-health/validate-finding');
  const { validateFinding: docsValidate } = require('../../../plugin/bin/lib/docs-health/validate-finding');

  // A finding missing every required field must report the same error-shape
  // family (one "required non-empty string" error per missing field) in all
  // three domains, proving the shared loop is actually wired up.
  assert.ok(!harnessValidate({}).ok);
  assert.ok(harnessValidate({}).errors.some((e) => e.includes('required non-empty string')));
  assert.ok(!journeyValidate({}).ok);
  assert.ok(journeyValidate({}).errors.some((e) => e.includes('required non-empty string')));
  assert.ok(!docsValidate({}).ok);
  assert.ok(docsValidate({}).errors.some((e) => e.includes('required non-empty string')));
});
