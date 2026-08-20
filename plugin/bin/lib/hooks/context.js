// bin/lib/hooks/context.js
'use strict';
const fs = require('fs');
const path = require('path');
const wtDetect = require('./worktree-detect');

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

// An unadopted mint — a directory mkdir'd by dispatch Step 4 or flow Step 2.8
// that no invocation ever initialized — carries neither run-state.json nor
// decisions.md. Fallback attribution must never guess into one: a mint that
// sorts newest absorbs foreign sessions' events until swept (#721). Keyed on
// BOTH files being ABSENT (file presence, not parse success — a corrupt
// run-state.json is still an adopted run, and readRunState's null covers
// both cases), never on config.yml — standalone run dirs legitimately carry
// decisions.md but no config.yml. Consequence: hooks.js CLI verbs that rely
// on this fallback with no --run (record-worktree, record-pr, close-run) now
// only ever resolve an adopted run — safe because every sanctioned caller
// runs after flow Step 3 has already initialized the run dir (decisions.md
// or run-state.json already exists by then).
function isUnadoptedMint(dir, state) {
  if (state) return false;
  if (fs.existsSync(path.join(dir, 'run-state.json'))) return false;
  return !fs.existsSync(path.join(dir, 'decisions.md'));
}

// Run dirs are named as ISO-timestamp-prefixed slugs (e.g. 2026-07-01T090000-spec-1).
// Other siblings under pipelines/ — notably archive/, the wrap-up archival
// destination — are not runs. archive/ sorts AFTER ISO names lexically, so an
// unfiltered .sort().reverse() would rank it first and shadow live runs.
const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T/;

// #848: a near-miss shape — the same 8-digit-date + T + 6-digit-time prefix
// as a canonical run-id, minus the dashes (e.g. `20260817T173343-spec-764`,
// the exact form a hand-composed `date -u +%Y%m%dT%H%M%S` mint produced
// before every mint site delegated to run-dir-resolve.js's formatTimestamp()).
// RUN_ID_RE silently excludes this shape from iterRunDirsWithState — by
// design, that generator only yields directories it can confidently treat as
// runs, since it drives both the fallback event-attribution scan and every
// reconcile check's enumeration. findNonCanonicalRunDirs is the surfacing
// half: report-only, never renamed or adopted, so a caller (reconcile) can
// warn a human instead of silently omitting the run from every pass forever.
const NON_CANONICAL_RUN_ID_RE = /^\d{8}T\d{6}/;

// Directories under `.claude-tweaks/pipelines/` that look run-dir-shaped
// (NON_CANONICAL_RUN_ID_RE) but don't match the canonical dash format
// (RUN_ID_RE) and aren't `archive`. Anchored the same way
// iterRunDirsWithState is — the main checkout, not raw cwd. Read-only: never
// renames, deletes, or touches anything under the returned names.
function findNonCanonicalRunDirs(cwd) {
  const start = cwd || process.cwd();
  const root = wtDetect.mainCheckoutRoot(start) || start;
  const base = path.join(root, '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && e.name !== 'archive' && !RUN_ID_RE.test(e.name) && NON_CANONICAL_RUN_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

// #208: archived-is-terminal invariant, reader side. An archived run-id must never reach the
// isUnadoptedMint/status inspection below regardless of what its resurrected active-side
// run-state.json (if any) claims — that data is exactly the untrustworthy resurrected shell
// described in the record's Current State. Fails OPEN on a read error other than "doesn't
// exist" (a permission error, e.g.) — never silently suppress a genuinely unfinished run over
// an unrelated read failure (this record's AC4); the caller reports it exactly as it would
// have before this filter existed.
function isArchivedRunId(root, runId) {
  try {
    return fs.statSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId)).isDirectory();
  } catch {
    return false;
  }
}

