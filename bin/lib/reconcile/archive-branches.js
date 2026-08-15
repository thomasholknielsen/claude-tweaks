// bin/lib/reconcile/archive-branches.js — convergence check: archive or
// delete abandoned plugin-owned LOCAL branches, and age out the archive/*
// tags the archival path creates. Pure decision functions with I/O at the
// edges, matching release-merged.js's pattern. All mutations are local to
// this checkout — never a pushed deletion, never a pushed tag; different
// checkouts converge independently (origin-side cleanup belongs to PR
// merges and tidy's remote-ref pruning).
//
// `git cherry {integration} {branch}` is the merged-in-substance evidence —
// it catches squash merges that ancestry checks and `git branch -d` both
// miss; that is why execution uses `-D` behind this decision table and
// never trusts `-d`'s verdict.
'use strict';

const BRANCH_AGE_DAYS = 14; // hardcoded by design — no policy lever
const TAG_AGE_DAYS = 90; // matches git's default reflog window: past it, the tag's marginal recovery value is zero

// Plugin-owned branch namespaces. No canonical source elsewhere in the repo —
// maintained manually here; a future plugin-owned prefix must be added by
// hand or its branches silently never age out.
const SCOPE_PATTERNS = [/^build\//, /^worktree-/, /^demo\//];

// Scope guard — runs BEFORE decideArchive is ever called. `worktrees` is
// parseWorktreeList output (bin/lib/hooks/worktree-reap.js), reused not
// reimplemented; a branch attached to any live worktree is never touched.
function inScope(branch, worktrees) {
  if (!SCOPE_PATTERNS.some((re) => re.test(branch))) return false;
  return !worktrees.some((w) => w.branch === branch);
}

// One branch's evidence -> what to do. Pure — no I/O.
//   { action: 'delete' | 'tag-and-delete' | 'skip', reason }
function decideArchive({ branch, tipAgeDays, cherryEquivalent, prState }) {
  if (prState === 'gh-absent' || prState === 'network-failure') {
    return { action: 'skip', reason: prState }; // evidence unknown — fail closed
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // an open PR means work may be landing
  }
  if (cherryEquivalent) {
    return { action: 'delete', reason: 'cherry-equivalent' }; // merged in substance — no tag needed
  }
  const closedUnmerged = prState && prState.state === 'CLOSED';
  if ((prState === null || closedUnmerged) && tipAgeDays > BRANCH_AGE_DAYS) {
    return { action: 'tag-and-delete', reason: `unmerged-aged: ${tipAgeDays}d > ${BRANCH_AGE_DAYS}d` };
  }
  if (prState === null || closedUnmerged) {
    return { action: 'skip', reason: 'too-young' };
  }
  return { action: 'skip', reason: 'merged-pr-without-cherry-equivalence' }; // rebased remnant — human territory
}

// Tag aging: delete archive/* tags whose tagged commit's COMMITTER date
// (%cI) exceeds TAG_AGE_DAYS. Unparseable dates fail closed (kept).
function shouldAgeTag(committerDateIso, nowMs) {
  const t = Date.parse(committerDateIso);
  if (Number.isNaN(t)) return false;
  return nowMs - t > TAG_AGE_DAYS * 24 * 60 * 60 * 1000;
}

module.exports = { decideArchive, inScope, shouldAgeTag, BRANCH_AGE_DAYS, TAG_AGE_DAYS };
