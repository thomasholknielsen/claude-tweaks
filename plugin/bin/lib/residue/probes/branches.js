// bin/lib/residue/probes/branches.js — merged-remote-branch detection for
// the residue sweep (flags a remote branch already merged into the
// integration branch, safe to delete).
//
// The exclusion logic is the hazard here, not the merge check itself: the
// findings loop's filter chain (`name === remoteRef`, `!startsWith(remotePrefix)`,
// `endsWith('/HEAD')`, the self-`headBranch` skip) can silently stop matching
// without ever throwing — it just quietly returns fewer findings, or none.
// `[IL-111]`: `resolveRemoteRef` once received a BARE branch name (`main`)
// from `_shared/integration-branch.md`'s resolution ladder, derived the
// prefix `main/` from it, and no `git branch -r --merged` output can ever
// start with that prefix — so `remotePrefix` matched nothing and the probe
// reported `{ran: true, findings: []}` ("ran and found nothing") forever,
// looking clean while a real, merged, safe-to-delete remote branch sat
// unreported. An exclusion that silently stops matching produces no error —
// just a catastrophic recommendation. Any future change to `resolveRemoteRef`
// or the filter chain below must be re-verified against a live `--merged`
// query, not just the test suite: every test at the time of the incident
// hardcoded `origin/main` and stayed green throughout.
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
  const remoteName = remoteRef.split('/')[0];
  // No `git remote prune` here: this probe's findings are read-only
  // report output — a `kind: branch` finding is never deleted off the back
  // of this call. The actual deletion of a proven-merged remote branch runs
  // through reconcile's own `remote-prune` check (`bin/lib/reconcile/
  // prune-remote.js`), which fetches and prunes origin itself, immediately
  // before it deletes, using its own (stronger) merged-PR-plus-cherry-
  // equivalence evidence — see that module's header. `/tidy`'s Step 6 auto
  // table states this split explicitly: a merged remote branch reconcile
  // did not already dispose of Stages at every tier rather than
  // auto-deleting, because a pushed branch deletion is an outward-facing
  // write `/tidy` never applies on its own. A prune here bought this probe
  // nothing but an up-to-15s network round-trip and a destructive,
  // reflog-less ref mutation on every read-only invocation (`--scope
  // blast-radius`, `residue.js --json` for reporting) — including runs
  // whose findings this same scope guarantees get filtered out below.
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
  const remotePrefix = `${remoteName}/`;
  const findings = [];
  for (const name of out.split('\n').filter(Boolean)) {
    if (name === remoteRef) continue;
    if (!name.startsWith(remotePrefix)) continue;
    if (name.endsWith('/HEAD')) continue;
    if (scope.headBranch && name.endsWith(`/${scope.headBranch}`)) continue;
    // Anything reaching this point has already survived the scope.headBranch
    // exclusion above, so — mirroring probeWorktrees's identical fallthrough
    // contrast — it is never definitively this run's own blast radius under
    // a strict reading: 'observed', not 'blast-radius'. See branches.js's
    // header comment and #499 for why an unconditional 'blast-radius' tag
    // here let a wrap-up's `--scope blast-radius` auto-remedy leak into
    // unrelated, separately-completed sessions' merged branches.
    findings.push(makeFinding({
      kind: 'branch',
      scope: 'observed',
      subject: name,
      remedy: 'auto',
      evidence: `git ${cmd.join(' ')} — merged, not deleted`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeBranches, resolveRemoteRef };
