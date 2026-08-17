'use strict';

// Shared stale-then-churn rotation-selector core, extracted from the four
// health engines' own scope.js files (code-health#selectSlice,
// harness-health/docs-health/journey-health#selectTarget) — all four
// independently reimplemented the identical two-phase shape (Phase 1:
// force-pick the candidate most overdue past a staleness threshold; Phase 2:
// among the rest, score and pick the highest — both tie-broken by id) before
// this extraction. Each engine still owns its own candidate-listing and
// churn/score computation — this module only owns the phase mechanics.
//
// Deliberately NOT a one-size-fits-all: the four engines differ in real,
// preserved ways —
//   - cursor-key derivation (bare id, "doc:id", "${kind}:id", or a
//     tier-dependent field name) — supplied via getCursorKey/getLastAuditedMs.
//   - Phase 2's inclusion rule: code-health includes a candidate whenever its
//     content hash changed (even at score 0 — an uncommitted local edit with
//     no matching git-log commit yet); the other three include only when
//     churn > 0. Expressed uniformly here as "computeScore returns null to
//     exclude, a number (including 0) to include" — each engine's own
//     computeScore decides what null means for itself.
//   - the exact return shape Phase 1/Phase 2 build: code-health's stale/
//     hotspot results carry no daysSinceLastAudit/churnCount field; the other
//     three do. Overridable via buildStaleResult/buildHotspotResult.
//
// journey-health's Phase 0 (deleted-file force-pick, light-tier only) and its
// light/deep tier duplication are NOT part of this shared core — they layer
// on top in journey-health's own selectTarget, which still calls this module
// for its Phase 1/2 shape once Phase 0 has had its chance to return first.

function defaultBuildStaleResult(candidate, daysSince) {
  return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
}

function defaultBuildHotspotResult(candidate, score) {
  return { ...candidate, why: 'hotspot', churnCount: score };
}

function defaultTieBreakKey(candidate) {
  return candidate.id;
}

// candidates: array of candidate objects (already listed/filtered by the caller).
// cursors: the raw cursor map (caller's own shape — this module never assumes
//   a specific cursor-key convention; getCursorKey supplies it).
// opts:
//   now             - epoch ms; defaults to Date.now().
//   staleDays       - Phase 1 threshold (required).
//   getCursorKey    - (candidate) => string; required.
//   getLastAuditedMs- (cursor|undefined) => number|null; required.
//   computeScore    - (candidate, cursor, sinceMs) => number|null; required.
//                     Return null to exclude the candidate from Phase 2
//                     entirely (the hash-unchanged / zero-churn skip); return
//                     a number (0 is valid) to include it at that score.
//   tieBreakKey     - (candidate) => sortable value; defaults to candidate.id.
//                     Used by BOTH phases — Phase 1 for candidates of equal
//                     staleness (notably the shared Infinity of every
//                     never-audited candidate), Phase 2 for equal scores.
//   buildStaleResult, buildHotspotResult - override the returned shape.
//
// Returns the selected candidate (spread + why + engine-chosen extra fields)
// or null when there is nothing to force-pick and nothing scored.
function selectByStaleThenChurn(candidates, cursors, opts) {
  const {
    now = Date.now(),
    staleDays,
    getCursorKey,
    getLastAuditedMs,
    computeScore,
    tieBreakKey = defaultTieBreakKey,
    buildStaleResult = defaultBuildStaleResult,
    buildHotspotResult = defaultBuildHotspotResult,
  } = opts;

  if (!candidates || candidates.length === 0) return null;

  // Phase 1: force-pick the MOST overdue candidate past staleDays.
  //
  // Selecting max(daysSince) rather than returning on the first match is what
  // makes this a rotation at all. First-qualifying-wins starved every
  // candidate set larger than staleDays (#130): each run advances exactly one
  // candidate, so coverage marched down the (id-sorted) list one slot per
  // run — but by run number `staleDays` the head of the list had re-crossed
  // the threshold and was force-picked again, long before the march reached
  // the tail. Everything past position ≈ staleDays was permanently
  // unreachable (measured: ~59% of docs-health's 146 docs at staleDays 60;
  // >90% of code-health's slices at MAX_STALE_DAYS 30).
  //
  // Ties resolve by tieBreakKey, which matters more here than in Phase 2:
  // every never-audited candidate sits at Infinity, so a fresh repo's whole
  // pool is one big tie and tieBreakKey alone gives it a stable order.
  let stalest = null; // { candidate, daysSince, key }
  for (const candidate of candidates) {
    const cursor = cursors[getCursorKey(candidate)];
    const lastAuditedMs = getLastAuditedMs(cursor);
    const daysSince = lastAuditedMs == null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (!(daysSince > staleDays)) continue; // negated, so a NaN daysSince skips rather than competes
    const key = tieBreakKey(candidate);
    if (stalest === null
      || daysSince > stalest.daysSince
      || (daysSince === stalest.daysSince && key < stalest.key)) {
      stalest = { candidate, daysSince, key };
    }
  }
  if (stalest) return buildStaleResult(stalest.candidate, stalest.daysSince);

  // Phase 2: among non-stale candidates, score and pick the highest.
  const scored = [];
  for (const candidate of candidates) {
    const cursor = cursors[getCursorKey(candidate)] || {};
    const lastAuditedMs = getLastAuditedMs(cursor);
    const sinceMs = lastAuditedMs || 0;
    const score = computeScore(candidate, cursor, sinceMs);
    if (score != null) scored.push({ candidate, score });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ak = tieBreakKey(a.candidate);
    const bk = tieBreakKey(b.candidate);
    return ak < bk ? -1 : 1;
  });
  return buildHotspotResult(scored[0].candidate, scored[0].score);
}

module.exports = { selectByStaleThenChurn };
