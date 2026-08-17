// bin/lib/reconcile/shared-fetch.js — the one `git fetch --prune origin`
// reconcile() performs per pass, shared by mirror (classify.js) and
// prune-remote.js, which each previously ran their own separate fetch
// (#820, D2). --prune (broader than mirror's single-ref fetch) also drops
// stale tracking refs for branches already gone on origin, so prune-remote
// stops re-examining them every pass.
//
// Deliberately no explicit timeoutMs here: prune-remote.js's own (now
// removed) fetch never passed one either, so it fell back to git-exec's
// DEFAULT_TIMEOUT_MS (10000ms) in production and honored the
// CT_HOOKS_GIT_TIMEOUT_MS test-load escape hatch — an explicit opts.timeoutMs
// would short-circuit that escape hatch entirely (see resolveTimeout in
// git-exec.js). Since this fetch now serves both mirror and remote-prune,
// narrowing it to mirror's tighter 5s budget would silently shrink
// remote-prune's original, more lenient one for every real reconcile pass.
// reconcile()'s own overall wall-clock budget (~18s, #820 D4) is the
// backstop against a pathologically slow fetch instead.
'use strict';
const { runGit } = require('../hooks/git-exec');

function sharedFetch(root) {
  return runGit(['fetch', '--prune', 'origin'], root);
}

module.exports = { sharedFetch };
