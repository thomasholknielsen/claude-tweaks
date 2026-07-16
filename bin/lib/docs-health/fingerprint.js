'use strict';
const { normalizeText, fingerprintFromBasis } = require('../health-core/fingerprint');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) { return normalizeText(description); }

// Stable id from assetType + target + section + normalized description —
// harness-health's fingerprint shape (assetType+target stand in for
// criterion, section stands in for areaId, description stands in for
// anchor), not code-health's relfile#Symbol shape — docs are prose, no
// named symbols to anchor on.
function fingerprint({ assetType, target, section, description }) {
  return fingerprintFromBasis('docshealth', [assetType, target, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
