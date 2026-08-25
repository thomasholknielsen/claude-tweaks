// bin/lib/run-dir-guard.js
//
// Shared by resolve-profile.js (--run-dir) and resolve-policy.js (--run) —
// both call worktree-detect.js's checkRunDirAnchoredOrOutside (#1065) and
// then need the identical foreign-checkout-vs-no-repo-root message
// branching; only the flag name differs in the rendered error text. Was
// duplicated inline in both files before #1177 consolidated it here.
'use strict';
const wtDetect = require('./hooks/worktree-detect');

// Returns null when runDir is anchored under the main checkout or resolves
// outside any git checkout (both accepted, per checkRunDirAnchoredOrOutside's
// own contract); otherwise the rendered rejection message for the given
// caller-facing flag name.
function anchoredOrOutsideMessage(runDir, cwd, flag) {
  const anchor = wtDetect.checkRunDirAnchoredOrOutside(runDir, cwd);
  if (anchor.ok) return null;
  return anchor.reason === 'foreign-checkout'
    ? wtDetect.unanchoredRunDirShadowMessage(anchor.resolved, anchor.mainRoot, flag)
    : wtDetect.unanchoredRunDirNoRepoMessage(cwd);
}

module.exports = { anchoredOrOutsideMessage };
