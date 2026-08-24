// plugin/bin/lib/file-lock.js
// Directory-based mutex generalized from bin/lib/hooks/context.js's
// acquireRunStateLock/releaseRunStateLock (there, hardcoded to a
// runDir-scoped `.run-state.lock`) — same mechanism (fs.mkdirSync is atomic
// on every platform Node supports: EEXIST if another writer already holds
// it), parameterized by an arbitrary lock path so a non-run-dir store
// (declined-learning/store.js) can guard its own read-modify-write without
// hand-rolling a second copy. context.js keeps its own copy unchanged — this
// module is for new callers, not a refactor of that one.
'use strict';
const fs = require('fs');
const path = require('path');

// Overridable via CLAUDE_TWEAKS_LOCK_WAIT_MS — same test-only knob
// context.js's resolveLockWaitMs documents (production never sets it, so it
// always gets the 500ms default).
function resolveLockWaitMs() {
  const raw = process.env.CLAUDE_TWEAKS_LOCK_WAIT_MS;
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : 500;
}

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* best-effort */ }
}

const LOCK_POLL_MS = 10;
const LOCK_STALE_MS = 5000; // a lock dir older than this is treated as abandoned (holder crashed) and reclaimed

// Acquires a mkdir-based lock at `lockPath`, waiting up to LOCK_WAIT_MS
// (reclaiming a lock dir older than LOCK_STALE_MS as abandoned). Returns
// lockPath on success, null on timeout — the caller proceeds unlocked
// (this project's posture: never break a caller over bookkeeping state; a
// missed lock just reopens the pre-existing race window instead of hanging).
function acquireLock(lockPath) {
  const deadline = Date.now() + resolveLockWaitMs();
  const parentDir = path.dirname(lockPath);
  for (;;) {
    try {
      fs.mkdirSync(lockPath);
      return lockPath;
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        // The lock's own parent directory doesn't exist yet -- the common
        // bootstrap race on a fresh project's first-ever concurrent write
        // (nothing has run the store's own mkdirSync yet). Create it and
        // retry the lock attempt, rather than treating this as "nothing to
        // lock" and letting every concurrent caller skip locking entirely
        // (#1269 follow-up: this was silently unlocking every worker racing
        // a brand-new store).
        try { fs.mkdirSync(parentDir, { recursive: true }); } catch { /* races with a sibling creator are fine */ }
        if (Date.now() >= deadline) return null;
        continue;
      }
      if (!e || e.code !== 'EEXIST') return null; // some other mkdir failure — nothing to lock
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > LOCK_STALE_MS) { fs.rmdirSync(lockPath); continue; } // reclaim an abandoned lock, retry immediately
      } catch { /* raced with another reclaimer, or the lock is already gone — just retry below */ }
      if (Date.now() >= deadline) return null;
      sleepSync(LOCK_POLL_MS);
    }
  }
}

function releaseLock(lockPath) {
  if (!lockPath) return;
  try { fs.rmdirSync(lockPath); } catch { /* best-effort */ }
}

// Runs `fn` (synchronously) holding the lock at `lockPath`, always releasing
// in a finally — fail-open: `fn` still runs even when the lock couldn't be
// acquired in time, matching acquireLock's own fail-open contract.
function withLock(lockPath, fn) {
  const held = acquireLock(lockPath);
  try {
    return fn();
  } finally {
    releaseLock(held);
  }
}

module.exports = { acquireLock, releaseLock, withLock };
