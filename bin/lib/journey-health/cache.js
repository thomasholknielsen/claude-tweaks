'use strict';
const fs = require('fs');
const path = require('path');

// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/journey-health/{cache,cursors}.json and .../runs/*.json

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'journey-health', 'cache.json');
}

function readCache(root) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(root), 'utf8'));
  } catch {
    return {}; // missing or corrupt -> empty (the cache is an optimization, not state)
  }
}

function writeCache(root, cache) {
  const p = cachePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  return p;
}

function cursorsPath(root) {
  return path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json');
}

function readCursors(root) {
  try {
    return JSON.parse(fs.readFileSync(cursorsPath(root), 'utf8'));
  } catch {
    return {};
  }
}

function writeCursors(root, cursors) {
  const p = cursorsPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cursors, null, 2) + '\n', 'utf8');
  return p;
}

// Record that journey `id` was audited on `tier` ('light' or 'deep'). Light
// and deep cursors are tracked independently on the same entry (merged, not
// overwritten) so a light-tier firing never clobbers the deep-tier cadence,
// or vice versa.
function recordAudit(root, id, tier, { hash = null, whenMs = Date.now() } = {}) {
  const cursors = readCursors(root);
  const existing = cursors[id] || {};
  const patch = tier === 'deep'
    ? { lastDeepAuditMs: whenMs, lastDeepHash: hash }
    : { lastLightAuditMs: whenMs, lastLightHash: hash };
  cursors[id] = { ...existing, ...patch };
  writeCursors(root, cursors);
  return cursors[id];
}

// Coverage-scan cursor is a single global entry (key "__coverageScan"), not
// per-journey — coverage gaps are a whole-library concern, decoupled from
// whichever single journey next-target picked that firing.
function readCoverageScanCursor(root) {
  const cursors = readCursors(root);
  return cursors.__coverageScan || { lastScannedMs: null };
}

function recordCoverageScan(root, { whenMs = Date.now() } = {}) {
  const cursors = readCursors(root);
  cursors.__coverageScan = { lastScannedMs: whenMs };
  writeCursors(root, cursors);
  return cursors.__coverageScan;
}

function runsDir(root) {
  return path.join(root, '.claude-tweaks', 'journey-health', 'runs');
}

// Persist the fingerprint set a firing produced, for churn-report diagnostics.
function recordRun(root, runId, fingerprints) {
  const dir = runsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// All run records, oldest first (by runAt).
function readRuns(root) {
  let entries;
  try {
    entries = fs.readdirSync(runsDir(root));
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(runsDir(root), f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
    .sort((a, b) => {
      const x = a.runAt || '', y = b.runAt || '';
      return x < y ? -1 : x > y ? 1 : 0;
    });
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);
  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = Math.round(((appeared.length + disappeared.length) / total) * 1000) / 1000;
  return { appeared, disappeared, ratio };
}

module.exports = {
  cachePath, readCache, writeCache,
  cursorsPath, readCursors, writeCursors,
  recordAudit, readCoverageScanCursor, recordCoverageScan,
  runsDir, recordRun, readRuns, computeChurn,
};
