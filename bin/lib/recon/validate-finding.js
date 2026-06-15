'use strict';

// Validates a subagent-produced finding against the Phase 1 Finding shape.
// Returns { ok:true, value } (files coerced to strings) or { ok:false, errors:string[] }.
// Zero deps; accumulates all errors in one pass so the caller logs one line per drop.

const SEVERITY_VALUES = new Set(['low', 'medium', 'high', 'critical']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const CATEGORY_VALUES = new Set([
  'Architecture', 'Security', 'Convention', 'Performance',
  'Error handling', 'Test quality', 'Coverage', 'UX', 'Docs',
]);

// Required string fields. `id` is assigned by ingest-judgment AFTER validation
// (fingerprint of lens+area+signature), so the subagent never supplies it.
const REQUIRED_STRINGS = [
  'title', 'lens', 'category', 'severity', 'confidence',
  'area', 'signature', 'evidence', 'suggestion', 'acceptance',
];

function validateFinding(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  if (!Array.isArray(obj.files)) {
    errors.push(`files: must be a non-empty array (got ${typeof obj.files})`);
  } else if (obj.files.length === 0) {
    errors.push('files: must contain at least one entry');
  }

  // Enum checks only when the field cleared the string check (avoids double-reporting).
  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  }
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }
  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
  }

  if (errors.length > 0) return { ok: false, errors };

  // Coerce files entries to strings: LLMs sometimes emit "path:LINE" with the
  // line as a number. Accept and normalize rather than reject on type alone.
  const value = { ...obj, files: obj.files.map(String) };
  return { ok: true, errors: [], value };
}

module.exports = { validateFinding, SEVERITY_VALUES, CONFIDENCE_VALUES, CATEGORY_VALUES, REQUIRED_STRINGS };
