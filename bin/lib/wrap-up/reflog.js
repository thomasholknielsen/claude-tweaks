// bin/lib/wrap-up/reflog.js — classify `git reflog --date=iso` output into the
// history operations worth reporting in wrap-up's Actions Performed table.
//
// Why classify rather than dump: a working repository's reflog is dominated by
// routine `merge …: Fast-forward` and `checkout` entries. Reporting all of them
// reburies the one operation that matters (a rebase, a reset) in exactly the
// noise this table exists to cut through.
'use strict';

const LINE = /^([0-9a-fA-F]+) (\S+)@\{([^}]+)\}: (.*)$/;

function parseLine(line) {
  const m = LINE.exec(String(line == null ? '' : line).trim());
  if (!m) return null;
  return { sha: m[1], ref: m[2], date: m[3], message: m[4] };
}

// Returns the op name for a report-worthy message, or null for a routine one.
//
// Order is load-bearing in two places: the rebase branch must run before any
// generic match so intermediate replay entries are dropped, and the merge
// branch must test Fast-forward BEFORE reporting, since a fast-forward merge
// moved no history and is not worth a row.
function classify(message) {
  const msg = String(message == null ? '' : message);
  // A rebase emits one entry per replayed commit; only (finish) marks the whole
  // operation, so keying on it collapses a 12-commit rebase to a single row.
  // Older git wrote "finished" rather than "(finish)" — both accepted.
  if (/^rebase\b/.test(msg)) return /\(finish\)|\bfinished\b/.test(msg) ? 'rebase' : null;
  // Reported unconditionally: reflog writes `reset: moving to <target>` for both
  // --hard and --soft, so the destructive variant cannot be singled out and must
  // not be the silent case.
  if (/^reset:/.test(msg)) return 'reset';
  if (/^cherry-pick\b/.test(msg)) return 'cherry-pick';
  if (/^revert\b/.test(msg)) return 'revert';
  if (/^commit \(amend\)/.test(msg)) return 'amend';
  if (/^merge\b/.test(msg)) return /:\s*Fast-forward$/.test(msg) ? null : 'merge';
  if (/^update by push\b/.test(msg)) return 'push';
  return null;
}

function historyOps(reflogText) {
  const out = [];
  for (const line of String(reflogText == null ? '' : reflogText).split('\n')) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const op = classify(parsed.message);
    if (!op) continue;
    out.push({ op, sha: parsed.sha, date: parsed.date, message: parsed.message });
  }
  return out;
}

module.exports = { parseLine, classify, historyOps };
