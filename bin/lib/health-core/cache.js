'use strict';
const fs = require('fs');
const path = require('path');
const { defaultSleep } = require('./durable-state');

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

  // Atomic read-modify-write: readCache/writeCache alone are two independent
  // steps, so two near-simultaneous callers each doing "read -> mutate ->
  // write" (e.g. two overlapping `mark <fp> declined` CLI invocations
  // against the same skill's cache.json) can both read the same initial
  // JSON, and whichever writeCache call lands last silently clobbers the
  // other's update. updateCache closes that window with a short-lived
  // advisory lock (exclusive-create on a sibling `.lock` file, same
  // wx-flag technique local-store.js's createRecord uses for its own
  // cross-caller exclusivity) held across the whole read+mutate+write.
  //
  // A lock that can never be acquired (a crashed holder that never released
  // it) must fail loudly rather than hang forever or silently proceed
  // unguarded — either of those would defeat the very race this exists to
  // close — so this throws once maxAttempts is exhausted.
  function updateCache(root, mutatorFn, { maxAttempts = 50, retryDelayMs = 20, sleep = defaultSleep } = {}) {
    const p = cachePath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const lockPath = `${p}.lock`;
    let acquired = false;
    for (let attempt = 0; attempt < maxAttempts && !acquired; attempt++) {
      try {
        fs.writeFileSync(lockPath, String(process.pid), { encoding: 'utf8', flag: 'wx' });
        acquired = true;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        sleep(retryDelayMs);
      }
    }
    if (!acquired) {
      throw new Error(`updateCache: could not acquire lock at ${lockPath} after ${maxAttempts} attempts`);
    }
    try {
      const next = mutatorFn(readCache(root));
      writeCache(root, next);
      return next;
    } finally {
      try { fs.unlinkSync(lockPath); } catch { /* best-effort release */ }
    }
  }

  return { cachePath, readCache, writeCache, updateCache };
}

module.exports = { createCache };
