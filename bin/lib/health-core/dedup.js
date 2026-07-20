'use strict';

// Decide what to do with a freshly-fingerprinted finding given the current
// issue index and local cache. Pure — no I/O, no network.
//
// Shared by harness-health, journey-health, and docs-health (byte-identical
// wrapper across the three today). code-health keeps its own decide() in
// bin/lib/code-health/dedup.js — it needs a `threshold`/`risk` comparison and
// a `remember` action (findings below the risk threshold are tracked but not
// filed) that this propose-then-approve cache vocabulary has no equivalent
// for, since code-health files findings directly rather than going through
// this module's declined/staged human-approval flow. Same divergence shape
// as bin/lib/health-core/runs.js's recordRun/computeChurn fork — see that
// file's header comment.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built by the calling skill from `gh issue list --label <skill>` output —
//   the engine never calls network.
//
// Decision logic:
//   open issue match           -> skip      (already filed, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> reopen    (regressed)
//   'declined' in local cache  -> suppress  (user rejected this exact finding)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   'regressed' in local cache -> skip      (already reopened via the issue-index path above on
//                                            some earlier run; a later run that falls back to
//                                            cache-only dedup — e.g. --issues unavailable — must
//                                            not re-file it as brand new)
//   otherwise                  -> file
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    if (match.state === 'closed') {
      return {
        action: 'reopen',
        issue: match.number,
        note: 'regressed — this finding was previously closed and has reappeared',
      };
    }
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  if (cached && cached.status === 'regressed') return { action: 'skip', issue: cached.issue };
  return { action: 'file' };
}

module.exports = { decide };
