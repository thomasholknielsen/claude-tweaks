const fs = require('fs');
const path = require('path');

// Gitignored, rebuildable-from-issues dedup cache.
// Canonical path: <root>/.claude-tweaks/recon/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'remembered'|'regressed', issue: <number|null> } }

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'recon', 'cache.json');
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

module.exports = { cachePath, readCache, writeCache };
