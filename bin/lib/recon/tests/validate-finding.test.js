'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { validateFinding } = require('../validate-finding');

// A complete, valid finding matching the Phase 1 Finding shape.
function validFinding(overrides = {}) {
  return {
    title: 'UserService.findById is a passthrough',
    lens: 'architecture-depth',
    category: 'Architecture',
    severity: 'medium',
    confidence: 'high',
    area: 'src/services',
    files: ['src/services/user-service.ts:42'],
    evidence: 'findById calls UserRepository.findById with no added logic.',
    suggestion: 'Inline the call or add the missing authorization check.',
    acceptance: 'The service method adds caching, auth, or enrichment, or is removed.',
    signature: 'passthrough UserService.findById',
    ...overrides,
  };
}

test('validateFinding: a complete finding passes', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('validateFinding: missing required field fails with a named error', () => {
  const f = validFinding();
  delete f.evidence;
  const result = validateFinding(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('evidence')), result.errors.join('; '));
});

test('validateFinding: empty-string required field fails', () => {
  const result = validateFinding(validFinding({ title: '   ' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('title')));
});

test('validateFinding: bad severity enum fails', () => {
  const result = validateFinding(validFinding({ severity: 'urgent' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity')), result.errors.join('; '));
});

test('validateFinding: bad confidence enum fails', () => {
  const result = validateFinding(validFinding({ confidence: 'medium' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});

test('validateFinding: bad category enum fails', () => {
  const result = validateFinding(validFinding({ category: 'Vibes' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category')));
});

test('validateFinding: files must be a non-empty array', () => {
  const empty = validateFinding(validFinding({ files: [] }));
  assert.strictEqual(empty.ok, false);
  assert.ok(empty.errors.some((e) => e.startsWith('files')));

  const notArray = validateFinding(validFinding({ files: 'a.ts:1' }));
  assert.strictEqual(notArray.ok, false);
  assert.ok(notArray.errors.some((e) => e.startsWith('files')));
});

test('validateFinding: accumulates all errors in one pass', () => {
  const result = validateFinding({ severity: 'urgent', confidence: 'medium' });
  assert.strictEqual(result.ok, false);
  // Many required-string errors + two enum errors; should be well over 5.
  assert.ok(result.errors.length >= 5, `got ${result.errors.length}`);
});

test('validateFinding: coerces numeric line numbers in files to strings', () => {
  const result = validateFinding(validFinding({ files: ['a.ts', 7] }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.files, ['a.ts', '7']);
});
