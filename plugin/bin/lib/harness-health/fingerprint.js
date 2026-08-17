'use strict';
const { createFingerprint } = require('../health-core/fingerprint');

// Stable id from assetType + target + section + normalized description.
// Mirrors code-health's fingerprint shape (criterion+areaId+anchor) —
// assetType+target stand in for criterion, section stands in for areaId,
// description stands in for anchor. assetType is included so a skill and a
// rule that happen to share a target id never collide.
module.exports = createFingerprint('harness-health', ['assetType', 'target', 'section', 'description']);
