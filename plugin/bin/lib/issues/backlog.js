// bin/lib/issues/backlog.js
// Mechanical filter/sort/split/merge logic for /claude-tweaks:backlog's
// overview mode (scored records, unlimited scale — critical/risk-value/cleanup
// lenses, plus funnelBuckets powering overview's bare-mode funnel decision
// surface over the whole open queue) and refine mode's bounded LLM synthesis
// pass over unscored records. `selectBudgetSlice` also bounds refine mode's
// grant-check pass over ready+ungranted records — it's population-agnostic, just an oldest-first
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
const { blockersOf } = require('./ranking');

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
// The sort both single-axis lenses (filterCritical, filterCleanup) use once
// they've filtered: priority band first, then oldest-createdAt-first.
const byPriorityThenAge = (a, b) => bandOf(a) - bandOf(b) || byCreatedAtAsc(a, b);

// records[] -> { scored: records[], unscored: records[] }. Scored = carries both
// risk:* and size:* (the two labels /specify's shaping and the health skills'
// born-ready filing always stamp together). Order within each bucket is preserved
// from the input array — callers sort afterward per mode.
function splitScoredUnscored(records) {
  const scored = [];
  const unscored = [];
  for (const r of records) {
    if (r.facets.risk && r.facets.size) scored.push(r);
    else unscored.push(r);
  }
  return { scored, unscored };
}

