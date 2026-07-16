'use strict';
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');

// Local, gitignored: cache.json only (rebuildable-from-issues dedup state).
// Canonical path: <root>/.claude-tweaks/docs-health/cache.json
//
// Cursors and run history are durable instead — they live on the
// health-state branch (see _shared/health-state.md), not local disk, since
// local disk doesn't survive a scheduled cloud-routine firing's container
// recycling.

const core = createCache('docs-health');
const durable = createDurableState('docs-health');

// Pure: computes the next durable-state object for a validate-findings run.
// current: { cursors, retryQueue, runs } — the current durable health-state
// shape (as returned by readDurableState). docs-health has a single kind
// ('doc') and no gap-scan concept, so this is simpler than harness-health's
// equivalent — no `kind` param, no `__gapScan` cursor.
// opts: { target, runRecord, now? }
function buildValidateFindingsUpdate(current, { target, runRecord, now = Date.now() }) {
  const cursors = { ...current.cursors };
  if (target) {
    cursors[`doc:${target}`] = { lastAuditedMs: now };
  }
  return { ...current, cursors, runs: [...current.runs, runRecord] };
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
  buildValidateFindingsUpdate,
};
