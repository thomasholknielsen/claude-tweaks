'use strict';
const fs = require('fs');
const path = require('path');

// Generic gitignored cache persistence shared by the four health skills
// (code-health, harness-health, journey-health, docs-health). Each skill's
// own cache.js binds `skillName` once via createCache() and layers its own
// recordAudit()/cursor-shape logic on top — the shape of a cache entry is
// domain-specific per skill; this module only owns where/how the JSON lives
// on disk. Cursor and run-record local-disk persistence (cursorsPath/
// readCursors/writeCursors/runsDir/readRuns) was removed by the
// durable-state migration: cursors and run history now live on the
// health-state git branch (see _shared/health-state.md), read via
// readDurableState(root), not from local disk — see runs.js's
// recordRun/readRuns removal for the same migration on the sibling module.
function createCache(skillName) {
  function cachePath(root) { return path.join(root, '.claude-tweaks', skillName, 'cache.json'); }
  function readCache(root) {
    try { return JSON.parse(fs.readFileSync(cachePath(root), 'utf8')); }
    catch { return {}; }
  }
  function writeCache(root, cache) {
    const p = cachePath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    return p;
  }
  return { cachePath, readCache, writeCache };
}

module.exports = { createCache };
