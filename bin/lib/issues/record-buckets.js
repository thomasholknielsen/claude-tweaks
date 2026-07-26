// bin/lib/issues/record-buckets.js
// Pure: the record-stage/bot-state predicates and staleness classifier
// duplicated independently in /help's status-scan.md and /tidy's
// scan-procedures.md before this module existed. facets.stage and
// facets.bot are always present on both drivers (facet-shape.js's
// sharedFacetDefaults(), spread into both record.js's parseRecordFacets
// and local-store.js's defaultFacets) — no optional chaining needed here.
'use strict';

function isBacklog(record) {
  return record.facets.stage === 'backlog';
}

function isParked(record) {
  return record.facets.stage === 'parked';
}

function isBotBlocked(record) {
  return record.facets.bot.blocked === true;
}

function isBotInProgress(record) {
  return record.facets.bot.inProgress === true;
}

// Bands: fresh below half the threshold, review from half up to and including
// the threshold, stale beyond it. Preserves the original fixed 2-week/4-week
// ratio (half of 4 weeks = 2 weeks) as the threshold scales with project policy.
function classifyStaleness(ageMs, thresholdMs) {
  const half = thresholdMs / 2;
  if (ageMs < half) return 'fresh';
  if (ageMs <= thresholdMs) return 'review';
  return 'stale';
}

module.exports = { isBacklog, isParked, isBotBlocked, isBotInProgress, classifyStaleness };
