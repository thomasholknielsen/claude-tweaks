// bin/lib/worktree/name.js — sanitize a derived worktree name (branch slug
// or record id list) before it reaches EnterWorktree / `git worktree add`.
//
// EnterWorktree accepts only letters, digits, dots, underscores, and dashes
// within each `/`-segment, <=64 chars total (build/worktree-setup.md's
// "Worktree name derivation" section mirrors this exactly) — `/` itself is
// the valid segment delimiter, not a character to strip (#814). A
// multi-spec run's own slug (`flow/spec-{N1}-{N2}...`, or a record slug)
// can carry characters outside that set within a segment — `+` from an ad
// hoc join, spaces, `#` from an issue reference — any of which
// EnterWorktree rejects outright (#689).
'use strict';

const MAX_LEN = 64;

// Order matters: collapse runs of '-' before capping, so MAX_LEN is enforced
// against the final, already-collapsed string. '/' is preserved as the
// segment delimiter; only the characters within each segment are sanitized.
function sanitizeWorktreeName(name) {
  return String(name)
    .split('/')
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-'))
    .join('/')
    .slice(0, MAX_LEN);
}

module.exports = { sanitizeWorktreeName, MAX_LEN };
