// bin/lib/hooks/context.js
'use strict';
const fs = require('fs');
const path = require('path');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function parseInput(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

function readRunState(runDir) {
  try { return JSON.parse(fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8')); } catch { return null; }
}

// Run dirs are named as ISO-timestamp-prefixed slugs (e.g. 2026-07-01T090000-spec-1).
// Other siblings under pipelines/ — notably archive/, the wrap-up archival
// destination — are not runs. archive/ sorts AFTER ISO names lexically, so an
// unfiltered .sort().reverse() would rank it first and shadow live runs.
const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T/;

// Lazily yields each candidate run dir (newest-first) paired with its
// already-read state, reading run-state.json for one dir at a time instead
// of mapping every candidate up front — callers that only need the first
// match (resolveRunDir) or the first few (session-start's MAX_REPORTED
// stale-run report) can stop early and never pay for the rest. Callers that
// genuinely need the whole list (pre-tool-use's other-worktrees scan)
// exhaust it via listRunDirsWithState below, which is unchanged in output.
function* iterRunDirsWithState(cwd) {
  const base = path.join(cwd || process.cwd(), '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return; }
  const names = entries
    .filter((e) => e.isDirectory() && RUN_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const name of names) {
    const dir = path.join(base, name);
    const state = readRunState(dir);
    if (state && state.status === 'clean') continue;
    yield { dir, state };
  }
}

function listRunDirsWithState(cwd) {
  return [...iterRunDirsWithState(cwd)];
}

function listRunDirs(cwd) {
  return listRunDirsWithState(cwd).map(({ dir }) => dir);
}

function resolveRunDir(cwd, env) {
  if (env && env.PIPELINE_RUN_DIR) {
    try { if (fs.statSync(env.PIPELINE_RUN_DIR).isDirectory()) return env.PIPELINE_RUN_DIR; } catch { /* fall through */ }
  }
  // Only the newest non-terminal run is needed — stop at the first yielded
  // entry instead of reading every OTHER run dir's run-state.json just to
  // discard it.
  for (const { dir } of iterRunDirsWithState(cwd)) return dir;
  return null;
}

// True synchronous sleep (no CPU-spinning) for writeRunState's lock retry
// below — Node has no sync sleep primitive without a native/external dep,
// but blocking on a zero-length SharedArrayBuffer via Atomics.wait achieves
// the same effect. Falls back to a no-op if unavailable (e.g. a sandboxed
// environment without SharedArrayBuffer/Atomics) — the caller's own retry
// loop still eventually gives up either way.
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* best-effort */ }
}

const LOCK_WAIT_MS = 500; // max total time to wait for the lock before proceeding unlocked
const LOCK_POLL_MS = 10;
const LOCK_STALE_MS = 5000; // a lock dir older than this is treated as abandoned (holder crashed) and reclaimed

// Directory-based mutex for writeRunState's read-modify-write below.
// `fs.mkdirSync` is atomic on every platform Node supports (EEXIST if
// another writer already holds it), unlike a plain file write. Returns
// true if the lock was acquired; false means "could not acquire in time —
// proceed unlocked" (this project's own posture: never break a session
// over bookkeeping state; a missed lock just reopens the pre-existing race
// window instead of hanging a hook process indefinitely).
function acquireRunStateLock(runDir) {
  const lockPath = path.join(runDir, '.run-state.lock');
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lockPath);
      return lockPath;
    } catch (e) {
      if (!e || e.code !== 'EEXIST') return null; // e.g. runDir itself doesn't exist — nothing to lock
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > LOCK_STALE_MS) { fs.rmdirSync(lockPath); continue; } // reclaim an abandoned lock, retry immediately
      } catch { /* raced with another reclaimer, or the lock is already gone — just retry below */ }
      if (Date.now() >= deadline) return null;
      sleepSync(LOCK_POLL_MS);
    }
  }
}

function releaseRunStateLock(lockPath) {
  if (!lockPath) return;
  try { fs.rmdirSync(lockPath); } catch { /* best-effort */ }
}

// Read-modify-write on run-state.json, guarded by acquireRunStateLock above.
// Two concurrent writers (e.g. a `close-run` racing session-end's own hook,
// or two record-worktree/close-run invocations against the same run dir —
// both anticipated scenarios per this file's own wd-foreign-session logic)
// previously could each read the same pre-write state and one writer's
// patch would silently overwrite the other's, e.g. resurrecting a worktree
// assignment a close-run call had just cleared.
function writeRunState(runDir, patch) {
  const lock = acquireRunStateLock(runDir);
  try {
    const next = { ...(readRunState(runDir) || {}), ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(next, null, 2) + '\n');
    return next;
  } catch {
    return null;
  } finally {
    releaseRunStateLock(lock);
  }
}

function appendEvent(runDir, type, data) {
  try {
    // Derived/trusted fields (ts, type) spread LAST so they always win —
    // never spread caller-supplied `data` after them (see CLAUDE.md's
    // "Don't spread parsed external JSON after derived/trusted fields"). No
    // current call site passes a `data` object containing `ts`/`type` keys,
    // but nothing enforced that invariant before; a future call site
    // spreading a richer/less-curated object could otherwise silently
    // overwrite this event's own classification or timestamp.
    const line = JSON.stringify({ ...(data || {}), ts: new Date().toISOString(), type });
    fs.appendFileSync(path.join(runDir, 'events.jsonl'), line + '\n');
  } catch { /* best-effort */ }
}

module.exports = {
  readStdin, parseInput, resolveRunDir, listRunDirs, listRunDirsWithState, iterRunDirsWithState,
  readRunState, writeRunState, appendEvent,
};
