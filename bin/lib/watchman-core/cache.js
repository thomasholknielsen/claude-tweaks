'use strict';
const fs = require('fs');
const path = require('path');

// Generic gitignored cache/cursor/runs persistence shared by the health
// watchmen (code-health, harness-health, journey-health). Each skill's own
// cache.js binds `skillName` once via createCache() and layers its own
// recordAudit()/cursor-shape logic on top — the shape of a cursor entry is
// domain-specific per skill; this module only owns where/how the JSON lives
// on disk.
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
  function cursorsPath(root) { return path.join(root, '.claude-tweaks', skillName, 'cursors.json'); }
  function readCursors(root) {
    try { return JSON.parse(fs.readFileSync(cursorsPath(root), 'utf8')); }
    catch { return {}; }
  }
  function writeCursors(root, cursors) {
    const p = cursorsPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cursors, null, 2) + '\n', 'utf8');
    return p;
  }
  function runsDir(root) { return path.join(root, '.claude-tweaks', skillName, 'runs'); }
  function readRuns(root) {
    let entries;
    try { entries = fs.readdirSync(runsDir(root)); }
    catch { return []; }
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(runsDir(root), f), 'utf8')); }
        catch { return null; }
      })
      .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
      .sort((a, b) => {
        const x = a.runAt || '', y = b.runAt || '';
        return x < y ? -1 : x > y ? 1 : 0;
      });
  }
  return { cachePath, readCache, writeCache, cursorsPath, readCursors, writeCursors, runsDir, readRuns };
}

module.exports = { createCache };
