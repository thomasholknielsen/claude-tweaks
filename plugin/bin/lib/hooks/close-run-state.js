// bin/lib/hooks/close-run-state.js — the terminal-state-flip logic shared by
// `bin/hooks.js`'s `close-run` subcommand and `teardown-run`'s Step 1 (#594).
// Extracted verbatim from close-run's own inline block so a future change to
// either the foreign-owner refusal or the wrap-up warn-tier check only needs
// to land once. Pure decision + one write; callers own their own message text.
'use strict';
const fs = require('fs');
const path = require('path');
const ctxLib = require('./context');

// Returns one of:
//   { status: 'refused-foreign' }
//     — an implicit (`explicit: false`) run resolution landed on a run
//       recorded by a different, still-active session; nothing was written.
//   { status: 'closed', foreignOwner, wrapupSeen, writeOk }
//     — the run-state write was attempted (and `writeOk` reports whether it
//       succeeded); `foreignOwner`/`wrapupSeen` let the caller render the
//       same advisory lines close-run always has.
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
  let wrapupSeen = false;
  try {
    const rawEvents = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
    for (const line of rawEvents.split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev && ev.type === 'skill_invoked' && ev.skill === 'claude-tweaks:wrap-up') { wrapupSeen = true; break; }
      } catch { /* skip garbage line */ }
    }
  } catch { /* no events.jsonl — treated the same as no wrap-up event */ }
  if (!wrapupSeen) {
    ctxLib.appendEvent(runDir, 'close-without-wrapup', {});
  }

  const writeOk = !!ctxLib.writeRunState(runDir, { status: 'clean', worktree: null });
  return { status: 'closed', foreignOwner, wrapupSeen, writeOk };
}

module.exports = { closeRunState };
