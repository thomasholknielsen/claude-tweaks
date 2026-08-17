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
  // finding.id is the derived, trusted fingerprint hash computed in Phase 1
  // (cmdValidateFindings always sets it, overriding any same-named key on the
  // raw finding). finding.fingerprint is only a fallback for a finding that
  // never went through that derivation — it must NOT take precedence over an
  // already-present finding.id, since validateFindingV2 echoes back unknown
  // keys verbatim and nothing forbids a raw LLM-produced finding from
  // carrying a stray/hallucinated `fingerprint` field of its own. Preferring
  // the untrusted field here would let such a value silently redirect
  // dedup/issue-index/cache lookups to the wrong key (the same shape as the
  // spoofed-"kind" claim-marker-parser bug).
  const fp = finding.id || finding.fingerprint;
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
  if (cached && cached.status === 'wontfix') return { action: 'suppress', issue: cached.issue };
  const rank = RISK_RANK[finding.risk];
  const thresholdRank = RISK_RANK[threshold];
  if (rank !== undefined && thresholdRank !== undefined && rank <= thresholdRank) return { action: 'file' };
  return { action: 'remember' };
}

module.exports = { decide, RISK_RANK };
