'use strict';

// Validates a harness-health finding (a patch proposal or new-skill candidate)
// against the Finding Shape in _shared/harness-health-analysis.md.
// Returns { ok:true, value } or { ok:false, errors:string[] }.

const KIND_VALUES = new Set(['patch', 'new-skill']);
const CLASSIFICATION_VALUES = new Set(['additive', 'restructural']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const REVERSIBILITY_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = ['kind', 'skill', 'description', 'reason', 'classification', 'confidence', 'reversibility'];

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

  if (typeof obj.kind === 'string' && !KIND_VALUES.has(obj.kind)) {
    errors.push(`kind: must be one of ${[...KIND_VALUES].join('|')} (got "${obj.kind}")`);
  }
  if (typeof obj.classification === 'string' && !CLASSIFICATION_VALUES.has(obj.classification)) {
    errors.push(`classification: must be one of ${[...CLASSIFICATION_VALUES].join('|')} (got "${obj.classification}")`);
  }
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }
  if (typeof obj.reversibility === 'string' && !REVERSIBILITY_VALUES.has(obj.reversibility)) {
    errors.push(`reversibility: must be one of ${[...REVERSIBILITY_VALUES].join('|')} (got "${obj.reversibility}")`);
  }

  if (obj.kind === 'patch') {
    if (typeof obj.section !== 'string' || obj.section.trim() === '') {
      errors.push('section: required non-empty string when kind is "patch"');
    }
    if (typeof obj.oldString !== 'string') {
      errors.push('oldString: required string when kind is "patch" (empty string allowed for pure additions)');
    }
    if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
      errors.push('newString: required non-empty string when kind is "patch"');
    }
  }
  if (obj.kind === 'new-skill') {
    if (typeof obj.proposedBody !== 'string' || obj.proposedBody.trim() === '') {
      errors.push('proposedBody: required non-empty string when kind is "new-skill"');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = { validateFinding, KIND_VALUES, CLASSIFICATION_VALUES, CONFIDENCE_VALUES, REVERSIBILITY_VALUES };
