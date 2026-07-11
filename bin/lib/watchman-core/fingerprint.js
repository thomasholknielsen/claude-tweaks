'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeText(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from a prefix + ordered basis array. Each skill's own
// fingerprint.js maps its named finding fields onto a basis array in a
// fixed order and supplies its own id prefix.
function fingerprintFromBasis(prefix, basis) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(basis)).digest('hex').slice(0, 8);
  return `${prefix}-${hash}`;
}

module.exports = { normalizeText, fingerprintFromBasis };
