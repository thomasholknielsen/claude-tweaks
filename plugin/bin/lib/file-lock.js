// bin/lib/file-lock.js — a directory-based mutex (mkdir succeeds exactly
// once for any set of racing callers; every filesystem this repo targets
// implements mkdir as an atomic existence check) plus a stale-lock reclaim
// so a crashed holder can't wedge the lock forever.
//
// `withLock`'s default posture is FAIL-OPEN: if the lock can't be acquired
// within `waitMs`, `fn` still runs, unlocked. That default exists because
// most callers of a lock in this repo are advisory best-effort writers for
// whom "proceed slightly racy" beats "hang or error." A caller with a
// stricter invariant (no two racing writers may both proceed — e.g. the
// ports registry's "no duplicate block" guarantee) passes `failClosed: true`
// to get a thrown `LOCK_TIMEOUT` error instead of a silent unlocked run.
'use strict';

const fs = require('fs');

const DEFAULT_WAIT_MS = 500;
const DEFAULT_STALE_MS = 5000;
const POLL_MS = 25;

function sleepSync(ms) {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // Atomics.wait unavailable in this runtime (rare) — busy-wait fallback.
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

function lockAgeMs(lockDir) {
  try {
    return Date.now() - fs.statSync(lockDir).mtimeMs;
  } catch {
    return Infinity;
  }
}

function tryMkdir(lockDir) {
  try {
    fs.mkdirSync(lockDir);
    return true;
  } catch (err) {
    if (err && err.code === 'EEXIST') return false;
    throw err;
  }
}

// Attempt to acquire the directory-mutex at `lockDir`. Retries for up to
// `waitMs`, reclaiming a lock older than `staleMs` (its prior holder is
// presumed crashed) whenever one is seen. Returns true on success, false if
// still unacquired once `waitMs` elapses.
function acquireLock(lockDir, { waitMs = DEFAULT_WAIT_MS, staleMs = DEFAULT_STALE_MS } = {}) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (tryMkdir(lockDir)) return true;
    if (lockAgeMs(lockDir) > staleMs) {
      try { fs.rmdirSync(lockDir); } catch { /* another reclaimer won the race */ }
      continue;
    }
    if (Date.now() >= deadline) return false;
    sleepSync(Math.min(POLL_MS, deadline - Date.now()));
  }
}

function releaseLock(lockDir) {
  try { fs.rmdirSync(lockDir); } catch { /* already released, or never acquired */ }
}

// Run `fn` (sync, or returning a Promise) while holding `lockDir`'s mutex.
// See the module header for the fail-open/fail-closed choice.
function withLock(lockDir, fn, { waitMs = DEFAULT_WAIT_MS, staleMs = DEFAULT_STALE_MS, failClosed = false } = {}) {
  const acquired = acquireLock(lockDir, { waitMs, staleMs });
  if (!acquired && failClosed) {
    const err = new Error(`could not acquire lock within ${waitMs}ms: ${lockDir}`);
    err.code = 'LOCK_TIMEOUT';
    throw err;
  }
  const release = () => { if (acquired) releaseLock(lockDir); };

  let result;
  try {
    result = fn();
  } catch (err) {
    release();
    throw err;
  }
  if (result && typeof result.then === 'function') {
    return result.then(
      (value) => { release(); return value; },
      (err) => { release(); throw err; },
    );
  }
  release();
  return result;
}

module.exports = { acquireLock, releaseLock, withLock };
