'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) {
  return String(description).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from assetType + target + section + normalized description. Same
// shape as recon's fingerprint (criterion+areaId+anchor) — assetType+target
// stand in for criterion, section stands in for areaId, description stands in
// for anchor. assetType is included so a skill and a rule that happen to
// share a target id never collide.
function fingerprint({ assetType, target, section, description }) {
  const basis = JSON.stringify([assetType, target, section, normalizeDescription(description)]);
  return 'harnesshealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

module.exports = { fingerprint, normalizeDescription };
