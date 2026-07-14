// bin/lib/issues/labels.js
// Pure: validate + shape a label bootstrap payload. Throws on GitHub's 100-char
// description cap so a too-long description fails at construction time, not
// silently as a 422 on first `gh label create` (see commit 54ab897, which hit
// and fixed this exact bug once for the claim-mirror label, now bot:in-progress).
'use strict';

function ensureLabelPayload(name, description) {
  if (typeof description !== 'string') {
    throw new Error(`label "${name}": description must be a string (got ${typeof description})`);
  }
  if (description.length > 100) {
    throw new Error(`label "${name}": description must be <= 100 chars (got ${description.length}): "${description}"`);
  }
  return { name, description };
}

module.exports = { ensureLabelPayload };
