'use strict';
const { normalizeText, fingerprintFromBasis } = require('../watchman-core/fingerprint');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) { return normalizeText(description); }

// Stable id from assetType + target + section + normalized description. Same
// shape as recon's fingerprint (criterion+areaId+anchor) — assetType+target
// stand in for criterion, section stands in for areaId, description stands in
// for anchor. assetType is included so a skill and a rule that happen to
// share a target id never collide.
function fingerprint({ assetType, target, section, description }) {
  return fingerprintFromBasis('harnesshealth', [assetType, target, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
