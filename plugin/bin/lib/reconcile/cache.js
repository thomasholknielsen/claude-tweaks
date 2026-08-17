// bin/lib/reconcile/cache.js — one local, best-effort cache file backing
// two independent uses (#820): D7's short-TTL "skip the whole pass" gate
// (`lastRunAt`) and D6's per-claim content-addressed skip (`claimShas`,
// keyed by issue number, value = the claim blob's own `sha` as last seen).
// Both are the same kind of thing — a cache miss costs a little extra work,
// never an incorrect skip of real work — so they share one file and one
// read/write path rather than two near-identical copies. Lives under the
// MAIN CHECKOUT's .claude-tweaks/ (never a worktree's — see
// _shared/pipeline-run-dir.md's Anchoring section for why), gitignored:
// this is local bookkeeping, not committed audit trail.
'use strict';
const fs = require('fs');
const path = require('path');

const CACHE_FILENAME = 'reconcile-cache.json';
const DEFAULT_TTL_MS = 7 * 60 * 1000;

function cachePath(root) {
  return path.join(root, '.claude-tweaks', CACHE_FILENAME);
}

// -> { lastRunAt: number|null, claimShas: {[issueNumber]: string} }
// Absent file or corrupt JSON both fail closed to empty defaults — a cache
// is pure optimization; never let a bad read block or skew reconcile().
function readCache(root) {
  const empty = { lastRunAt: null, claimShas: {} };
  let raw;
  try {
    raw = fs.readFileSync(cachePath(root), 'utf8');
  } catch {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      lastRunAt: typeof parsed.lastRunAt === 'number' ? parsed.lastRunAt : null,
      claimShas: (parsed.claimShas && typeof parsed.claimShas === 'object') ? parsed.claimShas : {},
    };
  } catch {
    return empty;
  }
}

// Best-effort — a write failure (unwritable dir, disk full) never throws;
// the next pass just misses the cache and does the work again.
function writeCache(root, cache) {
  try {
    fs.mkdirSync(path.dirname(cachePath(root)), { recursive: true });
    fs.writeFileSync(cachePath(root), JSON.stringify(cache));
  } catch {
    /* best-effort */
  }
}

// Pure — no I/O, no Date.now() call of its own (nowMs is always passed in),
// so it's trivially testable and reusable by both a live caller and a test.
function isFresh(cache, nowMs, ttlMs = DEFAULT_TTL_MS) {
  if (typeof cache.lastRunAt !== 'number') return false;
  return (nowMs - cache.lastRunAt) < ttlMs;
}

module.exports = { readCache, writeCache, isFresh, CACHE_FILENAME, DEFAULT_TTL_MS, cachePath };
