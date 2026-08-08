'use strict';

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
