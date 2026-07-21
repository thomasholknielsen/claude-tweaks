'use strict';

// Validates a journey-health finding against the Finding Shape documented in
// skills/journey-health/SKILL.md. Returns { ok:true, value } or
// { ok:false, errors:string[] }.

const { requireNonEmptyStrings, validateRelatedSections } = require('../health-core/finding-validation');

const CATEGORY_VALUES = new Set(['drift', 'coverage', 'regression-suspected']);
const SECTION_VALUES = new Set(['files-frontmatter', 'self-review', 'coverage', 'live-check']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const SEVERITY_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = ['journey', 'category', 'section', 'description', 'reason', 'confidence', 'severity', 'recommendation'];

function validateFinding(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  errors.push(...requireNonEmptyStrings(obj, REQUIRED_STRINGS));

  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
  }
  if (typeof obj.section === 'string' && !SECTION_VALUES.has(obj.section)) {
    errors.push(`section: must be one of ${[...SECTION_VALUES].join('|')} (got "${obj.section}")`);
  }
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }
  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  }

  // relatedSections is optional: when present, every entry must be a non-empty
  // string — sibling occurrences of the same root cause, scoped to
  // category: "coverage" findings only (see skills/journey-health/SKILL.md
  // Step 3's bundling rule). Validated unconditionally here, same as
  // harness-health's kind-agnostic check.
  errors.push(...validateRelatedSections(obj));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = { validateFinding, CATEGORY_VALUES, SECTION_VALUES, CONFIDENCE_VALUES, SEVERITY_VALUES };
