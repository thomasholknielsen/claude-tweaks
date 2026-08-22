// bin/lib/hooks/close-run-state.js — the terminal-state-flip logic shared by
// `bin/hooks.js`'s `close-run` subcommand and `teardown-run`'s Step 1 (#594).
// Extracted verbatim from close-run's own inline block so a future change to
// either the foreign-owner refusal or the wrap-up warn-tier check only needs
// to land once. Pure decision + one write; callers own their own message text.
'use strict';
const fs = require('fs');
const path = require('path');
const ctxLib = require('./context');

// A run dir still holds un-archived work/ content if either the top-level
// work/ (single-spec layout) or any spec-*/work/ (multi-spec layout,
// materialize.md's Multi-record layout) exists on disk — this is a plain
// fs.existsSync check, not a git-tracked-ness check, so it can't (and
// doesn't try to) distinguish tracked from untracked work/ content (#1103's
// own originally-reported scenario had untracked work/{n}-spec.md). This is
// the routine, expected state right after close-run in the normal wrap-up
// sequence (archive-run always runs after, never before) — this check
// surfaces it as an advisory field rather than blocking the close (the
// escape-hatch use case — closing a stuck/foreign run manually — must still
// work even when work/ hasn't landed).
function hasUnarchivedWork(runDir) {
  if (fs.existsSync(path.join(runDir, 'work'))) return true;
  let entries;
  try {
    entries = fs.readdirSync(runDir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((e) => e.isDirectory() && e.name.startsWith('spec-') && fs.existsSync(path.join(runDir, e.name, 'work')));
}

// Returns one of:
//   { status: 'refused-foreign' }
//     — an implicit (`explicit: false`) run resolution landed on a run
//       recorded by a different, still-active session; nothing was written.
//   { status: 'closed', foreignOwner, wrapupSeen, writeOk, notYetArchived }
//     — the run-state write was attempted (and `writeOk` reports whether it
//       succeeded); `foreignOwner`/`wrapupSeen`/`notYetArchived` let the
//       caller render the same advisory lines close-run always has.
function closeRunState(runDir, { explicit = false, sessionId = null } = {}) {
  const prev = ctxLib.readRunState(runDir);
  const foreignOwner = !!(prev && typeof prev.sessionId === 'string' && prev.sessionId && sessionId && prev.sessionId !== sessionId);
  if (foreignOwner && !explicit) {
    // The implicit fallback ("newest non-terminal run") landed on a run
    // recorded by a DIFFERENT, still-active session — closing it here
    // would silently disarm that session's E1/E2/E3 enforcement with no
    // way for it to know (see CLAUDE.md's Hooks section). Refuse rather
    // than act; pass an explicit --run if closing someone else's run is
    // genuinely intended.
    return { status: 'refused-foreign' };
  }

  // Warn-tier check (#373): closing a run whose ledger never recorded a wrap-up
  // invocation. Warn, never block — dispatch's close-before-merge is sanctioned,
  // and a human-typed /claude-tweaks:wrap-up leaves no event at all (measured,
  // #371 finding (e)), so absence is not proof the procedure was skipped.
  const wrapupSeen = !!(ctxLib.scanWrapupEvents(runDir) || {}).wrapup;
  if (!wrapupSeen) {
    ctxLib.appendEvent(runDir, 'close-without-wrapup', {});
  }

  const notYetArchived = hasUnarchivedWork(runDir);
  const writeOk = !!ctxLib.writeRunState(runDir, { status: 'clean', worktree: null });
  return { status: 'closed', foreignOwner, wrapupSeen, writeOk, notYetArchived };
}

module.exports = { closeRunState, hasUnarchivedWork };
