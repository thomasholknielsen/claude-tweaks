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
// An originally-empty segment (from '//', or a leading/trailing '/') maps to
// '' — the replace/collapse pair above can't produce '' from any non-empty
// input, since a segment made entirely of disallowed characters still
// collapses to a single '-' — so filtering out '' segments after mapping
// drops exactly the malformed-slash cases and never a real segment (review
// finding: rejoining them verbatim reproduced the '//' or leading/trailing
// '/' EnterWorktree's per-segment validator is likely to reject, #689's own
// failure class).
function sanitizeWorktreeName(name) {
  return String(name)
    .split('/')
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-'))
    .filter(Boolean)
    .join('/')
    .slice(0, MAX_LEN)
    // The MAX_LEN slice runs after the empty-segment filter, so a cap that
    // lands exactly on a segment boundary can cut mid-`/` and leave a
    // trailing slash the filter never saw — re-trim it here.
    .replace(/\/$/, '');
}

module.exports = { sanitizeWorktreeName, MAX_LEN };
