// bin/lib/hooks/worktree-reap.js — decide which linked worktrees are safe to
// remove, and remove them. Safe means: nobody is using it, its work is already
// in the integration branch, and it holds nothing that exists only here.
//
// Every predicate below fails CLOSED. An unparseable lock reason, an
// unresolvable branch, or a git call that doesn't answer all resolve to "not
// eligible" — never to "eligible". There is no policy key to disable reaping,
// so the predicate is the only safety mechanism.
'use strict';

// `git worktree list --porcelain` emits blank-line-separated stanzas of
// `key value` lines. The `locked` line is either bare or carries a reason,
// and the harness writes the owning session's pid into that reason:
//   locked claude session <name> (pid 29881 start Fri Aug  7 14:40:15 2026)
// That format belongs to a tool this plugin neither owns nor version-pins, so
// it is parsed defensively and tested against a frozen fixture, never live
// output: if it changes shape, pid comes back null and nothing is reaped.
const { runGit } = require('./git-exec');

const PID_RE = /\(pid\s+(\d+)\b/;

function parseWorktreeList(porcelain) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const line of String(porcelain || '').split('\n')) {
    if (line === '') { flush(); continue; }
    const sp = line.indexOf(' ');
    const key = sp === -1 ? line : line.slice(0, sp);
    const val = sp === -1 ? '' : line.slice(sp + 1);
    if (key === 'worktree') {
      flush();
      cur = { path: val, branch: null, bare: false, locked: false, lockReason: null, pid: null };
      continue;
    }
    if (!cur) continue;
    if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '');
    else if (key === 'bare') cur.bare = true;
    else if (key === 'locked') {
      cur.locked = true;
      cur.lockReason = val || null;
      const m = val ? PID_RE.exec(val) : null;
      cur.pid = m ? Number(m[1]) : null;
    }
  }
  flush();
  return out;
}

// signal 0 tests for existence without delivering anything. ESRCH means no
// such process; EPERM means it exists but belongs to another user, which is
// still alive. Both directions of pid reuse are safe here: a recycled pid
// reads as alive and the worktree is skipped, and there is no input on which
// a live session reads as dead. The failure mode is always under-reaping.
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

//   'free'     — nothing holds it
//   'in-use'   — a live session holds it; never touch
//   'orphaned' — a session held it and died without releasing
//   'unknown'  — locked, but the reason yielded no pid. Surface, never act.
function lockVerdict(entry) {
  if (!entry.locked) return 'free';
  if (!Number.isInteger(entry.pid)) return 'unknown';
  return isPidAlive(entry.pid) ? 'in-use' : 'orphaned';
}

// Content identity, deliberately NOT `git merge-base --is-ancestor`. A branch
// merged with `gh pr merge --rebase` has its shas rewritten, so it is
// permanently a non-ancestor of the integration branch even though every line
// of its content landed there. This repo favors rebase merges, so an ancestry
// check would refuse to reap the common case (see #106, the same trap in
// [IL-45]'s sha-identity check).
//
// An empty `git diff --name-only A B` means the two trees are identical.
// Any failure to answer returns false: unresolvable is not identical.
function isContentIdentical(repoRoot, branch, integration) {
  if (!branch || !integration) return false;
  const { stdout, failure } = runGit(['diff', '--name-only', integration, branch], repoRoot);
  if (failure) return false;
  return stdout.trim() === '';
}

module.exports = { parseWorktreeList, isPidAlive, lockVerdict, isContentIdentical };
