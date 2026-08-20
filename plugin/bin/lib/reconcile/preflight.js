// bin/lib/reconcile/preflight.js — a cheap upfront GitHub-health check so
// reconcile() degrades once, fast, instead of every network-dependent check
// separately discovering the same outage via its own 5-10s timeout (#820).
'use strict';
const { execFileSync } = require('child_process');
const { classifyGhApiError } = require('../issues/claim-store');

const PREFLIGHT_TIMEOUT_MS = 2000;

function defaultRunner(args, timeoutMs) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: timeoutMs, windowsHide: true });
}

// -> { ok: boolean, reason: null | 'gh-absent' | 'github-unreachable' }
// `rate_limit` is deliberately repo-agnostic and cheap — it answers "can we
// reach the GitHub API at all", not "does this repo's data look right".
function ghHealthCheck(opts = {}) {
  const timeoutMs = opts.timeoutMs || PREFLIGHT_TIMEOUT_MS;
  const runner = opts.runner || ((args) => defaultRunner(args, timeoutMs));
  try {
    runner(['api', 'rate_limit', '-q', '.rate.remaining']);
    return { ok: true, reason: null };
  } catch (e) {
    // Classification (ENOENT vs everything else) is shared with claim-store.js
    // and pr-state.js rather than reimplemented a third time here — only the
    // REASON VOCABULARY differs (this check reports 'github-unreachable', not
    // 'network-failure' — a different consumer, a different word for the same
    // classification) (review finding: 5 near-identical copies).
    const { failure } = classifyGhApiError(e);
    return failure === 'gh-absent' ? { ok: false, reason: 'gh-absent' } : { ok: false, reason: 'github-unreachable' };
  }
}

module.exports = { ghHealthCheck, PREFLIGHT_TIMEOUT_MS };
