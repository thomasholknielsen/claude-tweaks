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
// bin/lib/code-health/tests/*) keep importing it from this module.

// Pure: computes the next durable-state object for a validate-findings run.
// current: { cursors, remembered, retryQueue, runs } — the current durable
// health-state shape (as returned by readDurableState).
// opts: { areasSwept: string[], hashes: { [areaId]: string }, rememberedDelta: object,
//         runRecord: { runId, runAt, fingerprints }, now?: number }
//
// This is the exact logic bin/code-health.js's cmdValidateFindings hands to
// writeDurableState as its mutator — extracted here (no git, no gh, no I/O)
// so its four behaviors (selective per-swept-area cursor update, un-swept-area
// cursor preservation, remembered-delta merge, run-history append) can be
// unit tested directly with plain-object fixtures. See
// bin/lib/code-health/tests/build-validate-findings-update.test.js.
function buildValidateFindingsUpdate(current, { areasSwept, hashes, rememberedDelta, runRecord, now = Date.now() }) {
  const cursors = { ...current.cursors };
  for (const areaId of areasSwept) {
    const existing = cursors[areaId] || {};
    cursors[areaId] = {
      ...existing,
      lastSweptMs: now,
      ...(hashes[areaId] != null ? { lastHash: hashes[areaId] } : {}),
    };
  }
  return {
    ...current,
    cursors,
    remembered: { ...current.remembered, ...rememberedDelta },
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
