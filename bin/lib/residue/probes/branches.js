'use strict';

const { makeFinding } = require('../finding');

function probeBranches({ scope, integrationBranch, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const cmd = ['branch', '-r', '--format=%(refname:short)', '--merged', integrationBranch];
  const out = run(cmd);
  if (out === null) {
    return { ran: false, reason: `could not read merged remote branches (${integrationBranch})`, findings: [] };
  }
  // `--merged` lists branches across EVERY configured remote, plus a bare
  // remote-name entry. Verified live: an `origin/main` query returned
  // `local-check/main`, `local/main-check`, and a bare `origin`. Restrict to
  // the integration branch's own remote — proposing a delete on another
  // remote's main is the worst thing this probe could produce.
  const remotePrefix = `${integrationBranch.split('/')[0]}/`;
  const findings = [];
  for (const name of out.split('\n').filter(Boolean)) {
    if (name === integrationBranch) continue;
    if (!name.startsWith(remotePrefix)) continue;
    if (name.endsWith('/HEAD')) continue;
    if (scope.headBranch && name.endsWith(`/${scope.headBranch}`)) continue;
    findings.push(makeFinding({
      kind: 'branch',
      scope: 'blast-radius',
      subject: name,
      remedy: 'auto',
      evidence: `git ${cmd.join(' ')} — merged, not deleted`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeBranches };
