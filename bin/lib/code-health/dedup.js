// Risk rank: lower number = more urgent (highest priority to file).
const RISK_RANK = { high: 0, medium: 1, low: 2 };

// code-health's own fork of bin/lib/health-core/dedup.js — not a thin wrapper
// like the other three health skills use, because code-health needs the
// `threshold`/`risk` comparison and `remember` action below, which have no
// equivalent in health-core's declined/staged human-approval cache vocabulary.
// See health-core/dedup.js's header comment for the full rationale.
//
// Decide what to do with a freshly-fingerprinted finding given the current issue
// index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from gh issue list output (the skill builds it; engine never calls network).
//   state ∈ 'open' | 'closed'
//
// Decision logic (contract §dedup.js):
//   open issue match         -> skip      (no flood)
//   wontfix-labelled issue   -> suppress  (standing decision)
//   closed non-wontfix match -> reopen    (regressed)
//   wontfix in cache         -> suppress
//   new >= threshold         -> file
//   new <  threshold         -> remember
//
// Filing gates on the computed `risk` tier (severity x likelihood — see
// bin/lib/code-health/risk.js#computeRisk), not raw severity.
function decide(finding, issueIndex, cache, opts) {
  const threshold = (opts && opts.threshold) || 'high';
  // Support both finding.id (fingerprint hash from Phase 1) and finding.fingerprint (direct string).
  const fp = finding.fingerprint || finding.id;
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
  if (cached && cached.status === 'wontfix') return { action: 'suppress' };
  const rank = RISK_RANK[finding.risk];
  const thresholdRank = RISK_RANK[threshold];
  if (rank !== undefined && thresholdRank !== undefined && rank <= thresholdRank) return { action: 'file' };
  return { action: 'remember' };
}

module.exports = { decide, RISK_RANK };
