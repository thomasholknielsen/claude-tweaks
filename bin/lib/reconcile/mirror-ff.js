// bin/lib/reconcile/mirror-ff.js — convergence check 1: fast-forward the
// local mirror of the integration branch toward origin. Never merges,
// rebases, or force-anything — a strict `--ff-only` is the only write this
// check performs, so git itself refuses the operation if the two have
// actually diverged (belt-and-braces on top of classify.js's own check).
'use strict';
const { runGit } = require('../hooks/git-exec');
const { classifyMirror } = require('./classify');

// repoRoot, integration branch name -> { state, action, reason?, warning? }
//   action: 'none' | 'fast-forwarded' | 'failed' | 'skipped'
// 'ahead'/'diverged' are anomalies under pr-first (nothing should ever
// commit directly to the mirror) — reported with a warning, never acted on.
function mirrorFastForward(repoRoot, integration) {
  const classified = classifyMirror(repoRoot, integration);
  if (classified.failure) {
    return { state: null, action: 'skipped', reason: classified.failure };
  }
  if (classified.state === 'dirty') {
    return { state: 'dirty', action: 'none', reason: 'dirty' };
  }
  if (classified.state === 'current') {
    return { state: 'current', action: 'none' };
  }
  if (classified.state === 'ahead') {
    return { state: 'ahead', action: 'none', warning: 'local-only commits on the integration branch — anomaly under pr-first' };
  }
  if (classified.state === 'diverged') {
    return { state: 'diverged', action: 'none', warning: 'integration branch has diverged from origin — anomaly under pr-first' };
  }
  // 'behind' — the only state this check ever acts on.
  const ff = runGit(['merge', '--ff-only', `origin/${integration}`], repoRoot);
  if (ff.failure) return { state: 'behind', action: 'failed', reason: ff.failure };
  return { state: 'behind', action: 'fast-forwarded' };
}

module.exports = { mirrorFastForward };
