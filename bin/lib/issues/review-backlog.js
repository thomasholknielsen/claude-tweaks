// bin/lib/issues/review-backlog.js
// Mechanical filter/sort/split/merge logic for /claude-tweaks:review-backlog's
// Lane A (scored records, unlimited scale) and the scored/unscored split feeding
// Lane B's bounded LLM synthesis pass. Records are expected to already carry
// `.facets` (via record.js's parseRecordFacets or local-store.js's
// readRecord/queryRecords) and, where sorting depends on it, a `.createdAt` ISO
// string. Every function except `deriveCreatedAtFromGit` is pure — no network, no
// fs — mirroring record.js's purity contract; `deriveCreatedAtFromGit` is the one
// deliberate exception (it shells out to `git log`), with its side effect isolated
// behind an injectable `execFn` so callers (and tests) don't have to touch a real
// git repo to exercise it.
'use strict';

const { execSync } = require('child_process');

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

// (records[], { execFn? }) -> records[]. For each record, derives `createdAt`
// from its own last-commit date via `git log -1 --format=%cI -- <path>` — used
// for records whose driver carries no timestamp facet (local-files backend, and
// any unsynced-fallback record), the same approach /tidy's Step 1 staleness clock
// already uses. A git failure (no history, not a git repo) or empty output falls
// back to the current time, matching the two duplicated inline scripts this
// replaces (skills/review-backlog/SKILL.md's Step 1). `execFn` defaults to
// `child_process.execSync` and is injectable so tests never need a real git repo.
function deriveCreatedAtFromGit(records, { execFn = execSync } = {}) {
  return records.map((r) => {
    let createdAt;
    try {
      createdAt = execFn('git log -1 --format=%cI -- ' + JSON.stringify(r.path), { encoding: 'utf8' }).trim();
    } catch {
      createdAt = null;
    }
    return { ...r, createdAt: createdAt || new Date().toISOString() };
  });
}

module.exports = {
  splitScoredUnscored,
  filterCritical,
  rankRiskValue,
  filterCleanup,
  selectBudgetSlice,
  mergeUnsyncedRecords,
  deriveCreatedAtFromGit,
};
