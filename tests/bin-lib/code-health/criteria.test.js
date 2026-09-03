'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { CRITERIA, criteriaForArea, getCriterion } = require('../../../plugin/bin/lib/code-health/criteria');

test('CRITERIA is a non-empty array of criterion objects', () => {
  assert.ok(Array.isArray(CRITERIA));
  assert.ok(CRITERIA.length >= 15, `expected at least 15 catalog entries, got ${CRITERIA.length}`);
});

test('every criterion has id, appliesTo, confidenceFloor', () => {
  for (const c of CRITERIA) {
    assert.ok(typeof c.id === 'string' && c.id.length > 0, `criterion missing id: ${JSON.stringify(c)}`);
    assert.ok(
      c.appliesTo === 'universal' || (Array.isArray(c.appliesTo) && c.appliesTo.length > 0),
      `criterion ${c.id} has invalid appliesTo: ${JSON.stringify(c.appliesTo)}`,
    );
    assert.ok(
      c.confidenceFloor === 'high' || c.confidenceFloor === 'medium' || c.confidenceFloor === 'low',
      `criterion ${c.id} has invalid confidenceFloor: ${c.confidenceFloor}`,
    );
  }
});

test('CRITERIA ids are unique', () => {
  const ids = CRITERIA.map((c) => c.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, `duplicate criterion ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
});

// These core criteria must all be present in the catalog. Presence only —
// four of them (see AREA_GATED below) are area-gated rather than universal,
// so do not read this list as "the universal set".
const EXPECTED_CATALOG_IDS = [
  'architecture-depth', 'simplification', 'review-quality',
  'scalability', 'security-logic', 'bad-practice',
  'doc-freshness', 'dead-code', 'test-quality',
  'resilience', 'observability', 'config-secrets',
  'dependency-health', 'input-validation', 'naming-clarity',
  'missing-tests',
];
for (const id of EXPECTED_CATALOG_IDS) {
  test(`core criterion '${id}' is in the catalog`, () => {
    assert.ok(getCriterion(id) !== undefined, `criterion '${id}' missing from catalog`);
  });
}

test("getCriterion returns undefined for unknown ids", () => {
  assert.strictEqual(getCriterion('nonexistent-criterion-xyz'), undefined);
});

// Literal on purpose. Deriving this by filtering CRITERIA for
// `appliesTo === 'universal'` would reuse the implementation's own predicate as
// the oracle, so the test could not distinguish "correct" from "merely
// self-consistent" — it would pass even if a criterion were wrongly reclassified.
const UNIVERSAL_IDS = [
  'architecture-depth', 'simplification', 'review-quality',
  'bad-practice', 'doc-freshness', 'dead-code', 'test-quality',
  'config-secrets', 'dependency-health', 'input-validation', 'naming-clarity',
];

test('criteriaForArea([]) returns exactly the universal criteria', () => {
  const resultIds = criteriaForArea([]).map((c) => c.id).sort();
  assert.deepStrictEqual(resultIds, [...UNIVERSAL_IDS].sort());
});

test('criteriaForArea with a known area type includes universal + matching domain criteria', () => {
  // Counts anchored to the literal UNIVERSAL_IDS list, not to a re-derivation of
  // the implementation's own `appliesTo === 'universal'` predicate.
  assert.strictEqual(criteriaForArea([]).length, UNIVERSAL_IDS.length);
  // A known area type strictly adds area-gated criteria on top of the universal set.
  const frontendIds = criteriaForArea(['frontend']).map((c) => c.id);
  assert.ok(frontendIds.length > UNIVERSAL_IDS.length);
  for (const id of UNIVERSAL_IDS) {
    assert.ok(frontendIds.includes(id), `frontend slice must still include universal '${id}'`);
  }
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

// P2 — domain criteria and area filtering

test('domain criterion a11y is returned for frontend areas', () => {
  const results = criteriaForArea(['frontend']);
  assert.ok(results.some((c) => c.id === 'a11y'), 'a11y must appear for frontend');
});

test('domain criterion a11y is NOT returned for backend-only areas', () => {
  const results = criteriaForArea(['backend']);
  assert.ok(!results.some((c) => c.id === 'a11y'), 'a11y must not appear for backend');
});

test('domain criterion api-stability appears for library and backend', () => {
  const libResults = criteriaForArea(['library']);
  assert.ok(libResults.some((c) => c.id === 'api-stability'), 'api-stability must appear for library');
  const beResults = criteriaForArea(['backend']);
  assert.ok(beResults.some((c) => c.id === 'api-stability'), 'api-stability must appear for backend');
});

test('domain criterion migration-safety appears only for data areas', () => {
  assert.ok(criteriaForArea(['data']).some((c) => c.id === 'migration-safety'));
  assert.ok(!criteriaForArea(['frontend']).some((c) => c.id === 'migration-safety'));
});

test('domain criterion iac-security appears only for infra areas', () => {
  assert.ok(criteriaForArea(['infra']).some((c) => c.id === 'iac-security'));
  assert.ok(!criteriaForArea(['backend']).some((c) => c.id === 'iac-security'));
});

test('domain criterion privacy-pii appears for frontend, backend, and data', () => {
  for (const t of ['frontend', 'backend', 'data']) {
    assert.ok(criteriaForArea([t]).some((c) => c.id === 'privacy-pii'),
      `privacy-pii must appear for ${t}`);
  }
  assert.ok(!criteriaForArea(['infra']).some((c) => c.id === 'privacy-pii'));
});

test('domain criterion concurrency appears for backend, cli, and data', () => {
  for (const t of ['backend', 'cli', 'data']) {
    assert.ok(criteriaForArea([t]).some((c) => c.id === 'concurrency'),
      `concurrency must appear for ${t}`);
  }
  assert.ok(!criteriaForArea(['frontend']).some((c) => c.id === 'concurrency'));
});

test('criteriaForArea with empty types excludes every area-gated and domain criterion', () => {
  // Asserts the negative that the positive test above cannot: nothing gated
  // leaks into an unknown/non-code slice. Literal lists, no re-derivation.
  const ids = criteriaForArea([]).map((c) => c.id);
  const MUST_BE_ABSENT = [
    'scalability', 'security-logic', 'resilience', 'observability',
    'a11y', 'i18n', 'api-stability', 'migration-safety',
    'iac-security', 'privacy-pii', 'concurrency',
  ];
  for (const id of MUST_BE_ABSENT) {
    assert.ok(!ids.includes(id), `'${id}' must not load for an unknown/non-code slice`);
  }
});

test('multi-type area gets union of universal + all matching domain criteria', () => {
  // frontend+library => a11y + api-stability both appear
  const results = criteriaForArea(['frontend', 'library']);
  assert.ok(results.some((c) => c.id === 'a11y'));
  assert.ok(results.some((c) => c.id === 'api-stability'));
  // No duplicates
  const ids = results.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate criteria in result');
});

test('each domain criterion has a confidenceFloor', () => {
  const domainIds = ['a11y', 'i18n', 'api-stability', 'migration-safety', 'iac-security', 'privacy-pii', 'concurrency'];
  for (const id of domainIds) {
    const c = getCriterion(id);
    assert.ok(c, `getCriterion('${id}') must return a criterion`);
    assert.ok(['low', 'medium', 'high'].includes(c.confidenceFloor),
      `${id}.confidenceFloor must be 'low'|'medium'|'high', got ${c.confidenceFloor}`);
  }
});

test('noisy criteria a11y, iac-security, migration-safety, privacy-pii have confidenceFloor high', () => {
  for (const id of ['a11y', 'iac-security', 'migration-safety', 'privacy-pii']) {
    const c = getCriterion(id);
    assert.strictEqual(c.confidenceFloor, 'high', `${id}.confidenceFloor must be 'high'`);
  }
});

test('security-logic criterion has confidenceFloor high', () => {
  const c = getCriterion('security-logic');
  assert.strictEqual(c.confidenceFloor, 'high');
});

// ── #99 — area-gating for the four non-core criteria ────────────────────────
// These four used to be `appliesTo: 'universal'`, so every slice paid for their
// fragments (a 19,445 B floor). They are now gated the same way domain criteria
// are. The three genuinely-universal criteria below are deliberately left alone.

// The three runtime-dependent criteria share one gate; security-logic is gated
// wider (it also covers frontend and library) because security is cross-cutting
// rather than runtime-dependent. Keep the two sets distinct on purpose.
const RUNTIME_GATED = ['scalability', 'resilience', 'observability'];
const RUNTIME_TYPES = ['backend', 'data', 'cli', 'infra'];
const SECURITY_TYPES = ['backend', 'data', 'cli', 'infra', 'frontend', 'library'];
const AREA_GATED = [...RUNTIME_GATED, 'security-logic'];

test('the three runtime-dependent criteria are area-gated, not universal', () => {
  for (const id of RUNTIME_GATED) {
    const c = getCriterion(id);
    assert.ok(Array.isArray(c.appliesTo),
      `${id}.appliesTo must be an array, got ${JSON.stringify(c.appliesTo)}`);
    assert.deepStrictEqual([...c.appliesTo].sort(), [...RUNTIME_TYPES].sort(),
      `${id} gate mismatch`);
  }
});

test('security-logic is gated wider than the runtime three (adds frontend, library)', () => {
  const c = getCriterion('security-logic');
  assert.ok(Array.isArray(c.appliesTo),
    `security-logic.appliesTo must be an array, got ${JSON.stringify(c.appliesTo)}`);
  assert.deepStrictEqual([...c.appliesTo].sort(), [...SECURITY_TYPES].sort());
});

test('security-logic loads for frontend and library; the runtime three do not', () => {
  for (const t of ['frontend', 'library']) {
    const ids = criteriaForArea([t]).map((c) => c.id);
    assert.ok(ids.includes('security-logic'), `security-logic must load for ${t}`);
    for (const id of RUNTIME_GATED) {
      assert.ok(!ids.includes(id), `${id} must not load for ${t}`);
    }
  }
});

// ── missing-tests — #272: gated on the SAME set security-logic uses
// ("test-bearing" area types track the same code shapes security-relevant
// logic does; a genuinely non-code slice has no coverage question to ask).

test('missing-tests is area-gated the same as security-logic', () => {
  const c = getCriterion('missing-tests');
  assert.ok(Array.isArray(c.appliesTo),
    `missing-tests.appliesTo must be an array, got ${JSON.stringify(c.appliesTo)}`);
  assert.deepStrictEqual([...c.appliesTo].sort(), [...SECURITY_TYPES].sort());
});

test('missing-tests loads for every SECURITY_TYPES area and not for docs', () => {
  for (const t of SECURITY_TYPES) {
    const ids = criteriaForArea([t]).map((c) => c.id);
    assert.ok(ids.includes('missing-tests'), `missing-tests must load for ${t}`);
  }
  assert.ok(!criteriaForArea(['docs']).some((c) => c.id === 'missing-tests'));
});

test('gated OUT: a docs-only slice loads none of the five area-gated criteria', () => {
  const ids = criteriaForArea(['docs']).map((c) => c.id);
  for (const id of [...AREA_GATED, 'missing-tests']) {
    assert.ok(!ids.includes(id), `${id} must not load for a docs-only slice`);
  }
});

test('gated IN: a backend slice still loads all four area-gated criteria', () => {
  const ids = criteriaForArea(['backend']).map((c) => c.id);
  for (const id of AREA_GATED) {
    assert.ok(ids.includes(id), `${id} must still load for a backend slice`);
  }
});

// Literal expected list on purpose: deriving it by filtering CRITERIA for
// appliesTo === 'universal' would use the same predicate as the implementation
// and so could not distinguish "correct" from "merely self-consistent".
test('a non-code slice loads exactly the three genuinely-universal fragments', () => {
  const withFragment = criteriaForArea([])
    .filter((c) => c.fragment)
    .map((c) => c.id)
    .sort();
  assert.deepStrictEqual(withFragment,
    ['architecture-depth', 'review-quality', 'simplification']);
});

// criteria-migration-safety.md's prose cross-references criteria-scalability.md.
// migration-safety is ['data'] and the scalability gate includes 'data', so the
// two always co-load and that reference can never dangle. Guard it.
test('scalability co-loads wherever migration-safety does', () => {
  const ids = criteriaForArea(['data']).map((c) => c.id);
  assert.ok(ids.includes('migration-safety'), 'migration-safety must load for data');
  assert.ok(ids.includes('scalability'),
    'criteria-migration-safety.md references criteria-scalability.md — they must co-load');
});

// description was removed from CRITERIA entries — criteria no longer bootstrap their own
// GitHub label (see bin/lib/code-health/issue-payload.js); the 100-char-cap check now lives
// in tests/bin-lib/issues/labels.test.js as a property of ensureLabelPayload itself.
