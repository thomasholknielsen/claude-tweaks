'use strict';

// Validates a docs-health finding against the Finding Shape in
// _shared/criteria-docs-diataxis.md. Returns { ok:true, value } or
// { ok:false, errors:string[] }. Single finding shape — unlike
// harness-health, docs-health has no kind discriminator (no
// "new-skill"-equivalent second shape).

const ASSET_TYPE_VALUES = new Set(['doc']);
const CATEGORY_VALUES = new Set(['genre-drift', 'staleness']);
const MISLEADS_VALUES = new Set(['human', 'agent', 'both']);
const CLASSIFICATION_VALUES = new Set(['additive', 'restructural']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const REVERSIBILITY_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = [
  'target', 'assetType', 'section', 'category', 'misleads',
  'description', 'reason', 'classification', 'confidence', 'reversibility',
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

  if (typeof obj.assetType === 'string' && !ASSET_TYPE_VALUES.has(obj.assetType)) {
    errors.push(`assetType: must be one of ${[...ASSET_TYPE_VALUES].join('|')} (got "${obj.assetType}")`);
  }
  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
  }
  if (typeof obj.misleads === 'string' && !MISLEADS_VALUES.has(obj.misleads)) {
    errors.push(`misleads: must be one of ${[...MISLEADS_VALUES].join('|')} (got "${obj.misleads}")`);
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

  if (typeof obj.oldString !== 'string') {
    errors.push('oldString: required string (empty string allowed for pure additions)');
  }
  if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
    errors.push('newString: required non-empty string');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = {
  validateFinding, ASSET_TYPE_VALUES, CATEGORY_VALUES, MISLEADS_VALUES,
  CLASSIFICATION_VALUES, CONFIDENCE_VALUES, REVERSIBILITY_VALUES,
};
