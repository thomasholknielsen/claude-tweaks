'use strict';
const fs = require('fs');
const path = require('path');
const { createCache } = require('../health-core/cache');

// Gitignored, rebuildable-from-issues dedup cache.
// Canonical path: <root>/.claude-tweaks/code-health/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'remembered'|'regressed', issue: <number|null> } }

const core = createCache('code-health');

// Persist the fingerprint set this run produced. runId is an ISO-ish timestamp;
// colons are valid on Linux/macOS so the runId round-trips into the filename.
// arg: { fingerprints, areasSwept, hashes } — areasSwept is the list of area ids swept this run;
// hashes is an optional map of areaId -> content hash to persist as lastHash on each cursor.
function recordRun(rootDir, runId, { fingerprints, areasSwept = [], hashes = {} } = {}) {
  const dir = core.runsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');

  // Persist per-area sweep cursors so the round-robin coverage floor rotates.
  if (areasSwept.length > 0) {
    const now = Date.now();
    const cursors = core.readCursors(rootDir);
    for (const areaId of areasSwept) {
      const existing = cursors[areaId] || {};
      cursors[areaId] = {
        ...existing,
        lastSweptMs: now,
        ...(hashes && hashes[areaId] != null ? { lastHash: hashes[areaId] } : {}),
      };
    }
    core.writeCursors(rootDir, cursors);
  }

  return record;
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
// PORT.md delta #5: union denominator, NOT max(prior, current).
// A complete turnover gives ratio 1.0; no changes gives ratio 0.0.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);

  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const stayed = currentFps.filter((fp) => prior.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const raw = (appeared.length + disappeared.length) / total;
  const ratio = Math.round(raw * 1000) / 1000;

  return { appeared, disappeared, stayed, ratio };
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  runsDir: core.runsDir,
  cursorsPath: core.cursorsPath,
  readCursors: core.readCursors,
  writeCursors: core.writeCursors,
  recordRun,
  readRuns: core.readRuns,
  computeChurn,
};
