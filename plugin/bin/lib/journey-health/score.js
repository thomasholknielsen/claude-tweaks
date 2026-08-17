'use strict';
// Round-robin floors: journeys unaudited past these many days are
// force-boosted regardless of churn. Light tier moves at roughly
// code-health's 30-day pace (bin/lib/code-health/score.js); deep tier is 90
// days, matching harness-health's slower-moving-doc rationale, since a deep
// audit boots a real dev server + browser session and should run far less
// often than the light tier.
const STALE_DAYS_LIGHT = 30;
const STALE_DAYS_DEEP = 90;

module.exports = { STALE_DAYS_LIGHT, STALE_DAYS_DEEP };
