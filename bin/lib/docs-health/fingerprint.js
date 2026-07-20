'use strict';
const { createFingerprint } = require('../health-core/fingerprint');

// Stable id from assetType + target + section + normalized description —
// harness-health's fingerprint shape (assetType+target stand in for
// criterion, section stands in for areaId, description stands in for
// anchor), not code-health's relfile#Symbol shape — docs are prose, no
// named symbols to anchor on.
module.exports = createFingerprint('docs-health', ['assetType', 'target', 'section', 'description']);
