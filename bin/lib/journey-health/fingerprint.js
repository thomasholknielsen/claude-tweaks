'use strict';
const { normalizeText, fingerprintFromBasis } = require('../health-core/fingerprint');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) { return normalizeText(description); }

// Stable id from journey + category + section + normalized description.
function fingerprint({ journey, category, section, description }) {
  return fingerprintFromBasis('journeyhealth', [journey, category, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
