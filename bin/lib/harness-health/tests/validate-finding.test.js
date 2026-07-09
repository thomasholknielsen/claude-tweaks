const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../validate-finding');

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
