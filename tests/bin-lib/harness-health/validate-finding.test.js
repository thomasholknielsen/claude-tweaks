const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../../../plugin/bin/lib/harness-health/validate-finding');

function validPatch(overrides = {}) {
  return {
    kind: 'patch',
    target: 'auth',
    assetType: 'skill',
    category: 'drift',
    section: 'Key Patterns',
    classification: 'additive',
    confidence: 'high',
    reversibility: 'high',
    description: 'Stale example path',
    oldString: 'See `src/auth/login.js`.',
    newString: 'See `src/auth/session.js`.',
    reason: 'login.js was renamed to session.js.',
    ...overrides,
  };
}

function validNewSkill(overrides = {}) {
  return {
    kind: 'new-skill',
    target: 'queue-retry-pattern',
    assetType: 'skill',
    category: 'drift',
    classification: 'additive',
    confidence: 'med',
    reversibility: 'high',
    description: 'Three files implement retry-with-backoff with no skill covering it',
    proposedBody: '---\nname: queue-retry-pattern\ndescription: Use when...\n---\n# Queue Retry Pattern',
    reason: 'src/jobs/a.js, b.js, c.js all implement the same pattern independently.',
    ...overrides,
  };
}

test('validateFinding accepts a well-formed patch finding', () => {
  const result = validateFinding(validPatch());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.target, 'auth');
});

test('validateFinding accepts assetType: design-artifact', () => {
  const result = validateFinding(validPatch({ assetType: 'design-artifact', target: 'PRODUCT', section: 'Freshness' }));
  assert.strictEqual(result.ok, true);
});

test('validateFinding accepts a well-formed new-skill finding', () => {
  const result = validateFinding(validNewSkill());
  assert.strictEqual(result.ok, true);
});

