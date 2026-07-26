// bin/lib/issues/backlog.js
// Mechanical filter/sort/split/merge logic for /claude-tweaks:backlog's
// overview mode (scored records, unlimited scale — critical/risk-value/cleanup
// lenses) and refine mode's bounded LLM synthesis pass over unscored records.
// `selectBudgetSlice` also bounds refine mode's grant-check pass over
// ready+ungranted records — it's population-agnostic, just an oldest-first
// slice with a `remaining` count. Records are expected to already carry
// `.facets` (via record.js's parseRecordFacets or local-store.js's
// readRecord/queryRecords) and, where sorting depends on it, a `.createdAt` ISO
// string. Every function except `deriveCreatedAtFromGit` is pure — no network, no
// fs — mirroring record.js's purity contract; `deriveCreatedAtFromGit` is the one
// deliberate exception (it shells out to `git log`), with its side effect isolated
// behind an injectable `execFn` so callers (and tests) don't have to touch a real
// git repo to exercise it.
'use strict';

const { execSync } = require('child_process');
const { PRIORITIES, TIERS } = require('./record');

// Urgency order shared by both bands (high first). Values are validated
// against record.js's canonical PRIORITIES/TIERS vocabulary before this
// lookup — local-store.js's frontmatter parser accepts priority:/risk:
// values verbatim with no enum check, so a hand-edited or future-taxonomy
// record can carry an out-of-vocabulary value; treating that like the null/
// absent case (band 3) instead of looking it up unconditionally avoids an
// `undefined - 0 = NaN` comparator silently corrupting sort order.
const RANK = { high: 0, medium: 1, low: 2 };
const bandOf = (r) => (r.facets.priority && PRIORITIES.includes(r.facets.priority) ? RANK[r.facets.priority] : 3);
const riskBandOf = (r) => (r.facets.risk && TIERS.includes(r.facets.risk) ? RANK[r.facets.risk] : 3);
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

// Sentinel byte prefixing each commit's date line in the batched `git log`
// output below — a control character that can never appear at the START of
// a real relative file path, so it unambiguously distinguishes "this line is
// a commit-date marker" from "this line is a filename" without relying on
// git's own (format-dependent, easy to mis-parse) blank-line conventions.
const COMMIT_DATE_MARKER = '\x01';

// (records[], { execFn? }) -> records[]. Derives `createdAt` for every record
// from its own last-commit date — used for records whose driver carries no
// timestamp facet (local-files backend, and any unsynced-fallback record),
// the same approach /tidy's Step 1 staleness clock already uses. Resolves
// every record from a SINGLE `git log --name-only` walk of the whole
// repository history (newest commit first, git log's default order) instead
// of one `git log -1 -- <path>` subprocess per record: for each path, the
// FIRST commit encountered while walking newest-to-oldest is by construction
// the most recent commit touching it, so a single pass building a
// path->date map answers every record's lookup. A record whose path never
// appears in that map (git failure — no history, not a git repo — or a path
// with no commits yet) falls back to the current time, matching the two
// duplicated inline scripts this replaces (skills/review-backlog/SKILL.md's
// Step 1). `execFn` defaults to `child_process.execSync` and is injectable so
// tests never need a real git repo.
function deriveCreatedAtFromGit(records, { execFn = execSync } = {}) {
  if (records.length === 0) return [];

  const dateByPath = {};
  try {
    const out = execFn(`git log --name-only --format=${COMMIT_DATE_MARKER}%cI`, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    });
    let currentDate = null;
    for (const rawLine of out.split('\n')) {
      if (rawLine.startsWith(COMMIT_DATE_MARKER)) {
        currentDate = rawLine.slice(COMMIT_DATE_MARKER.length);
        continue;
      }
      const p = rawLine.trim();
      if (p !== '' && currentDate && !(p in dateByPath)) dateByPath[p] = currentDate;
    }
  } catch {
    // Degrade to every record falling back to now() below — same contract
    // as the previous per-record implementation's catch branch.
  }

  return records.map((r) => ({ ...r, createdAt: dateByPath[r.path] || new Date().toISOString() }));
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
