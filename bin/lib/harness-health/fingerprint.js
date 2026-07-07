'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) {
  return String(description).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from skill + section + normalized description. Same shape as
// recon's fingerprint (criterion+areaId+anchor) — skill/section stand in for
// criterion/areaId, description stands in for anchor.
function fingerprint({ skill, section, description }) {
  const basis = JSON.stringify([skill, section, normalizeDescription(description)]);
  return 'harnesshealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

module.exports = { fingerprint, normalizeDescription };