// Lazily yields each candidate run dir (newest-first) paired with its
// already-read state, reading run-state.json for one dir at a time instead
// of mapping every candidate up front — callers that only need the first
// match (resolveRunDir) or the first few (session-start's MAX_REPORTED
// stale-run report) can stop early and never pay for the rest. Callers that
// genuinely need the whole list (pre-tool-use's other-worktrees scan)
// exhaust it via listRunDirsWithState below, which is unchanged in output.
function* iterRunDirsWithState(cwd) {
  // Anchored to the MAIN checkout, not raw cwd. A run dir created inside a
  // linked worktree was previously invisible from the main checkout and vice
  // versa, which is why a worktree could hold the only copy of decisions.md /
  // staged/ and why E1 fell open for commits issued from a worktree carrying
  // no .claude-tweaks/. One anchor means every session resolves the same run
  // set. Falls back to cwd when the main checkout can't be determined — that
  // is the pre-anchoring behavior, so an unknown answer changes nothing.
  //
  // That fallback is reachable from inside a worktree, not only outside a repo:
  // mainCheckoutRoot returns null for an unreadable or unparseable `.git` file
  // as well as for "no repo here". In the worktree case this un-anchors and
  // reads the worktree's own pipelines dir. Deliberately not guarded further —
  // distinguishing the two would cost either a git spawn (this path runs on
  // every hook invocation) or a second walk, and the state it can reach is the
  // one a worktree with a broken `.git` file actually has. The scenario it
  // matters for is wrap-up's transitional copy-out guard, which does its own
  // `pwd -P` resolution rather than trusting this one.
  const start = cwd || process.cwd();
  const root = wtDetect.mainCheckoutRoot(start) || start;
  const base = path.join(root, '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return; }
  const names = entries
    .filter((e) => e.isDirectory() && RUN_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const name of names) {
    if (isArchivedRunId(root, name)) continue;
    const dir = path.join(base, name);
    const state = readRunState(dir);
    if (state && state.status === 'clean') continue;
    // Defense in depth (#593): a stray top-level dir left behind by a
    // filesystem-only (non-git-aware) archival move — pre-fix, or any future
    // regression that reintroduces one — still has no local run-state.json
    // (or a stale non-terminal one, e.g. resurrected by `git checkout` after
    // `work/` was git-mv'd out from under it), but its archive twin at
    // archive/{name}/ may already carry a terminal run-state.json — the real
    // signal this run is done. Checked at the SHARED iterator level (not
    // just session-start.js, which has no branching logic of its own) so
    // every caller of this generator benefits: resolveRun's fallback scan,
    // the reconciler's archiveMerged pass, and session-start's unfinished-run
    // report all stop treating an already-archived run as still-open.
    const archiveState = readRunState(path.join(base, 'archive', name));
    if (archiveState && archiveState.status === 'clean') continue;
    yield { dir, state };
  }
}

function listRunDirsWithState(cwd) {
  return [...iterRunDirsWithState(cwd)];
}

function listRunDirs(cwd) {
  return listRunDirsWithState(cwd).map(({ dir }) => dir);
}

// Which run an event belongs to, and how confidently we know it (#62).
//
//   'env'      — PIPELINE_RUN_DIR named it. Certain.
//   'session'  — the run records this session as its owner. Certain.
//   'fallback' — nobody claims it and nobody else owns it, so the newest
//                non-terminal run is the best guess. This is the pre-#62
//                behavior, kept only for runs whose ownership is unknown.
//   null dir   — every non-terminal run is owned by a DIFFERENT session.
//                Guessing here is what cross-contaminated events.jsonl and
//                left finished runs stamped `interrupted` forever.
//
// The asymmetry is deliberate: an unowned run may still be ours (ownership is
// only stamped by `record-worktree`, which a run without a worktree never
// calls), but a run owned by someone else never is.
//
// Sanctioned exception (#413): console execution (`_shared/console-execution.md`)
// deliberately acts on a run whose owning session is gone by design — the
// session that built the run and rendered its console may have ended long
// before a human ticks boxes on the PR. A foreign-owned or `null` ownedRun.dir
// during console execution is expected there, not a bug; that file's own
// writes (console.json, the reply comment, the resolved marker) go directly
// to the run dir and the PR regardless of this resolution, the same way
// `bin/lib/reconcile/*` already reads and writes runs regardless of session
// ownership. Do not "fix" this by tightening the ownership check.
function resolveRun(cwd, env, sessionId) {
  if (env && env.PIPELINE_RUN_DIR) {
    try {
      if (fs.statSync(env.PIPELINE_RUN_DIR).isDirectory()) {
        return { dir: env.PIPELINE_RUN_DIR, attribution: 'env' };
      }
    } catch { /* fall through */ }
  }
  const me = typeof sessionId === 'string' && sessionId ? sessionId : null;
  if (!me) {
    // Caller identity unknown — behave exactly as before #62. Filtering by an
    // owner we cannot compare against would just be the old guess with fewer
    // candidates, and `record-worktree`/`close-run` deliberately resolve runs
    // they do NOT own so they can report that fact (see bin/hooks.js).
    for (const { dir, state } of iterRunDirsWithState(cwd)) {
      if (isUnadoptedMint(dir, state)) continue;
      return { dir, attribution: 'fallback' };
    }
    return { dir: null, attribution: null };
  }
  let unowned = null;
  for (const { dir, state } of iterRunDirsWithState(cwd)) {
    const owner = state && typeof state.sessionId === 'string' && state.sessionId ? state.sessionId : null;
    if (owner === me) return { dir, attribution: 'session' };
    // Newest-first, so the first unowned run is the one the old code returned.
    if (!owner && !unowned && !isUnadoptedMint(dir, state)) unowned = dir;
  }
  return unowned ? { dir: unowned, attribution: 'fallback' } : { dir: null, attribution: null };
}

function resolveRunDir(cwd, env, sessionId) {
  return resolveRun(cwd, env, sessionId).dir;
}

// Ownership classification (#1098): composite identity — session id AND
// worktree binding. Session-id equality is NOT sufficient evidence of
// ownership: CLAUDE_CODE_SESSION_ID is shared across all subagents of a
// session (measured 2026-08-20, #965), so N parallel siblings are
// indistinguishable by it — only the worktree binding separates them.
// Fail-open: unprovable evidence (deleted binding, indeterminate git answer,
// caller outside any known checkout, missing cwd) degrades to
// 'indeterminate', never 'foreign' — preserving resolveRun's documented
// asymmetry: an unowned run may still be ours; a provably-foreign run never is.
// `caller.cwd` must be absolute (same convention as findRunByWorktreePath's
// pre-resolved target). This predicate only classifies — it enforces
// nothing; consumers (#1012, #1099) own what each verdict does.
function classifyOwnership(caller, runState) {
  const callerId = caller && typeof caller.sessionId === 'string' && caller.sessionId ? caller.sessionId : null;
  const ownerId = runState && typeof runState.sessionId === 'string' && runState.sessionId ? runState.sessionId : null;
  if (callerId && ownerId && callerId !== ownerId) return 'foreign';
  const cwd = caller && typeof caller.cwd === 'string' && caller.cwd ? caller.cwd : null;
  if (!cwd) return 'indeterminate';
  return 'indeterminate'; // binding arms land in Task 2, no-binding arms in Task 3
}

// Shared by findRunByWorktreePath/findRunsByWorktreePath below: does this
// run-state's recorded `worktree` match targetPath? Realpath-canonicalizes
// both sides where they exist on disk (recorded assignments are already
// absolute; a torn-down worktree's path may no longer resolve, so the raw
// string is kept as a fallback comparison rather than failing the match).
function worktreeMatches(state, target, targetPath) {
  if (!state || typeof state.worktree !== 'string' || !state.worktree) return false;
  let recorded = state.worktree;
  try { recorded = fs.realpathSync(recorded); } catch { /* keep recorded form */ }
  return recorded === target || state.worktree === targetPath;
}

// Reverse lookup: which non-terminal run holds this worktree path as its
// recorded assignment? Canonicalizes both sides via realpath where the paths
// exist (recorded assignments are already absolute; the caller resolves a
// relative teardown target against the Bash call's cwd BEFORE calling this).
// First match wins (newest-first, same ordering as resolveRun's scan).
function findRunByWorktreePath(cwd, targetPath) {
  if (typeof targetPath !== 'string' || !targetPath) return null;
  let target = targetPath;
  try { target = fs.realpathSync(targetPath); } catch { /* keep as-resolved */ }
  for (const { dir, state } of iterRunDirsWithState(cwd)) {
    if (worktreeMatches(state, target, targetPath)) return { runDir: dir, state };
  }
  return null;
}

// Plural sibling of findRunByWorktreePath (#500): every non-terminal run
// dir — not just the first — assigned to this worktree path, newest first.
// Exists for the reflect Friction Lens's ad-hoc-session fallback
// (skills/reflect/full-mode.md): a worktree dev session that never reached a
// formal pipeline can leave behind more than one lightweight ad-hoc run dir
// (post-tool-use.js's stampAdHocRunDir, one per EnterWorktree that found no
// owned run yet) before a later /claude-tweaks:wrap-up finally reads them —
// a single first-match lookup would silently drop every ad-hoc run but the
// newest. `excludeDir`, when given, omits that one directory from the
// result (the caller's own primary/current run dir, already read via its
// normal path — never double-counted as a second source here).
function findRunsByWorktreePath(cwd, targetPath, excludeDir) {
  if (typeof targetPath !== 'string' || !targetPath) return [];
  let target = targetPath;
  try { target = fs.realpathSync(targetPath); } catch { /* keep as-resolved */ }
  const out = [];
  for (const { dir, state } of iterRunDirsWithState(cwd)) {
    if (excludeDir && path.resolve(dir) === path.resolve(excludeDir)) continue;
    if (worktreeMatches(state, target, targetPath)) out.push({ runDir: dir, state });
  }
  return out;
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

// Max total time to wait for the lock before proceeding unlocked. Overridable
// via CLAUDE_TWEAKS_LOCK_WAIT_MS when it parses as a non-negative integer —
// a test-only knob (production never sets this env var, so it always gets
// the 500ms default) that lets tests pin the budget instead of racing it.
function resolveLockWaitMs() {
  const raw = process.env.CLAUDE_TWEAKS_LOCK_WAIT_MS;
  const n = Number(raw);
  // raw.trim() !== '' guards the JS quirk that Number('') === 0 — an empty
  // or whitespace-only value is garbage and falls back like any other.
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : 500;
}
const LOCK_WAIT_MS = resolveLockWaitMs();
const LOCK_POLL_MS = 10;
const LOCK_STALE_MS = 5000; // a lock dir older than this is treated as abandoned (holder crashed) and reclaimed

// Directory-based mutex for writeRunState's read-modify-write below.
// `fs.mkdirSync` is atomic on every platform Node supports (EEXIST if
// another writer already holds it), unlike a plain file write. Returns
// true if the lock was acquired; false means "could not acquire in time —
// proceed unlocked" (this project's own posture: never break a session
// over bookkeeping state; a missed lock just reopens the pre-existing race
// window instead of hanging a hook process indefinitely). The cause list
// reaching this fail-open path now demonstrably includes CI-runner
// contention (observed on the v6.73.0 release CI run, not just a slow local
// machine) — see CLAUDE_TWEAKS_LOCK_WAIT_MS above for the test-only knob
// that lets a test pin an effectively-unbounded budget to isolate the lock
// mechanism from this wait cap.
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
  const finalPath = path.join(runDir, 'run-state.json');
  // Write to a per-process tmp file, then atomically rename over the real
  // path. fs.renameSync is atomic on every platform Node supports (same
  // dir, same filesystem), so a reader or a racing unlocked writer can
  // never observe a torn/partial JSON file, and a crash mid-write leaves
  // the previous state intact instead of a half-written file.
  const tmpPath = path.join(runDir, `run-state.json.tmp-${process.pid}`);
  try {
    const next = { ...(readRunState(runDir) || {}), ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(tmpPath, finalPath);
    return next;
  } catch {
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    return null;
  } finally {
    releaseRunStateLock(lock);
  }
}

function appendEvent(runDir, type, data, attribution) {
  try {
    // Derived/trusted fields (ts, type) spread LAST so they always win —
    // never spread caller-supplied `data` after them (see CLAUDE.md's
    // "Don't spread parsed external JSON after derived/trusted fields"). No
    // current call site passes a `data` object containing `ts`/`type` keys,
    // but nothing enforced that invariant before; a future call site
    // spreading a richer/less-curated object could otherwise silently
    // overwrite this event's own classification or timestamp.
    // `attribution` is stamped only when the run was a guess (#62). Its absence
    // means the run was named by PIPELINE_RUN_DIR or claims this session as its
    // owner; its presence marks the line as evidence that may belong to another
    // session, so a reader auditing a contaminated events.jsonl can filter on it
    // rather than having to reconstruct which worktree each commit came from.
    const guessed = attribution === 'fallback' ? { attribution } : null;
    const line = JSON.stringify({ ...(data || {}), ...guessed, ts: new Date().toISOString(), type });
    fs.appendFileSync(path.join(runDir, 'events.jsonl'), line + '\n');
  } catch { /* best-effort */ }
}

module.exports = {
  readStdin, parseInput, resolveRun, resolveRunDir, classifyOwnership, listRunDirs, listRunDirsWithState, iterRunDirsWithState,
  readRunState, writeRunState, appendEvent, findRunByWorktreePath, findRunsByWorktreePath, RUN_ID_RE, findNonCanonicalRunDirs,
};
