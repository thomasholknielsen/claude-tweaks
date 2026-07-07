// bin/lib/code-health/score.js
// Shared scoring constants used by scope.js (v2 rotation).
'use strict';

const MAX_STALE_DAYS = 30;        // round-robin floor: areas past this are force-boosted

module.exports = { MAX_STALE_DAYS };
