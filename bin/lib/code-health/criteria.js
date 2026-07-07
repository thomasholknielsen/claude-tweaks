'use strict';

// Universal criteria catalog for code-health v2.
// P1 populates all 15 universal criteria. Domain criteria (a11y, i18n, etc.) are added in P2.
// Each entry: { id, appliesTo, fragment, confidenceFloor }
//   appliesTo:      'universal' | string[]  (area type strings, e.g. ['frontend','library'])
//   fragment:       path relative to skills/_shared/ for a criteria detail file, or null
//   confidenceFloor:'high' | 'medium' | 'low'  — minimum confidence to FILE a finding for this criterion

const CRITERIA = [
  {
    id: 'architecture-depth',
    appliesTo: 'universal',
    fragment: 'criteria-architecture-depth.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'simplification',
    appliesTo: 'universal',
    fragment: 'criteria-simplification.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'review-quality',
    appliesTo: 'universal',
    fragment: 'criteria-review-quality.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'scalability',
    appliesTo: 'universal',
    fragment: 'criteria-scalability.md',
    confidenceFloor: 'high',
  },
  {
    id: 'security-logic',
    appliesTo: 'universal',
    fragment: 'criteria-security-logic.md',
    confidenceFloor: 'high',
  },
  {
    id: 'bad-practice',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'doc-freshness',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'dead-code',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'test-quality',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'resilience',
    appliesTo: 'universal',
    fragment: 'criteria-resilience.md',
    confidenceFloor: 'high',
  },
  {
    id: 'observability',
    appliesTo: 'universal',
    fragment: 'criteria-observability.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'config-secrets',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'dependency-health',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'input-validation',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'naming-clarity',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  // Domain: a11y → frontend
  { id: 'a11y', appliesTo: ['frontend'], confidenceFloor: 'high', fragment: 'criteria-a11y.md' },
  // Domain: i18n → frontend + backend (user-facing apps)
  { id: 'i18n', appliesTo: ['frontend', 'backend'], confidenceFloor: 'medium', fragment: 'criteria-i18n.md' },
  // Domain: api-stability → library + backend
  { id: 'api-stability', appliesTo: ['library', 'backend'], confidenceFloor: 'medium', fragment: 'criteria-api-stability.md' },
  // Domain: migration-safety → data
  { id: 'migration-safety', appliesTo: ['data'], confidenceFloor: 'high', fragment: 'criteria-migration-safety.md' },
  // Domain: iac-security → infra
  { id: 'iac-security', appliesTo: ['infra'], confidenceFloor: 'high', fragment: 'criteria-iac-security.md' },
  // Domain: privacy-pii → user-data areas (frontend, backend, data)
  { id: 'privacy-pii', appliesTo: ['frontend', 'backend', 'data'], confidenceFloor: 'high', fragment: 'criteria-privacy-pii.md' },
  // Domain: concurrency → async/shared-state (backend, cli, data)
  { id: 'concurrency', appliesTo: ['backend', 'cli', 'data'], confidenceFloor: 'medium', fragment: 'criteria-concurrency.md' },
];

// Build a lookup map once on load for O(1) getCriterion.
const _byId = new Map(CRITERIA.map((c) => [c.id, c]));

// Returns the criterion with the given id, or undefined.
function getCriterion(id) {
  return _byId.get(id);
}

// Returns criteria applicable to the given area types.
// Always includes all universal criteria.
// Adds any domain criteria whose appliesTo array intersects with areaTypes.
// Result is deduplicated (a criterion can only appear once).
function criteriaForArea(areaTypes) {
  const typeSet = new Set(areaTypes || []);
  const seen = new Set();
  const result = [];
  for (const c of CRITERIA) {
    if (seen.has(c.id)) continue;
    if (c.appliesTo === 'universal') {
      seen.add(c.id);
      result.push(c);
    } else if (Array.isArray(c.appliesTo) && c.appliesTo.some((t) => typeSet.has(t))) {
      seen.add(c.id);
      result.push(c);
    }
  }
  return result;
}

module.exports = { CRITERIA, criteriaForArea, getCriterion };
