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

module.exports = { parseWorktreeList };
