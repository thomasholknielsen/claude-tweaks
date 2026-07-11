'use strict';
const { createCache } = require('../watchman-core/cache');
const { recordRun, computeChurn } = require('../watchman-core/runs');

// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/harness-health/{cache,cursors}.json and .../runs/*.json

const core = createCache('harness-health');

// Record that `key` (a fully-formed cursor key, e.g. "skill:auth" or
// "rule:api-errors") was audited. Shared by wrap-up, init, and the routine —
// whichever consumer analyzes a target writes its cursor here so the others'
// rotation/classification skips it.
function recordAudit(root, key, { sha = null, whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  cursors[key] = { lastAuditedSha: sha, lastAuditedMs: whenMs };
  core.writeCursors(root, cursors);
  return cursors[key];
}

// Gap-scan cursor is a single global entry (key "__gapScan"), not per-skill.
function readGapScanCursor(root) {
  const cursors = core.readCursors(root);
  return cursors.__gapScan || { lastScannedSha: null, lastScannedMs: null };
}

function recordGapScan(root, { sha = null, whenMs = Date.now() } = {}) {
  const cursors = core.readCursors(root);
  cursors.__gapScan = { lastScannedSha: sha, lastScannedMs: whenMs };
  core.writeCursors(root, cursors);
  return cursors.__gapScan;
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
  readGapScanCursor,
  recordGapScan,
  runsDir: core.runsDir,
  recordRun: boundRecordRun,
  readRuns: core.readRuns,
  computeChurn,
};
