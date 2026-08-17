'use strict';
// Round-robin floor: skills unaudited past this many days are force-boosted
// regardless of churn. Longer than code-health's 30-day floor
// (bin/lib/code-health/score.js) because skill-doc drift moves slower than
// code bugs.
const STALE_DAYS = 90;

module.exports = { STALE_DAYS };
