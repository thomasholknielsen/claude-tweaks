'use strict';

// Validates a subagent-produced finding against the v2 Finding shape.
// Returns { ok:true, value } or { ok:false, errors:string[] }.
// Zero deps; accumulates all errors in one pass so the caller logs one line per drop.

const SEVERITY_VALUES = new Set(['low', 'medium', 'high']);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const LIKELIHOOD_VALUES = new Set(['low', 'medium', 'high']);
const EFFORT_VALUES = new Set(['low', 'medium', 'high']);

const { getCriterion } = require('./criteria');

// v2 Finding shape: criterion (catalog id), areaId, anchor, severity, confidence,
// title, evidence, suggestedApproach, acceptance.
// Returns { ok: boolean, errors: string[], value? }.
const V2_REQUIRED_STRINGS = [
  'criterion', 'areaId', 'anchor', 'title', 'evidence', 'suggestedApproach', 'acceptance',
  'likelihood', 'effort',
];

function validateFindingV2(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of V2_REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  // relatedAnchors is optional: when present, every entry must be a non-empty string
  // (same shape as `anchor` — sibling occurrences of the same root cause).
  if (obj.relatedAnchors !== undefined) {
    const isValidArray = Array.isArray(obj.relatedAnchors) &&
      obj.relatedAnchors.every((a) => typeof a === 'string' && a.trim() !== '');
    if (!isValidArray) {
      errors.push(`relatedAnchors: when present, must be an array of non-empty strings (got ${JSON.stringify(obj.relatedAnchors)})`);
    }
  }

  // Criterion must be a known catalog id (only check when it passed the string check).
  if (typeof obj.criterion === 'string' && obj.criterion.trim() !== '') {
    if (getCriterion(obj.criterion) === undefined) {
      errors.push(`criterion: unknown criterion id "${obj.criterion}" — must be a registered catalog id`);
    }
  }

  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  } else if (typeof obj.severity !== 'string') {
    errors.push(`severity: required non-empty string (got ${JSON.stringify(obj.severity)})`);
  }

  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  } else if (typeof obj.confidence !== 'string') {
    errors.push(`confidence: required non-empty string (got ${JSON.stringify(obj.confidence)})`);
  }

  if (typeof obj.likelihood === 'string' && !LIKELIHOOD_VALUES.has(obj.likelihood)) {
    errors.push(`likelihood: must be one of ${[...LIKELIHOOD_VALUES].join('|')} (got "${obj.likelihood}")`);
  }

  if (typeof obj.effort === 'string' && !EFFORT_VALUES.has(obj.effort)) {
    errors.push(`effort: must be one of ${[...EFFORT_VALUES].join('|')} (got "${obj.effort}")`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = {
  validateFindingV2, SEVERITY_VALUES, CONFIDENCE_VALUES, LIKELIHOOD_VALUES, EFFORT_VALUES,
};
