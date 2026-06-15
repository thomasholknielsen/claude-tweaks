'use strict';

// Universal criteria catalog for recon v2.
// P1 populates all 15 universal criteria. Domain criteria (a11y, i18n, etc.) are added in P2.
// Each entry: { id, appliesTo, fragment, confidenceFloor }
//   appliesTo:      'universal' | string[]  (area type strings, e.g. ['frontend','library'])
//   fragment:       path relative to skills/_shared/ for a criteria detail file, or null
//   confidenceFloor:'high' | 'med' | 'low'  — minimum confidence to FILE a finding for this criterion

const CRITERIA = [
  {
    id: 'architecture-depth',
    appliesTo: 'universal',
    fragment: 'criteria-architecture-depth.md',
    confidenceFloor: 'med',
  },
  {
    id: 'simplification',
    appliesTo: 'universal',
    fragment: 'criteria-simplification.md',
    confidenceFloor: 'med',
  },
  {
    id: 'review-quality',
    appliesTo: 'universal',
    fragment: 'criteria-review-quality.md',
    confidenceFloor: 'med',
  },
  {
    id: 'scalability',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'security-logic',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'bad-practice',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'doc-freshness',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'dead-code',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'test-quality',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'resilience',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'observability',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
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
    confidenceFloor: 'med',
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
    confidenceFloor: 'med',
  },
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
