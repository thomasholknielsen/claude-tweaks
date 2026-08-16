// bin/lib/reconcile/prune-remote.js — convergence check: delete REMOTE
// branches proven merged into the integration branch. The one pushed
// mutation in the reconcile family — every other check is local-only by
// design (archive-branches.js). A pushed deletion is unrecoverable from
// this checkout once origin GCs the ref, so the evidence bar is BOTH
// signals at once: a MERGED PR (resolvePrState) AND cherry-equivalence of
// the remote ref against the integration branch (`git cherry` — the same
// merged-in-substance evidence archive-branches.js documents; ancestry
// alone is explicitly not trusted). Anything weaker — no PR, a closed
// unmerged PR, cherry-only — skips, keeping today's staged-in-tidy path
// for the ambiguous cases. Scope is the plugin-owned namespaces
// (SCOPE_PATTERNS, reused from archive-branches.js), and a branch attached
// to a live worktree is silently out of scope (same inScope guard).
// Pure decision function with I/O at the edges, matching the family.
'use strict';

const { runGit } = require('../hooks/git-exec');
const { parseWorktreeList } = require('../hooks/worktree-reap');
const { inScope, isCherryEquivalent } = require('./archive-branches');
const { resolvePrState } = require('./pr-state');

// One remote branch's evidence -> what to do. Pure — no I/O.
//   { action: 'delete' | 'skip', reason }
function decideRemotePrune({ branch, cherryEquivalent, prState }) {
  if (prState === 'gh-absent' || prState === 'network-failure') {
    return { action: 'skip', reason: prState }; // evidence unknown — fail closed
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // work may still be landing
  }
  if (!cherryEquivalent) {
    return { action: 'skip', reason: 'not-cherry-equivalent' }; // content not proven merged
  }
  if (!prState || prState.state !== 'MERGED') {
    return { action: 'skip', reason: 'no-merged-pr' }; // cherry alone is not enough for a pushed delete
  }
  return { action: 'delete', reason: 'merged-pr-cherry-equivalent' };
}

function pruneRemote({ cwd, integration, dryRun, resolvePr } = {}) {
  const root = cwd || process.cwd();
  const resolve = resolvePr || resolvePrState;
  const entries = [];

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  if (wtList.failure) return { entries, failure: 'git-failure' };
  const worktrees = parseWorktreeList(wtList.stdout);

  // lstrip=3 strips exactly refs/remotes/origin/, leaving the symbolic HEAD
  // ref as the bare string 'HEAD' — refname:short instead yields 'origin'
  // for that ref (no slash), which the branch === 'HEAD' guard below would
  // never match.
  const refs = runGit(['for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin'], root);
  if (refs.failure) return { entries, failure: 'git-failure' };

  for (const branch of refs.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (branch === 'HEAD' || branch === integration) continue;
    if (!inScope(branch, worktrees)) continue; // namespace + live-worktree guard — never reaches the decision fn

    const cherryEquivalent = isCherryEquivalent(root, integration, `origin/${branch}`);
    if (cherryEquivalent === null) {
      entries.push({ name: branch, kind: 'remote-branch', action: 'skip', reason: 'cherry-failed' });
      continue;
    }
    const prState = resolve(root, branch);
    const decision = decideRemotePrune({ branch, cherryEquivalent, prState });
    if (decision.action === 'skip' || dryRun) {
      entries.push({ name: branch, kind: 'remote-branch', action: decision.action, reason: decision.reason });
      continue;
    }
    const del = runGit(['push', 'origin', '--delete', branch], root);
    entries.push(del.failure
      ? { name: branch, kind: 'remote-branch', action: 'skip', reason: 'delete-failed' }
      : { name: branch, kind: 'remote-branch', action: 'delete', reason: decision.reason });
  }

  return { entries, failure: null };
}

module.exports = { decideRemotePrune, pruneRemote };
