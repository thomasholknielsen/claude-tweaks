'use strict';

// Decide what to do with a freshly-fingerprinted proposal given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from `gh issue list --label harness-health` output (the skill builds
//   it; the engine never calls network) — same contract as recon's dedup.js.
//
// Decision logic:
//   open issue match           -> skip      (already staged, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> skip      (assume resolved)
//   'declined' in local cache  -> suppress  (user rejected this exact proposal)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
//
// harness-health never applies anything itself (report-only, matching
// code-health), so there is no 'applied' cache status to check. A cache
// entry written before this change (status: 'applied') simply doesn't match
// any branch below and falls through to 'file' — a harmless re-proposal of
// something already resolved, not a crash.
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  return { action: 'file' };
}

module.exports = { decide };
