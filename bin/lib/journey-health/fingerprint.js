'use strict';
const { createFingerprint } = require('../health-core/fingerprint');

// Stable id from journey + category + section + normalized description.
module.exports = createFingerprint('journey-health', ['journey', 'category', 'section', 'description']);
