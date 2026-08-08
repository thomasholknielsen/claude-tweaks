'use strict';

const { makeFinding } = require('../finding');

function probeClaims({ scope, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const refs = run(['git', 'for-each-ref', '--format=%(refname)', 'refs/claims']);
  if (refs === null) return { ran: false, reason: 'could not read refs/claims', findings: [] };

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
