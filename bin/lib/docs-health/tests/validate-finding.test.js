const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../validate-finding');

function validFinding(overrides = {}) {
  return {
    target: 'decisions/0007-foo',
    assetType: 'doc',
    section: 'Freshness',
    category: 'staleness',
    misleads: 'agent',
    classification: 'additive',
    confidence: 'high',
    reversibility: 'high',
    description: 'Stated skill count is stale',
    oldString: 'This project ships 12 skills.',
    newString: 'This project ships 14 skills.',
    reason: 'A live count of skills/*/SKILL.md returns 14, not 12.',
    ...overrides,
  };
}

test('validateFinding accepts a well-formed finding', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.target, 'decisions/0007-foo');
});

test('validateFinding rejects a non-object', () => {
  const result = validateFinding(null);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('validateFinding rejects a missing required string field', () => {
  const bad = validFinding();
  delete bad.reason;
  const result = validateFinding(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('reason:')));
});

test('validateFinding rejects an unknown assetType', () => {
  const result = validateFinding(validFinding({ assetType: 'skill' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('assetType:')));
});

test('validateFinding rejects an unknown category', () => {
  const result = validateFinding(validFinding({ category: 'vibes' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category:')));
});

test('validateFinding rejects an unknown misleads value', () => {
  const result = validateFinding(validFinding({ misleads: 'robot' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('misleads:')));
});

test('validateFinding accepts misleads: human, agent, or both', () => {
  assert.strictEqual(validateFinding(validFinding({ misleads: 'human' })).ok, true);
  assert.strictEqual(validateFinding(validFinding({ misleads: 'agent' })).ok, true);
  assert.strictEqual(validateFinding(validFinding({ misleads: 'both' })).ok, true);
});

test('validateFinding rejects an unknown classification/confidence/reversibility', () => {
  assert.strictEqual(validateFinding(validFinding({ classification: 'huge' })).ok, false);
  assert.strictEqual(validateFinding(validFinding({ confidence: 'super' })).ok, false);
  assert.strictEqual(validateFinding(validFinding({ reversibility: 'meh' })).ok, false);
});

test('validateFinding rejects a finding missing section, oldString, or newString', () => {
  const noSection = validFinding(); delete noSection.section;
  assert.strictEqual(validateFinding(noSection).ok, false);

  const noOld = validFinding(); delete noOld.oldString;
  assert.strictEqual(validateFinding(noOld).ok, false);

  const noNew = validFinding({ newString: '' });
  assert.strictEqual(validateFinding(noNew).ok, false);
});

test('validateFinding accepts an empty oldString for a pure addition', () => {
  const result = validateFinding(validFinding({ oldString: '' }));
  assert.strictEqual(result.ok, true);
});

test('validateFinding accepts category: genre-drift', () => {
  const result = validateFinding(validFinding({
    category: 'genre-drift',
    section: 'Overview',
    description: 'Reference doc is actually a how-to walkthrough',
  }));
  assert.strictEqual(result.ok, true);
});

test('validateFinding accepts category: depth-mismatch', () => {
  const result = validateFinding(validFinding({
    category: 'depth-mismatch',
    section: 'Overview',
    description: 'Overview-implied doc is actually dense reference-depth content',
  }));
  assert.strictEqual(result.ok, true);
});
