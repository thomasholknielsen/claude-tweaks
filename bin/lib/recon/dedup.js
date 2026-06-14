// Severity rank: lower number = more severe.
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

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
// Phase 1 ships file/skip/suppress/remember/reopen — all actions are implemented
// here. Phase 3 wires the SKILL.md/gh side that acts on a reopen decision.
function decide(finding, issueIndex, cache, opts) {
  const threshold = (opts && opts.threshold) || 'high';
  const match = issueIndex && issueIndex[finding.id];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    if (match.state === 'closed') return { action: 'reopen', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && cache[finding.id];
  if (cached && cached.status === 'wontfix') return { action: 'suppress' };
  const rank = SEVERITY_RANK[finding.severity];
  const thresholdRank = SEVERITY_RANK[threshold];
  if (rank !== undefined && thresholdRank !== undefined && rank <= thresholdRank) return { action: 'file' };
  return { action: 'remember' };
}

module.exports = { decide, SEVERITY_RANK };
