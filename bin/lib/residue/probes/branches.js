'use strict';

const { makeFinding } = require('../finding');

// `_shared/integration-branch.md`'s canonical resolution ladder yields a BARE
// branch name (`main`, `dev`) — none of its ranks ever produce a
// `<remote>/<branch>` form. `git branch -r --merged` only ever lists
// remote-tracking refs, which are always `<remote>/...`, so a bare name must
// be resolved to its remote-tracking ref before it can be compared against
// anything `--merged` returns. A name that already contains `/` (e.g. the
// CLI's own `origin/main` default) is assumed already-qualified and used
// as-is. `git config branch.<name>.remote` is the branch's own configured
// remote; unset (a branch never fetched/tracked, or a name resolved from
// CLAUDE.md prose rather than a real local branch) falls back to `origin`.
function resolveRemoteRef(integrationBranch, run) {
  if (integrationBranch.includes('/')) return integrationBranch;
  const configuredRemote = run(['config', `branch.${integrationBranch}.remote`]);
  const remote = (configuredRemote || 'origin').trim() || 'origin';
  return `${remote}/${integrationBranch}`;
}

function probeBranches({ scope, integrationBranch, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const remoteRef = resolveRemoteRef(integrationBranch, run);
  const cmd = ['branch', '-r', '--format=%(refname:short)', '--merged', remoteRef];
  const out = run(cmd);
  if (out === null) {
    return { ran: false, reason: `could not read merged remote branches (${remoteRef})`, findings: [] };
  }
  // `--merged` lists branches across EVERY configured remote, plus a bare
  // remote-name entry. Verified live: an `origin/main` query returned
  // `local-check/main`, `local/main-check`, and a bare `origin`. Restrict to
  // the integration branch's own remote — proposing a delete on another
  // remote's main is the worst thing this probe could produce.
  const remotePrefix = `${remoteRef.split('/')[0]}/`;
  const findings = [];
  for (const name of out.split('\n').filter(Boolean)) {
    if (name === remoteRef) continue;
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

module.exports = { probeBranches, resolveRemoteRef };
