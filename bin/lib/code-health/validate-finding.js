'use strict';

// Validates a subagent-produced finding against the v2 Finding shape.
// Returns { ok:true, value } or { ok:false, errors:string[] }.
// Zero deps; accumulates all errors in one pass so the caller logs one line per drop.

// Single source of truth for the shared low/medium/high tier vocabulary —
// severity, confidence, likelihood, and effort are all independently-typed
// fields over the identical three-value domain. Deriving all four Sets (and
// the confidence ordering) from this one array means a future tier addition
// (e.g. 'critical') only has to be made in one place instead of four
// separately hand-typed literals that could drift out of sync silently.
const TIER_VALUES = ['low', 'medium', 'high'];
const SEVERITY_VALUES = new Set(TIER_VALUES);
const CONFIDENCE_VALUES = new Set(TIER_VALUES);
const LIKELIHOOD_VALUES = new Set(TIER_VALUES);
const EFFORT_VALUES = new Set(TIER_VALUES);

const { getCriterion } = require('./criteria');

// Confidence ordering for floor comparison. Higher index = higher confidence.
const CONFIDENCE_ORDER = TIER_VALUES;

// Second-stage gate applied after validateFindingV2: even a well-formed
// finding is dropped when its confidence sits below the criterion's own
// confidenceFloor. Returns { pass: true } or { pass: false, reason: string }.
function applyConfidenceFloor(finding, criterionFloor) {
  if (!criterionFloor) return { pass: true };
  const findingIdx = CONFIDENCE_ORDER.indexOf(finding.confidence);
  const floorIdx = CONFIDENCE_ORDER.indexOf(criterionFloor);
  if (findingIdx >= floorIdx) return { pass: true };
  return {
    pass: false,
    reason: `confidence '${finding.confidence}' below floor '${criterionFloor}' for criterion '${finding.criterion}'`,
  };
}

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
  validateFindingV2, applyConfidenceFloor,
  TIER_VALUES, SEVERITY_VALUES, CONFIDENCE_VALUES, LIKELIHOOD_VALUES, EFFORT_VALUES,
};
