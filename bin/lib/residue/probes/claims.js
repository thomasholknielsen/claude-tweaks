'use strict';

// Deprecation-window-scoped (#241, _shared/issue-claims.md "Deprecation window"): claims now
// lock via a blob on claims-registry, not this git-ref keyspace — nothing writes a new
// refs/claims/* entry anymore. This probe stays useful only for the transition (surfacing
// legacy ref claims left over from before the unification, on issues that have since closed);
// once the deprecation window closes, it will find nothing, ever, and should be retired in the
// same change that removes issue-claims.md's Deprecation window subsection.
const { makeFinding } = require('../finding');

function probeClaims({ scope, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const refs = run(['gh', 'api', 'repos/{owner}/{repo}/git/matching-refs/claims/', '-q', '.[].ref']);
  if (refs === null) return { ran: false, reason: 'could not list claim refs (gh unavailable or not authenticated)', findings: [] };

  const findings = [];
  for (const ref of refs.split('\n').filter(Boolean)) {
    const match = /issue-(\d+)$/.exec(ref);
    if (!match) continue;
    const stateOut = run(['gh', 'issue', 'view', match[1], '--json', 'state']);
    if (stateOut === null) continue;
    let state;
    try {
      state = JSON.parse(stateOut).state;
    } catch {
      continue;
    }
    if (String(state).toLowerCase() !== 'closed') continue;
    findings.push(makeFinding({
      kind: 'claim',
      scope: 'blast-radius',
      subject: ref,
      remedy: 'auto',
      evidence: `gh issue view ${match[1]} --json state — CLOSED, claim ref still present`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeClaims };
