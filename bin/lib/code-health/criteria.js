'use strict';

// Universal criteria catalog for code-health v2.
// P1 populates all 15 universal criteria. Domain criteria (a11y, i18n, etc.) are added in P2.
// Each entry: { id, description, appliesTo, fragment, confidenceFloor }
//   description:   real, human-readable one-liner used as the GitHub label description —
//                  must stay under GitHub's 100-char label-description cap (see criteria.test.js)
//   appliesTo:      'universal' | string[]  (area type strings, e.g. ['frontend','library'])
//   fragment:       path relative to skills/_shared/ for a criteria detail file, or null
//   confidenceFloor:'high' | 'medium' | 'low'  — minimum confidence to FILE a finding for this criterion

const CRITERIA = [
  {
    id: 'architecture-depth',
    description: 'Shallow modules whose interface is nearly as complex as their implementation',
    appliesTo: 'universal',
    fragment: 'criteria-architecture-depth.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'simplification',
    description: 'Unnecessary complexity from iterative development: verbose patterns, dead branches, over-abstraction',
    appliesTo: 'universal',
    fragment: 'criteria-simplification.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'review-quality',
    description: 'What a calibrated senior engineer would flag in code review — architecture, security, convention',
    appliesTo: 'universal',
    fragment: 'criteria-review-quality.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'scalability',
    description: 'Structural patterns that will constrain scale before performance bottlenecks become visible',
    appliesTo: 'universal',
    fragment: 'criteria-scalability.md',
    confidenceFloor: 'high',
  },
  {
    id: 'security-logic',
    description: 'Logic-level security defects — not static-analysis findings or dependency CVEs',
    appliesTo: 'universal',
    fragment: 'criteria-security-logic.md',
    confidenceFloor: 'high',
  },
  {
    id: 'bad-practice',
    description: 'Anti-patterns and conventions that violate established best practices for the language or framework',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'doc-freshness',
    description: 'Documentation that no longer matches the code it describes',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'dead-code',
    description: 'Unreachable code, unused exports, or functions with zero callers',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'test-quality',
    description: "Tests that don't verify real behavior, or missing coverage for critical paths",
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'resilience',
    description: 'Missing timeouts, retries, circuit breakers, or graceful-degradation paths',
    appliesTo: 'universal',
    fragment: 'criteria-resilience.md',
    confidenceFloor: 'high',
  },
  {
    id: 'observability',
    description: 'Missing logging, metrics, or tracing on critical paths',
    appliesTo: 'universal',
    fragment: 'criteria-observability.md',
    confidenceFloor: 'medium',
  },
  {
    id: 'config-secrets',
    description: 'Hardcoded secrets, credentials, or configuration that should be externalized',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'dependency-health',
    description: 'Outdated, unmaintained, or vulnerable dependencies',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  {
    id: 'input-validation',
    description: 'Missing or insufficient validation of external input at trust boundaries',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'naming-clarity',
    description: 'Names that mislead, or fail to convey intent, scope, or side effects',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'medium',
  },
  // Domain: a11y → frontend
  { id: 'a11y', description: 'Accessibility violations in frontend/UI code', appliesTo: ['frontend'], confidenceFloor: 'high', fragment: 'criteria-a11y.md' },
  // Domain: i18n → frontend + backend (user-facing apps)
  { id: 'i18n', description: 'Internationalization gaps in user-facing applications', appliesTo: ['frontend', 'backend'], confidenceFloor: 'medium', fragment: 'criteria-i18n.md' },
  // Domain: api-stability → library + backend
  { id: 'api-stability', description: 'Breaking-change risk in library or service API/contract surfaces', appliesTo: ['library', 'backend'], confidenceFloor: 'medium', fragment: 'criteria-api-stability.md' },
  // Domain: migration-safety → data
  { id: 'migration-safety', description: 'Database migration or rollback correctness in data-backed areas', appliesTo: ['data'], confidenceFloor: 'high', fragment: 'criteria-migration-safety.md' },
  // Domain: iac-security → infra
  { id: 'iac-security', description: 'Infrastructure-as-code security issues (Terraform, Dockerfiles, Kubernetes manifests)', appliesTo: ['infra'], confidenceFloor: 'high', fragment: 'criteria-iac-security.md' },
  // Domain: privacy-pii → user-data areas (frontend, backend, data)
  { id: 'privacy-pii', description: 'Handling of personally identifiable information without adequate protection', appliesTo: ['frontend', 'backend', 'data'], confidenceFloor: 'high', fragment: 'criteria-privacy-pii.md' },
  // Domain: concurrency → async/shared-state (backend, cli, data)
  { id: 'concurrency', description: 'Race conditions, unsafe shared mutable state, or unbounded concurrency in async code', appliesTo: ['backend', 'cli', 'data'], confidenceFloor: 'medium', fragment: 'criteria-concurrency.md' },
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