// records[] -> records[] filtered to risk:high, sorted by priority band then
// oldest-createdAt-first. Only scored records ever carry risk:*, so this is safe
// to call on a mixed scored+unscored array directly.
function filterCritical(records) {
  return records.filter((r) => r.facets.risk === 'high').sort(byPriorityThenAge);
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

// records[] -> records[] filtered to size:low, sorted by priority band then
// oldest-createdAt-first.
function filterCleanup(records) {
  return records.filter((r) => r.facets.size === 'low').sort(byPriorityThenAge);
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
// duplicated inline scripts this replaces (skills/backlog/overview-mode.md's
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

// records[] -> the ready+granted subset only — the exact candidate set
// overview-mode.md Step 2's native blockedBy pre-attach fetch must target
// (refs #563). NOT the same as Step 3's buildable subset (dispatchable ∪
// granted) — this runs BEFORE funnelBuckets has produced those buckets, so
// "granted" here is computed independently of the in-set-blockers split
// that native resolution is meant to correct. It also doesn't exclude
// `isParentIssue` records, which funnelBuckets routes to `parents` rather than
// `granted`/`dispatchable` — harmless, since a parent is never `ready`
// (`_shared/work-record.md`'s Decomposition rules), so this stays the
// buildable candidate set on any conforming repo.
function readyGrantedSubset(records) {
  return records.filter((r) => r.facets.stage === 'ready' && (r.facets.grants.build || r.facets.grants.merge));
}

// records[] -> { captured, scored, shaped, granted, dispatchable, inFlight,
// parked, notPlanned, parents, needsYou }. The nine stage keys
// (captured..parents) are mutually exclusive buckets over the post-merge
// faceted set (github + unsynced); needsYou is a separate overlay, not a
// bucket — see the overlay loop's comment below. Together they form the funnel
// decision surface /claude-tweaks:backlog overview's bare mode renders. First
// match wins, in this order for the nine stage keys; the precedence
// rationale: bot-state outranks stage labels because live work reflects current
// reality (a record simultaneously bot:in-progress and parked/ready resolves
// toward what is actually happening right now), and granted is checked before
// dispatchable so a blocked grant can never render as go-now. Blocker
// resolution — including the unsynced-namespace short-circuit (parent #512
// promise F1) — is delegated to ranking.js's `blockersOf`, the single owner
// of precedence (unsynced → top-level `r.blockedBy` → `facets.blockedBy` →
// body-text `parseDependencies` fallback), shared with rankNextToBuild so
// both consumers agree on the same blocker for the same record (refs #514).
// Only ids within the open input set count as blockers, since an out-of-set
// blocker cannot be acted on from this report. Note `scored` here is a
// different definition from splitScoredUnscored's: this funnel's scored
// means ANY scoring signal has been applied (priority, risk, or size), where
// splitScoredUnscored's scored means FULLY scored — both risk and size — for
// the lens views. Deliberate, not drift: the funnel tracks "has triage
// started?" while the lenses need "is there enough signal to rank on?".
function funnelBuckets(records) {
  const buckets = {
    captured: [], scored: [], shaped: [], granted: [],
    dispatchable: [], inFlight: [], parked: [], notPlanned: [], parents: [],
  };
  const openIds = new Set(records.map((r) => r.number ?? r.id).filter((n) => n != null));
  for (const r of records) {
    const f = r.facets;
    const granted = f.grants.build || f.grants.merge;
    // Blocker precedence, INCLUDING the unsynced-namespace short-circuit, is
    // owned by ranking.js's blockersOf — one decision, shared with
    // rankNextToBuild (refs #514).
    const inSetBlockers = blockersOf(r).filter((id) => openIds.has(id));
    if (f.bot.inProgress) buckets.inFlight.push(r);
    else if (f.stage === 'parked') buckets.parked.push(r);
    else if (f.notPlanned) buckets.notPlanned.push(r);
    else if (f.isParentIssue) buckets.parents.push(r);
    else if (f.stage === 'ready' && granted && inSetBlockers.length > 0) buckets.granted.push(r);
    else if (f.stage === 'ready' && granted) buckets.dispatchable.push(r);
    else if (f.stage === 'ready') buckets.shaped.push(r);
    else if (f.priority || f.risk || f.size) buckets.scored.push(r);
    else buckets.captured.push(r);
  }
  // needsYou is an OVERLAY, never a tenth stage: every record above keeps its
  // one primary bucket (exclusivity and sum-to-total invariants untouched).
  // Both needs-facets are LIVE on both drivers (record.js for github-issues,
  // local-store.js for local-files): needsDefinition since the needs:definition
  // taxonomy shipped, solutionUnjustified since record #677 renamed
  // framing:baked -> solution:unjustified. A record carrying both facets yields
  // one entry with kind 'definition' — the hard gate dominates. needs:definition
  // exclusion from the Shape paste block happens at RENDER, never here.
  const needsYou = [];
  for (const r of records) {
    const f = r.facets;
    // The human lane covers records still in play — a bot is actively
    // building an inFlight record, and parked/not-planned records are
    // /tidy's domain; surfacing them as the session's recommended move would
    // invert the lane's premise. A decomposition parent is skipped too: it
    // routes to the `parents` bucket above, never `dispatchable`, and its
    // needs-you launcher would misroute to `/specify #N` on a parent
    // (#616's defect class, reappearing on this overlay surface — #766).
    // Skip before the facet checks below.
    if (f.bot.inProgress || f.stage === 'parked' || f.notPlanned === true || f.isParentIssue) continue;
    const id = r.number ?? r.id;
    if (f.needsDefinition === true) needsYou.push({ id, kind: 'definition' });
    else if (f.solutionUnjustified === true) needsYou.push({ id, kind: 'unjustified' });
  }
  buckets.needsYou = needsYou;
  return buckets;
}

// ({ allRows, readyRows, priorityBudget, grantBudget }) -> the refine sweep's
// mechanical prelude in one pass. allRows = the merged faceted open set;
// readyRows = the grant fetch's rows, already origin-filtered by the caller —
// defaults to [] for work-backend: local-files, where the grant fetch never
// runs (Preflight skips it), so fresh/blocked/inProgress and grantSlice.selected
// all come back empty while missingPriority/missingRiskSize/prioritySlice still
// compute from allRows. prioritySlice keys on missingPriority — the population
// Step 2's sweep actually stamps (refs #460); grantSlice keys on fresh, unchanged.
function refineWorklist({ allRows, readyRows = [], priorityBudget, grantBudget }) {
  const worklist = readyRows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  const inProgress = worklist.filter((r) => !r.facets.bot.blocked && r.facets.bot.inProgress);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress);
  const missingPriority = allRows.filter((r) => r.facets.priority == null);
  const missingRiskSize = allRows.filter((r) => !(r.facets.risk && r.facets.size));
  return {
    fresh,
    blocked,
    inProgress,
    missingPriority,
    missingRiskSize,
    prioritySlice: selectBudgetSlice(missingPriority, priorityBudget),
    grantSlice: selectBudgetSlice(fresh, grantBudget),
    counts: {
      fresh: fresh.length,
      blocked: blocked.length,
      inProgress: inProgress.length,
      missingPriority: missingPriority.length,
      missingRiskSize: missingRiskSize.length,
    },
  };
}

module.exports = {
  splitScoredUnscored,
  filterCritical,
  rankRiskValue,
  filterCleanup,
  selectBudgetSlice,
  mergeUnsyncedRecords,
  deriveCreatedAtFromGit,
  funnelBuckets,
  readyGrantedSubset,
  refineWorklist,
};
