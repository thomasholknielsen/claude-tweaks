// bin/lib/reconcile/cache.js — one local, best-effort cache file backing
// three independent uses (#820, #644): D7's short-TTL "skip the whole pass"
// gate (`lastRunAt`), D6's per-claim content-addressed skip (`claimShas`,
// keyed by issue number, value = the claim blob's own `sha` as last seen),
// and #644's per-path consecutive-failure counter for `move-failed`/
// `removal-failed` residue (`residueFailures`). All three are the same kind
// of thing — a cache miss/reset costs a little extra work or a re-escalation,
// never incorrect skip of real work — so they share one file and one
// read/write path rather than near-identical copies. Lives under the
// MAIN CHECKOUT's .claude-tweaks/ (never a worktree's — see
// _shared/pipeline-run-dir.md's Anchoring section for why), gitignored:
// this is local bookkeeping, not committed audit trail. Persisting here
// (rather than a new file) is what lets the counter survive across process
// invocations: `bin/hooks.js reconcile` (CLI) and `session-start.js`
// (in-process) both read/write the same file, so a fresh process observes
// the prior process's count instead of always starting at zero (#644
// Gotchas: "an in-memory-only counter would silently never reach N").
'use strict';
const fs = require('fs');
const path = require('path');
const { escalateResidue } = require('./escalate-residue');

const CACHE_FILENAME = 'reconcile-cache.json';
const DEFAULT_TTL_MS = 7 * 60 * 1000;

// After this many CONSECUTIVE failures on the same (reason, path), the next
// failure escalates — files/updates a backlog record naming the path and
// last-seen reason (#644 Deliverable 2). 3 is a reasonable default absent a
// stronger signal (documented in the issue, not derived from measurement).
const RESIDUE_ESCALATE_THRESHOLD = 3;

function cachePath(root) {
  return path.join(root, '.claude-tweaks', CACHE_FILENAME);
}

// -> { lastRunAt: number|null, claimShas: {[issueNumber]: string},
//      residueFailures: {[reason:path]: {count, firstFailedAt, lastError, escalated}} }
// Absent file or corrupt JSON both fail closed to empty defaults — a cache
// is pure optimization; never let a bad read block or skew reconcile().
function readCache(root) {
  const empty = { lastRunAt: null, claimShas: {}, residueFailures: {} };
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
      residueFailures: (parsed.residueFailures && typeof parsed.residueFailures === 'object') ? parsed.residueFailures : {},
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

// One entry per (reason, path) pair — a worktree's `removal-failed` and a run
// dir's `move-failed` never collide, but keying on both keeps the two classes
// distinguishable even if a future reason ever reused a path.
function residueKey(reason, targetPath) {
  return `${reason}:${targetPath}`;
}

// Record one more consecutive failure for (reason, targetPath) and persist it
// immediately (read-modify-write on the shared cache file — see the header
// comment on why this file, not a new one). Returns whether THIS call is the
// one that should trigger escalation: count has just reached the threshold
// AND no escalation has fired yet for this still-failing streak. Once fired,
// `escalated` stays true (and shouldEscalate stays false) for every
// subsequent still-failing call, until `recordResidueSuccess` resets the
// entry — this is what keeps escalation a one-shot event rather than a
// re-trigger on every pass past the threshold (#644 Acceptance Criteria).
function recordResidueFailure(root, reason, targetPath, { lastError, now = Date.now(), threshold = RESIDUE_ESCALATE_THRESHOLD } = {}) {
  const cache = readCache(root);
  const failures = { ...cache.residueFailures };
  const key = residueKey(reason, targetPath);
  const existing = failures[key];
  const count = (existing ? existing.count : 0) + 1;
  const firstFailedAt = existing ? existing.firstFailedAt : now;
  const alreadyEscalated = !!(existing && existing.escalated);
  const shouldEscalate = count >= threshold && !alreadyEscalated;
  failures[key] = {
    count,
    firstFailedAt,
    lastError: lastError || (existing && existing.lastError) || null,
    escalated: alreadyEscalated || shouldEscalate,
  };
  writeCache(root, { ...cache, residueFailures: failures });
  return { count, firstFailedAt, shouldEscalate };
}

// A path that succeeded (reaped / moved / archived) has no more residue to
// track — clear its streak so a LATER failure on the same path starts a
// fresh count toward the threshold rather than resuming a stale one, and so
// a resolved path can re-escalate if it starts failing again after recovery.
function recordResidueSuccess(root, reason, targetPath) {
  const cache = readCache(root);
  const key = residueKey(reason, targetPath);
  if (!(key in cache.residueFailures)) return;
  const failures = { ...cache.residueFailures };
  delete failures[key];
  writeCache(root, { ...cache, residueFailures: failures });
}

// #1233 — the shared success/fail branch-into-{recordResidueSuccess,
// recordResidueFailure,escalate} shape that reap-merged.js's
// trackReapResidue and archive-merged.js's trackArchiveResult each used to
// duplicate (differing only in the hardcoded `reason` string and each
// carrying its own near-identical best-effort try/catch around `escalate`).
// Callers keep their own reason-specific vocabulary at the call site —
// archive-merged.js's `result.reason !== 'move-failed'` early-return guard
// in particular stays there, not here, since it's archive-specific and
// unrelated to this branching.
function trackResidue(root, repoSlug, reason, targetPath, { failed, lastError }, { escalate = escalateResidue } = {}) {
  if (!failed) {
    recordResidueSuccess(root, reason, targetPath);
    return;
  }
  const streak = recordResidueFailure(root, reason, targetPath, { lastError });
  if (!streak.shouldEscalate) return;
  try {
    escalate({
      repo: repoSlug, reason, targetPath,
      count: streak.count, firstFailedAt: streak.firstFailedAt, lastError,
    });
  } catch { /* best-effort — never let escalation turn a residue-tracking call into a thrown error */ }
}

// Snapshot for reporting (e.g. the #644 flow closing-report line): every
// currently-tracked residue entry, reason and path split back out of the
// composite key. Read-only — never mutates.
function listResidueFailures(root) {
  const cache = readCache(root);
  return Object.entries(cache.residueFailures).map(([key, entry]) => {
    const sep = key.indexOf(':');
    return {
      reason: sep === -1 ? key : key.slice(0, sep),
      path: sep === -1 ? '' : key.slice(sep + 1),
      ...entry,
    };
  });
}

module.exports = {
  readCache, writeCache, isFresh, CACHE_FILENAME, DEFAULT_TTL_MS, cachePath,
  RESIDUE_ESCALATE_THRESHOLD, residueKey, recordResidueFailure, recordResidueSuccess, listResidueFailures,
  trackResidue,
};
