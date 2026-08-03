'use strict';

// Validates a harness-health finding (a patch proposal or new-skill candidate)
// against the Finding Shape in _shared/harness-health-analysis.md.
// Returns { ok:true, value } or { ok:false, errors:string[] }.

const { requireNonEmptyStrings, validateRelatedSections } = require('../health-core/finding-validation');

const KIND_VALUES = new Set(['patch', 'new-skill']);
const ASSET_TYPE_VALUES = new Set(['skill', 'rule', 'claude-md', 'design-artifact', 'memory']);
const CATEGORY_VALUES = new Set(['drift', 'template-conformance', 'best-practice']);
const CLASSIFICATION_VALUES = new Set(['additive', 'restructural']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const REVERSIBILITY_VALUES = new Set(['high', 'med', 'low']);

const INTENT_VALUES = new Set(['remove']);

const REQUIRED_STRINGS = ['kind', 'target', 'assetType', 'category', 'description', 'reason', 'classification', 'confidence', 'reversibility'];

function validateFinding(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  errors.push(...requireNonEmptyStrings(obj, REQUIRED_STRINGS));

  if (typeof obj.kind === 'string' && !KIND_VALUES.has(obj.kind)) {
    errors.push(`kind: must be one of ${[...KIND_VALUES].join('|')} (got "${obj.kind}")`);
  }
  if (typeof obj.assetType === 'string' && !ASSET_TYPE_VALUES.has(obj.assetType)) {
    errors.push(`assetType: must be one of ${[...ASSET_TYPE_VALUES].join('|')} (got "${obj.assetType}")`);
  }
  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
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

  // `intent` is optional. Its only current value is "remove" — a finding that
  // deletes existing content outright rather than replacing it. Removal is
  // deliberately narrow: it is the one case where an empty `newString` is
  // legal, so it must not become the escape hatch that lets a malformed
  // finding (model returned nothing) through the guard below.
  const isRemoval = obj.intent === 'remove';
  if (obj.intent !== undefined && !INTENT_VALUES.has(obj.intent)) {
    errors.push(`intent: when present, must be one of ${[...INTENT_VALUES].join('|')} (got ${JSON.stringify(obj.intent)})`);
  }
  if (isRemoval) {
    // Scoped to CLAUDE.md because those findings never auto-apply (see
    // _shared/harness-health-analysis.md's Finding Shape). That containment is
    // what makes an empty newString safe: no consumer can silently delete
    // content with it. Widening to skill/rule targets means auditing every
    // auto-apply path (/init Phase 6, /wrap-up Step 7) first.
    if (obj.kind !== 'patch') {
      errors.push('intent "remove": requires kind "patch"');
    }
    if (obj.assetType !== 'claude-md') {
      errors.push(`intent "remove": only valid for assetType "claude-md" (got ${JSON.stringify(obj.assetType)}) — removals never auto-apply, and that guarantee only holds for CLAUDE.md`);
    }
    if (obj.classification !== 'restructural') {
      errors.push('intent "remove": requires classification "restructural" — deleting content is never additive');
    }
    if (typeof obj.oldString !== 'string' || obj.oldString.trim() === '') {
      errors.push('intent "remove": oldString must be the non-empty verbatim content being removed');
    }
  }

  if (obj.kind === 'patch') {
    if (typeof obj.section !== 'string' || obj.section.trim() === '') {
      errors.push('section: required non-empty string when kind is "patch"');
    }
    if (typeof obj.oldString !== 'string') {
      errors.push('oldString: required string when kind is "patch" (empty string allowed for pure additions)');
    }
    if (isRemoval) {
      if (obj.newString !== '') {
        errors.push('newString: must be exactly "" when intent is "remove" — a removal replaces content with nothing');
      }
    } else if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
      errors.push('newString: required non-empty string when kind is "patch"');
    }
  }
  if (obj.kind === 'new-skill') {
    if (typeof obj.proposedBody !== 'string' || obj.proposedBody.trim() === '') {
      errors.push('proposedBody: required non-empty string when kind is "new-skill"');
    }
  }

  // relatedSections is optional: when present, every entry must be a non-empty
  // string (same shape as `section` — sibling occurrences of the same root
  // cause). Only ever populated for kind: "patch" findings — "new-skill"
  // candidates have no section to bundle by — but validated unconditionally
  // here, same as the required-field blocks above.
  errors.push(...validateRelatedSections(obj));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = {
  validateFinding, KIND_VALUES, ASSET_TYPE_VALUES, CATEGORY_VALUES,
  CLASSIFICATION_VALUES, CONFIDENCE_VALUES, REVERSIBILITY_VALUES, INTENT_VALUES,
};
