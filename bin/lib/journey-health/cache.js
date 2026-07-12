'use strict';
const { createCache } = require('../watchman-core/cache');
const { recordRun, computeChurn } = require('../watchman-core/runs');

// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/journey-health/{cache,cursors}.json and .../runs/*.json

const core = createCache('journey-health');

// Record that journey `id` was audited on `tier` ('light' or 'deep'). Light
// and deep cursors are tracked independently on the same entry (merged, not
// overwritten) so a light-tier firing never clobbers the deep-tier cadence,
// or vice versa.
function recordAudit(root, id, tier, { hash = null, whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  const existing = cursors[id] || {};
  const patch = tier === 'deep'
    ? { lastDeepAuditMs: whenMs, lastDeepHash: hash }
    : { lastLightAuditMs: whenMs, lastLightHash: hash };
  cursors[id] = { ...existing, ...patch };
  core.writeCursors(root, cursors);
  return cursors[id];
}

// Coverage-scan cursor is a single global entry (key "__coverageScan"), not
// per-journey — coverage gaps are a whole-library concern, decoupled from
// whichever single journey next-target picked that firing.
function readCoverageScanCursor(root) {
  const cursors = core.readCursors(root);
  return cursors.__coverageScan || { lastScannedMs: null };
}

function recordCoverageScan(root, { whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  cursors.__coverageScan = { lastScannedMs: whenMs };
  core.writeCursors(root, cursors);
  return cursors.__coverageScan;
}

function boundRecordRun(root, runId, fingerprints) {
  return recordRun(core.runsDir(root), runId, fingerprints);
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  cursorsPath: core.cursorsPath,
  readCursors: core.readCursors,
  writeCursors: core.writeCursors,
  recordAudit,
  readCoverageScanCursor,
  recordCoverageScan,
  runsDir: core.runsDir,
  recordRun: boundRecordRun,
  readRuns: core.readRuns,
  computeChurn,
};
