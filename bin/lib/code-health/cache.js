'use strict';
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');
const { computeChurn } = require('../health-core/runs');

// Local, gitignored: cache.json only (open/closed/wontfix/regressed dedup —
// rebuildable from `gh issue list`, so it's fine to stay local/ephemeral).
// Canonical path: <root>/.claude-tweaks/code-health/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'regressed', issue: <number|null> } }
//
// Cursors, the sub-threshold "remembered" cache, the retry queue, and run
// history are durable instead — they live on the health-state branch (see
// _shared/health-state.md), not local disk, since local disk doesn't survive
// a scheduled cloud-routine firing's container recycling between runs.

const core = createCache('code-health');
const durable = createDurableState('code-health', { includeRemembered: true });

// computeChurn (union-denominator ratio + the `stayed` field) now lives once
// in health-core/runs.js, shared by all four health-suite engines — re-export
// it here so existing call sites (bin/code-health.js,
// tests/bin-lib/code-health/*) keep importing it from this module.

// Pure: computes the next durable-state object for a validate-findings run.
// current: { cursors, remembered, retryQueue, runs } — the current durable
// health-state shape (as returned by readDurableState).
// opts: { areasSwept: string[], hashes: { [areaId]: string },
//         rememberCandidates: [{ id, severity, risk }],
//         runRecord: { runId, runAt, fingerprints }, now?: number }
//
// rememberCandidates (not a pre-computed delta object) so the "already
// remembered, don't touch it" check below is evaluated against THIS
// invocation's own `current.remembered` — writeDurableState's CAS loop calls
// its mutator fresh (a real refetch) on every retry attempt, so computing
// the delta here, inside the mutator, means the check always sees the
// freshest available state instead of a snapshot the caller read before the
// CAS loop even started (which could be stale by the time of the write —
// e.g. a concurrent code-health firing in the intervening window).
//
// This is the exact logic bin/code-health.js's cmdValidateFindings hands to
// writeDurableState as its mutator — extracted here (no git, no gh, no I/O)
// so its four behaviors (selective per-swept-area cursor update, un-swept-area
// cursor preservation, remembered-candidate merge, run-history append) can be
// unit tested directly with plain-object fixtures. See
// tests/bin-lib/code-health/build-validate-findings-update.test.js.
function buildValidateFindingsUpdate(current, { areasSwept, hashes, rememberCandidates, runRecord, now = Date.now() }) {
  const cursors = { ...current.cursors };
  for (const areaId of areasSwept) {
    const existing = cursors[areaId] || {};
    cursors[areaId] = {
      ...existing,
      lastSweptMs: now,
      ...(hashes[areaId] != null ? { lastHash: hashes[areaId] } : {}),
    };
  }
  const remembered = { ...current.remembered };
  for (const { id, severity, risk } of rememberCandidates || []) {
    if (!remembered[id]) {
      remembered[id] = { status: 'remembered', issue: null, severity, risk };
    }
  }
  return {
    ...current,
    cursors,
    remembered,
    runs: [...current.runs, runRecord],
  };
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  computeChurn,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
  buildValidateFindingsUpdate,
};
