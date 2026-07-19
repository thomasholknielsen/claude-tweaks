// bin/lib/issues/review-backlog.js
// Pure: mechanical filter/sort/split/merge logic for /claude-tweaks:review-backlog's
// Lane A (scored records, unlimited scale) and the scored/unscored split feeding
// Lane B's bounded LLM synthesis pass. Records are expected to already carry
// `.facets` (via record.js's parseRecordFacets or local-store.js's
// readRecord/queryRecords) and, where sorting depends on it, a `.createdAt` ISO
// string. No network, no fs — mirrors record.js/tier.js's purity contract.
'use strict';

const RANK = { high: 0, medium: 1, low: 2 };
const bandOf = (r) => (r.facets.priority ? RANK[r.facets.priority] : 3);
const riskBandOf = (r) => (r.facets.risk ? RANK[r.facets.risk] : 3);
const byCreatedAtAsc = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

// records[] -> { scored: records[], unscored: records[] }. Scored = carries both
// risk:* and effort:* (the two labels /specify's shaping and the health skills'
// born-ready filing always stamp together). Order within each bucket is preserved
// from the input array — callers sort afterward per mode.
function splitScoredUnscored(records) {
  const scored = [];
  const unscored = [];
  for (const r of records) {
    if (r.facets.risk && r.facets.effort) scored.push(r);
    else unscored.push(r);
  }
  return { scored, unscored };
}

// records[] -> records[] filtered to risk:high, sorted by priority band then
// oldest-createdAt-first. Only scored records ever carry risk:*, so this is safe
// to call on a mixed scored+unscored array directly.
function filterCritical(records) {
  return records
    .filter((r) => r.facets.risk === 'high')
    .sort((a, b) => bandOf(a) - bandOf(b) || byCreatedAtAsc(a, b));
}

// records[] -> { ranked: records[], unscored: records[] }. ranked is the scored
// bucket sorted by priority band, then risk band (both high-first), then
// oldest-createdAt-first; unscored is the trailing "not yet scored" group,
// oldest-first for the same staleness-first bias.
function rankRiskValue(records) {
  const { scored, unscored } = splitScoredUnscored(records);
  const ranked = scored
    .slice()
    .sort((a, b) => bandOf(a) - bandOf(b) || riskBandOf(a) - riskBandOf(b) || byCreatedAtAsc(a, b));
  return { ranked, unscored: unscored.slice().sort(byCreatedAtAsc) };
}

// records[] -> records[] filtered to effort:low, sorted by priority band then
// oldest-createdAt-first.
function filterCleanup(records) {
  return records
    .filter((r) => r.facets.effort === 'low')
    .sort((a, b) => bandOf(a) - bandOf(b) || byCreatedAtAsc(a, b));
}

// (unscored records[], budget) -> { selected: records[], remaining: number }.
// Oldest-createdAt-first — surfaces the longest-neglected records first, same
// staleness bias /tidy already uses. No silent truncation: `remaining` is exactly
// how many unscored records this pass didn't read.
function selectBudgetSlice(unscored, budget) {
  const sorted = unscored.slice().sort(byCreatedAtAsc);
  return {
    selected: sorted.slice(0, budget),
    remaining: Math.max(0, sorted.length - budget),
  };
}

// (githubRecords[], unsyncedRecords[]) -> records[]. Concatenates both, tagging
// every record's facets.unsynced explicitly (record.js's parseRecordFacets never
// sets this key at all; local-store.js's facets already carry it truthfully).
// GitHub records come first, preserving their original relative order; unsynced
// records follow, also in their original relative order.
function mergeUnsyncedRecords(githubRecords, unsyncedRecords) {
  const tag = (r, unsynced) => ({ ...r, facets: { ...r.facets, unsynced } });
  return [
    ...githubRecords.map((r) => tag(r, !!r.facets.unsynced)),
    ...unsyncedRecords.map((r) => tag(r, true)),
  ];
}

module.exports = {
  splitScoredUnscored,
  filterCritical,
  rankRiskValue,
  filterCleanup,
  selectBudgetSlice,
  mergeUnsyncedRecords,
};
