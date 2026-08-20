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
  // Prune stale remote-tracking refs before reading `--merged` — a local
  // `refs/remotes/<remote>/*` entry that the actual upstream branch already
  // deleted (auto-deleted on merge, or cleaned up by a sibling tidy pass)
  // otherwise reads as "merged, not deleted" forever, and a fix-now attempt
  // against it 422s. `git remote prune` is used over `git fetch --prune` for
  // offline tolerance — no new refs need fetching for a `--merged` read, only
  // stale ones need clearing. On failure (offline / network error), degrade
  // to the unpruned read below rather than failing the probe outright —
  // mirrors the `out === null` -> `{ran: false, ...}` handling for the
  // merged-branch read itself, one line down. This is the first command on
  // this probe's `run` seam to contact a remote at all (`git config` and
  // `git branch -r --merged` below are both local-only), so — unlike every
  // other call through this seam — it needs an explicit bound: a
  // slow/black-holed remote must degrade like any other prune failure, not
  // hang the whole probe. 15s comfortably covers a real prune (normally
  // sub-second) without masking a genuine hang as a fast failure.
  const degraded = run(['remote', 'prune', remoteName], { timeout: 15000 }) === null;
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
  // Degrade tag lives in `evidence`, not a new field — `finding.js`'s
  // fingerprint basis is `kind`/`scope`/`subject` only, so this never mints a
  // duplicate id for the same branch across a pruned and an unpruned run.
  const degradeTag = degraded
    ? ` (unpruned-read: git remote prune ${remoteName} failed — this deletion may 422 if the branch was already removed upstream)`
    : '';
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
      evidence: `git ${cmd.join(' ')} — merged, not deleted${degradeTag}`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeBranches, resolveRemoteRef };