test('validateFinding rejects a non-object', () => {
  const result = validateFinding(null);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('validateFinding rejects a missing required string field', () => {
  const bad = validPatch();
  delete bad.description;
  const result = validateFinding(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('description:')));
});

test('validateFinding rejects an unknown kind', () => {
  const result = validateFinding(validPatch({ kind: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('kind:')));
});

test('validateFinding rejects an unknown assetType', () => {
  const result = validateFinding(validPatch({ assetType: 'agent' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('assetType:')));
});

test('validateFinding rejects an unknown category', () => {
  const result = validateFinding(validPatch({ category: 'vibes' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category:')));
});

test('validateFinding rejects an unknown classification/confidence/reversibility', () => {
  assert.strictEqual(validateFinding(validPatch({ classification: 'huge' })).ok, false);
  assert.strictEqual(validateFinding(validPatch({ confidence: 'super' })).ok, false);
  assert.strictEqual(validateFinding(validPatch({ reversibility: 'meh' })).ok, false);
});

test('validateFinding rejects a patch finding missing section, oldString, or newString', () => {
  const noSection = validPatch(); delete noSection.section;
  assert.strictEqual(validateFinding(noSection).ok, false);

  const noOld = validPatch(); delete noOld.oldString;
  assert.strictEqual(validateFinding(noOld).ok, false);

  const noNew = validPatch({ newString: '' });
  assert.strictEqual(validateFinding(noNew).ok, false);
});

test('validateFinding accepts an empty oldString for a pure addition', () => {
  const result = validateFinding(validPatch({ oldString: '' }));
  assert.strictEqual(result.ok, true);
});

test('validateFinding rejects a new-skill finding missing proposedBody', () => {
  const bad = validNewSkill(); delete bad.proposedBody;
  const result = validateFinding(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('proposedBody:')));
});

test('validateFinding accepts assetType: memory', () => {
  const result = validateFinding(validPatch({ assetType: 'memory', target: 'design-feedback-style' }));
  assert.strictEqual(result.ok, true);
});

// ── relatedSections (bundled findings) ───────────────────────────────────────

test('validateFinding: relatedSections is optional — absent is valid', () => {
  const result = validateFinding(validPatch());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedSections, undefined);
});

test('validateFinding: relatedSections accepted on a patch finding as an array of non-empty strings', () => {
  const result = validateFinding(validPatch({ relatedSections: ['Key Patterns', 'Overview'] }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.relatedSections, ['Key Patterns', 'Overview']);
});

test('validateFinding: relatedSections fails when not an array', () => {
  const result = validateFinding(validPatch({ relatedSections: 'Key Patterns' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains an empty string', () => {
  const result = validateFinding(validPatch({ relatedSections: ['Key Patterns', ''] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains a non-string entry', () => {
  const result = validateFinding(validPatch({ relatedSections: ['Key Patterns', 1] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: a new-skill finding remains valid and unaffected by relatedSections', () => {
  const result = validateFinding(validNewSkill());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedSections, undefined);
});

// --- intent: "remove" (rule expiry) -----------------------------------------
// A removal is the one finding shape allowed an empty newString. These tests
// pin both directions: the shape is accepted where it is safe, and the empty
// newString it unlocks cannot leak into any other finding shape.

function validRemoval(overrides = {}) {
  return {
    kind: 'patch',
    target: 'CLAUDE',
    assetType: 'claude-md',
    category: 'drift',
    section: "Don'ts",
    intent: 'remove',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'high',
    description: 'Rule guards against a hazard that can no longer occur',
    oldString: "- Don't call the legacy exporter directly `[IL-23]`",
    newString: '',
    reason: 'bin/lib/legacy-exporter.js was deleted in a1b2c3d; nothing can call it.',
    ...overrides,
  };
}

test('validateFinding accepts a well-formed removal finding', () => {
  const result = validateFinding(validRemoval());
  assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
  assert.strictEqual(result.value.intent, 'remove');
  assert.strictEqual(result.value.newString, '');
});

test('validateFinding rejects a removal outside CLAUDE.md (no auto-apply guarantee there)', () => {
  for (const assetType of ['skill', 'rule', 'design-artifact', 'memory']) {
    const result = validateFinding(validRemoval({ assetType }));
    assert.strictEqual(result.ok, false, `expected ${assetType} removal to be rejected`);
    assert.ok(
      result.errors.some((e) => e.includes('only valid for assetType "claude-md"')),
      `expected assetType error for ${assetType}, got ${JSON.stringify(result.errors)}`,
    );
  }
});

test('validateFinding rejects a removal that also supplies replacement text', () => {
  const result = validateFinding(validRemoval({ newString: 'something else' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('must be exactly ""')), JSON.stringify(result.errors));
});

test('validateFinding rejects a removal classified as additive', () => {
  const result = validateFinding(validRemoval({ classification: 'additive' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('never additive')), JSON.stringify(result.errors));
});

test('validateFinding rejects a removal with no oldString to identify what is being deleted', () => {
  for (const oldString of ['', '   ']) {
    const result = validateFinding(validRemoval({ oldString }));
    assert.strictEqual(result.ok, false, `expected empty oldString ${JSON.stringify(oldString)} to be rejected`);
    assert.ok(
      result.errors.some((e) => e.includes('oldString must be the non-empty verbatim content')),
      JSON.stringify(result.errors),
    );
  }
});

test('validateFinding rejects an unrecognised intent value', () => {
  const result = validateFinding(validRemoval({ intent: 'delete' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('intent:')), JSON.stringify(result.errors));
});

test('validateFinding rejects a removal that is not a patch', () => {
  const result = validateFinding(validRemoval({ kind: 'new-skill', proposedBody: 'x' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('requires kind "patch"')), JSON.stringify(result.errors));
});

test('the empty-newString guard still holds for ordinary patch findings', () => {
  // Regression guard: adding removal support must not let a malformed finding
  // (model returned nothing for newString) through on a normal patch.
  for (const newString of ['', '   ']) {
    const result = validateFinding(validPatch({ newString }));
    assert.strictEqual(result.ok, false, `expected newString ${JSON.stringify(newString)} to be rejected`);
    assert.ok(
      result.errors.some((e) => e.includes('required non-empty string when kind is "patch"')),
      JSON.stringify(result.errors),
    );
  }
});

test('a claude-md patch without intent still requires a non-empty newString', () => {
  const result = validateFinding(validRemoval({ intent: undefined, classification: 'additive' }));
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('required non-empty string when kind is "patch"')),
    JSON.stringify(result.errors),
  );
});
