// bin/lib/reconcile/reap-merged.js — convergence check 2: reap worktrees
// whose branch's PR has merged. Parallel to (never a replacement for)
// `worktree-reap.js`'s existing content-identical ancestry check, which
// stays the reap signal for local-merge / no-forge projects — see #407's
// Non-Goals. Never touches a worktree a live session holds, regardless of
// PR state (`isWorktreeLocked`, reused verbatim from worktree-reap.js).
'use strict';
const path = require('path');
const { runGit } = require('../hooks/git-exec');
const { mainCheckoutRoot, safeReal } = require('../hooks/worktree-detect');
const { parseWorktreeList, isWorktreeLocked, HARNESS_WORKTREE_DIR } = require('../hooks/worktree-reap');
const { resolvePrState } = require('./pr-state');

// One worktree candidate's PR state -> what to do with it. Pure — no I/O —
// so the decision table is unit-testable without a real git/gh call.
//   { action: 'reap' } | { action: 'skip', reason }
// A closed-but-unmerged PR is surfaced, never auto-reaped: its worktree may
// be the resume surface for a failed run (a failure tombstone).
function decideReap(prState) {
  if (prState === 'gh-absent') return { action: 'skip', reason: 'gh-absent' };
  if (prState === 'network-failure') return { action: 'skip', reason: 'network-failure' };
  if (!prState) return { action: 'skip', reason: 'no-pr' };
  if (prState.state === 'OPEN') return { action: 'skip', reason: 'pr-open' };
  if (prState.state === 'CLOSED') return { action: 'skip', reason: 'pr-closed-unmerged' };
  return { action: 'reap' };
}

function reapMerged({ cwd, dryRun = false } = {}) {
  const reaped = [];
  const skipped = [];
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start);
  if (!root) return { reaped, skipped };

  const list = runGit(['worktree', 'list', '--porcelain'], root);
  if (list.failure) return { reaped, skipped, failure: list.failure };

  const domain = safeReal(path.join(root, HARNESS_WORKTREE_DIR)) || path.join(root, HARNESS_WORKTREE_DIR);
  for (const wt of parseWorktreeList(list.stdout)) {
    const real = safeReal(wt.path);
    if (!real || real === root || wt.bare) continue; // never the main checkout
    if (!real.startsWith(domain + path.sep)) continue; // out of harness domain — not this check's concern

    if (!wt.branch) { skipped.push({ path: real, reason: 'no-branch' }); continue; }
    if (isWorktreeLocked(real, { cwd: root })) { skipped.push({ path: real, reason: 'in-use' }); continue; }

    const prState = resolvePrState(root, wt.branch);
    const decision = decideReap(prState);
    if (decision.action === 'skip') {
      skipped.push({ path: real, reason: decision.reason, prNumber: prState && prState.number });
      continue;
    }
    if (dryRun) { reaped.push(real); continue; }

    const rm = runGit(['worktree', 'remove', real], root);
    if (rm.failure) { skipped.push({ path: real, reason: 'removal-failed', prNumber: prState.number }); continue; }
    reaped.push(real);
  }
  return { reaped, skipped };
}

module.exports = { reapMerged, decideReap };
