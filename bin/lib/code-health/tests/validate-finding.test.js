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
  const result = validateFinding(validFinding({ confidence: 'med' }));
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
  const result = validateFinding({ severity: 'urgent', confidence: 'med' });
  assert.strictEqual(result.ok, false);
  // Many required-string errors + two enum errors; should be well over 5.
  assert.ok(result.errors.length >= 5, `got ${result.errors.length}`);
});

test('validateFinding: coerces numeric line numbers in files to strings', () => {
  const result = validateFinding(validFinding({ files: ['a.ts', 7] }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.files, ['a.ts', '7']);
});

// ── v2 Finding shape ───────────────────────────────────────────────────────

const { validateFindingV2 } = require('../validate-finding');

function validV2Finding(overrides = {}) {
  return {
    criterion: 'simplification',
    areaId: 'src/api',
    anchor: 'src/api/user.js#getUser',
    severity: 'medium',
    confidence: 'high',
    likelihood: 'medium',
    effort: 'medium',
    title: 'getUser is a passthrough to the repository',
    evidence: 'src/api/user.js#getUser delegates directly to UserRepository.find with no added logic.',
    suggestedApproach: 'Inline the call at the call site, or add caching/auth in this method.',
    acceptance: 'getUser adds caching, authorization, or enrichment; or is removed and callers use the repository directly.',
    ...overrides,
  };
}

test('validateFindingV2: a complete v2 finding passes', () => {
  const result = validateFindingV2(validV2Finding());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('validateFindingV2: missing required field fails with a named error', () => {
  const f = validV2Finding();
  delete f.anchor;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('anchor')), result.errors.join('; '));
});

test('validateFindingV2: suggestedApproach is required (not suggestion)', () => {
  const f = validV2Finding();
  delete f.suggestedApproach;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('suggestedApproach')), result.errors.join('; '));
});

test('validateFindingV2: unknown criterion id fails', () => {
  const result = validateFindingV2(validV2Finding({ criterion: 'not-a-real-criterion' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('criterion') && e.includes('unknown')), result.errors.join('; '));
});

test('validateFindingV2: bad severity enum fails', () => {
  const result = validateFindingV2(validV2Finding({ severity: 'urgent' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity')));
});

test('validateFindingV2: bad confidence enum fails', () => {
  const result = validateFindingV2(validV2Finding({ confidence: 'med' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});

test('validateFindingV2: accumulates all errors in one pass', () => {
  const result = validateFindingV2({ severity: 'urgent', confidence: 'med' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length >= 5, `got ${result.errors.length}: ${result.errors.join('; ')}`);
});

test('validateFindingV2: valid result carries the original fields', () => {
  const f = validV2Finding();
  const result = validateFindingV2(f);
  assert.strictEqual(result.value.criterion, 'simplification');
  assert.strictEqual(result.value.anchor, 'src/api/user.js#getUser');
  assert.strictEqual(result.value.suggestedApproach, f.suggestedApproach);
  assert.strictEqual(result.value.acceptance, f.acceptance);
});

test('validateFinding (v1) still works after extending the module', () => {
  // Guard against accidentally breaking the v1 export.
  const { validateFinding: v1 } = require('../validate-finding');
  const f = {
    title: 'T', lens: 'todo-comments', category: 'Architecture',
    severity: 'low', confidence: 'high', area: 'src',
    files: ['src/a.js'], evidence: 'E', suggestion: 'S', acceptance: 'A',
    signature: 'sig',
  };
  const result = v1(f);
  assert.strictEqual(result.ok, true);
});

// ── relatedAnchors (bundled findings) ────────────────────────────────────────

test('validateFindingV2: relatedAnchors is optional — absent is valid', () => {
  const result = validateFindingV2(validV2Finding());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedAnchors, undefined);
});

test('validateFindingV2: relatedAnchors accepted when present as an array of non-empty strings', () => {
  const result = validateFindingV2(validV2Finding({
    relatedAnchors: ['src/api/other.js#getOther', 'src/api/third.js#getThird'],
  }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.relatedAnchors, ['src/api/other.js#getOther', 'src/api/third.js#getThird']);
});

test('validateFindingV2: relatedAnchors fails when not an array', () => {
  const result = validateFindingV2(validV2Finding({ relatedAnchors: 'src/api/other.js#getOther' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedAnchors')), result.errors.join('; '));
});

test('validateFindingV2: relatedAnchors fails when it contains an empty string', () => {
  const result = validateFindingV2(validV2Finding({ relatedAnchors: ['src/a.js#a', ''] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedAnchors')), result.errors.join('; '));
});

test('validateFindingV2: relatedAnchors fails when it contains a non-string entry', () => {
  const result = validateFindingV2(validV2Finding({ relatedAnchors: ['src/a.js#a', 42] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedAnchors')), result.errors.join('; '));
});

// ── likelihood / effort (schema unification) ────────────────────────────────

test('validateFindingV2: bad severity enum "critical" fails (dropped from the schema)', () => {
  const result = validateFindingV2(validV2Finding({ severity: 'critical' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity')), result.errors.join('; '));
});

test('validateFindingV2: likelihood is required', () => {
  const f = validV2Finding();
  delete f.likelihood;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('likelihood')), result.errors.join('; '));
});

test('validateFindingV2: bad likelihood enum fails', () => {
  const result = validateFindingV2(validV2Finding({ likelihood: 'certain' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('likelihood')), result.errors.join('; '));
});

test('validateFindingV2: effort is required', () => {
  const f = validV2Finding();
  delete f.effort;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('effort')), result.errors.join('; '));
});

test('validateFindingV2: bad effort enum fails', () => {
  const result = validateFindingV2(validV2Finding({ effort: 'huge' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('effort')), result.errors.join('; '));
});

test('validateFindingV2: valid result carries likelihood and effort', () => {
  const result = validateFindingV2(validV2Finding({ likelihood: 'high', effort: 'low' }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.likelihood, 'high');
  assert.strictEqual(result.value.effort, 'low');
});
