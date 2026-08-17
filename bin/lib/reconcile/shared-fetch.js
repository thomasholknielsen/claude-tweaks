// bin/lib/reconcile/shared-fetch.js — the one `git fetch --prune origin`
// reconcile() performs per pass, shared by mirror (classify.js) and
// prune-remote.js, which each previously ran their own separate fetch
// (#820, D2). --prune (broader than mirror's single-ref fetch) also drops
// stale tracking refs for branches already gone on origin, so prune-remote
// stops re-examining them every pass.
'use strict';
const { runGit } = require('../hooks/git-exec');

const FETCH_TIMEOUT_MS = 5000;

function sharedFetch(root) {
  return runGit(['fetch', '--prune', 'origin'], root, { timeoutMs: FETCH_TIMEOUT_MS });
}

module.exports = { sharedFetch, FETCH_TIMEOUT_MS };
