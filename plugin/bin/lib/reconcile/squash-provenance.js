// bin/lib/reconcile/squash-provenance.js — the second "is this branch
// merged?" proof the two branch checks (prune-remote.js, archive-branches.js)
// evaluate beside `git cherry` patch-id equivalence (#2252). #2251 switched
// the pr-first merge to `gh pr merge --squash`: a squash commit's patch-id
// matches none of the branch's own commits once the branch holds more than
// one, so cherry-equivalence reads every squash-merged multi-commit branch
// as unmerged and both checks would skip it forever.
//
// The proof is two independent signals that must both hold: the CONFIRMED
// per-branch PR state says MERGED (a GitHub fact, `resolvePrState`'s
// `gh pr list --json …mergeCommit` — the bulk screen omits mergeCommit, so
// a screen-shaped prState can never satisfy this), and that PR's own
// mergeCommit oid sits on the integration branch's first-parent history
// between the branch's fork point and the tip. Bounded to
// `merge-base(integration, branch)..integration` — never an unbounded
// history walk. A rewritten/force-pushed integration tip that no longer
// carries the oid resolves to false: not-yet-proven, never falsely proven.
//
// Boolean, never null — unproven and unprovable both mean "skip" at every
// call site, so any git failure is simply false (fail safe). Same oid
// validation archive-merged.js's localHasMerge applies; that helper asks
// "is the merge commit anywhere in local history?" for run-dir archival,
// this one asks the narrower per-branch question the decision tables need.
'use strict';

const { runGit } = require('../hooks/git-exec');

function isSquashMerged(root, integration, branch, prState) {
  if (!prState || typeof prState !== 'object' || prState.state !== 'MERGED') return false;
  const mc = prState.mergeCommit;
  const oid = mc && typeof mc.oid === 'string' && /^[0-9a-f]{40}$/.test(mc.oid) ? mc.oid : null;
  if (!oid) return false;
  const fork = runGit(['merge-base', integration, branch], root);
  if (fork.failure || !fork.stdout) return false;
  const scan = runGit(['rev-list', '--first-parent', `${fork.stdout}..${integration}`], root);
  if (scan.failure || scan.stdout === null) return false;
  return scan.stdout.split('\n').some((line) => line.trim() === oid);
}

module.exports = { isSquashMerged };
