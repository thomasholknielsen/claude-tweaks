'use strict';

// Decide what to do with a freshly-fingerprinted finding given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from `gh issue list --label journey-health` output.
//
// Decision logic:
//   open issue match           -> skip      (already filed, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> skip      (assume resolved)
//   'declined' in local cache  -> suppress  (user dismissed this exact proposal)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
//
// journey-health never applies anything itself, so there is no 'applied'
// cache status to check (unlike harness-health's pre-existing cache entries).
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
