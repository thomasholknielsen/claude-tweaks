'use strict';

const path = require('node:path');
const { makeFinding } = require('../finding');

const REAPER_DOMAIN = path.join('.claude', 'worktrees');

// `lockReason` carries the owning pid as free text, e.g.
// "claude session foo (pid 16478 ...)". Extraction fails toward "unknown"
// (null) rather than throwing — a lock reason in an unexpected shape must
// not crash the sweep, it must just leave the pid unreported.
function extractPid(lockReason) {
  if (!lockReason) return null;
  const m = /\bpid (\d+)\b/.exec(lockReason);
  return m ? Number(m[1]) : null;
}

// Real liveness check: signal 0 probes for existence without actually
// sending a signal. ESRCH means no such process (dead). Any other error
// (most commonly EPERM — process exists, owned by someone else) means the
// pid IS live; only ESRCH means it is not.
function defaultIsPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code !== 'ESRCH';
  }
}

// Renders the locked-worktree evidence string, distinguishing a live
// session from a stale/abandoned lock (or one whose pid can't be confirmed
// either way) rather than reporting every lock identically.
function lockedEvidence(wt, isPidAlive) {
  const branch = wt.branch || 'unknown';
  const pid = extractPid(wt.lockReason);
  if (pid === null) {
    return `git worktree list --porcelain: locked, branch ${branch}, pid unknown (lock reason: ${wt.lockReason ? JSON.stringify(wt.lockReason) : 'none'})`;
  }
  let alive;
  try {
    alive = isPidAlive(pid);
  } catch {
    // Fail toward "can't confirm" rather than crashing the sweep.
    alive = null;
  }
  if (alive === true) return `git worktree list --porcelain: locked, branch ${branch}, live session (pid ${pid} running)`;
  if (alive === false) return `git worktree list --porcelain: locked, branch ${branch}, abandoned lock (pid ${pid} not running)`;
  return `git worktree list --porcelain: locked, branch ${branch}, pid ${pid} (liveness could not be confirmed)`;
}

function probeWorktrees({ scope, isPidAlive = defaultIsPidAlive } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const findings = [];
  for (const wt of scope.worktrees) {
    // The first entry of `git worktree list` is the main working tree. It is
    // never residue, and removing it is not a thing that can happen.
    if (wt === scope.worktrees[0]) continue;
    // The worktree this session is standing in right now is always present
    // and always locked at Step 8.5 — reporting it demands a per-item answer
    // for a worktree that is, definitionally, still in active use by this
    // very run. `probeBranches` already excludes the equivalent self
    // reference via `scope.headBranch`; mirror it here.
    if (scope.headBranch && wt.branch === scope.headBranch) continue;
    const reaped = wt.path.includes(REAPER_DOMAIN);
    findings.push(makeFinding({
      kind: 'worktree',
      // Every worktree that reaches here is, by construction, NOT the one
      // holding this run's own headBranch (excluded above) — so it is on a
      // branch this work did not produce: another session's live worktree,
      // or a stale leftover from a prior run. Never this run's own blast
      // radius, so it is never `blast-radius`.
      scope: 'observed',
      subject: wt.path,
      // A live lock means a session is using it; that is a human's call —
      // still true regardless of whether the pid backing that lock turns
      // out to be live or stale. `dedup.decide` (never wired — see #225's
      // Gotchas) is the mechanism that would suppress a recurring
      // known-invariant row; this probe only makes the row informative.
      remedy: wt.locked ? 'record' : 'auto',
      evidence: wt.locked
        ? lockedEvidence(wt, isPidAlive)
        : `git worktree list --porcelain: unlocked, branch ${wt.branch || 'unknown'}, ${reaped ? 'in reaper domain' : 'outside reaper domain (no reaper collects it)'}`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeWorktrees, REAPER_DOMAIN, extractPid, defaultIsPidAlive };
