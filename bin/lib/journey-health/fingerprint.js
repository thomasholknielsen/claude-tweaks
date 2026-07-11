'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) {
  return String(description).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from journey + category + section + normalized description.
function fingerprint({ journey, category, section, description }) {
  const basis = JSON.stringify([journey, category, section, normalizeDescription(description)]);
  return 'journeyhealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

module.exports = { fingerprint, normalizeDescription };
