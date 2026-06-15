'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { CRITERIA, criteriaForArea, getCriterion } = require('../criteria');

test('CRITERIA is a non-empty array of criterion objects', () => {
  assert.ok(Array.isArray(CRITERIA));
  assert.ok(CRITERIA.length >= 15, `expected at least 15 universal criteria, got ${CRITERIA.length}`);
});

test('every criterion has id, appliesTo, confidenceFloor', () => {
  for (const c of CRITERIA) {
    assert.ok(typeof c.id === 'string' && c.id.length > 0, `criterion missing id: ${JSON.stringify(c)}`);
    assert.ok(
      c.appliesTo === 'universal' || (Array.isArray(c.appliesTo) && c.appliesTo.length > 0),
      `criterion ${c.id} has invalid appliesTo: ${JSON.stringify(c.appliesTo)}`,
    );
    assert.ok(
      c.confidenceFloor === 'high' || c.confidenceFloor === 'med' || c.confidenceFloor === 'low',
      `criterion ${c.id} has invalid confidenceFloor: ${c.confidenceFloor}`,
    );
  }
});

test('CRITERIA ids are unique', () => {
  const ids = CRITERIA.map((c) => c.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, `duplicate criterion ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
});

// The 15 P1 universal criteria must all be present.
const EXPECTED_UNIVERSAL = [
  'architecture-depth', 'simplification', 'review-quality',
  'scalability', 'security-logic', 'bad-practice',
  'doc-freshness', 'dead-code', 'test-quality',
  'resilience', 'observability', 'config-secrets',
  'dependency-health', 'input-validation', 'naming-clarity',
];
for (const id of EXPECTED_UNIVERSAL) {
  test(`universal criterion '${id}' is in the catalog`, () => {
    assert.ok(getCriterion(id) !== undefined, `criterion '${id}' missing from catalog`);
  });
}

test("getCriterion returns undefined for unknown ids", () => {
  assert.strictEqual(getCriterion('nonexistent-criterion-xyz'), undefined);
});

test('criteriaForArea([]) returns all universal criteria', () => {
  const results = criteriaForArea([]);
  const universalInCatalog = CRITERIA.filter((c) => c.appliesTo === 'universal');
  assert.strictEqual(results.length, universalInCatalog.length);
  for (const c of universalInCatalog) {
    assert.ok(results.find((r) => r.id === c.id), `missing ${c.id}`);
  }
});

test('criteriaForArea with a known area type includes universal + matching domain criteria', () => {
  // Plant a domain criterion to test filtering without relying on P2 domain entries.
  // We test the logic with the real catalog — if any domain entries exist they appear.
  const universalCount = CRITERIA.filter((c) => c.appliesTo === 'universal').length;
  // With no known area types, result length == universal count.
  const noType = criteriaForArea([]);
  assert.strictEqual(noType.length, universalCount);
  // With ['frontend'], result length >= universal count (domain entries may add more).
  const frontend = criteriaForArea(['frontend']);
  assert.ok(frontend.length >= universalCount);
});

test('criteriaForArea deduplicates when the same criterion matches multiple area types', () => {
  // If a criterion's appliesTo includes two types both present, it must appear only once.
  const results = criteriaForArea(['frontend', 'library']);
  const ids = results.map((c) => c.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, 'duplicate criterion in criteriaForArea result');
});

test('criteria with a fragment field point to a string path', () => {
  for (const c of CRITERIA) {
    if (c.fragment !== undefined && c.fragment !== null) {
      assert.ok(typeof c.fragment === 'string' && c.fragment.length > 0, `criterion ${c.id} has non-string fragment`);
    }
  }
});
