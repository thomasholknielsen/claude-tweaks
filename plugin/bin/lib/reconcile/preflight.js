// bin/lib/reconcile/preflight.js — a cheap upfront GitHub-health check so
// reconcile() degrades once, fast, instead of every network-dependent check
// separately discovering the same outage via its own 5-10s timeout (#820).
'use strict';
const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const { classifyGhApiError } = require('../issues/claim-store');

const execFileAsync = promisify(execFile);

const PREFLIGHT_TIMEOUT_MS = 2000;

function defaultRunner(args, timeoutMs) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: timeoutMs, windowsHide: true });
}

async function defaultRunnerAsync(args, timeoutMs) {
  const { stdout } = await execFileAsync('gh', args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  return stdout;
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

// Async twin of ghHealthCheck — a real (non-blocking) execFile, so
// reconcile/index.js's FAST_CHECKS dispatch can run this concurrently with
// the shared git fetch via Promise.all instead of paying for both serially
// (#872). Mirrors resolvePrStateAsync's (pr-state.js) established
// execFile-based async pattern: same classification helper as the sync
// version above (classifyGhApiError) — only the REASON VOCABULARY and the
// blocking-vs-non-blocking spawn differ.
async function ghHealthCheckAsync(opts = {}) {
  const timeoutMs = opts.timeoutMs || PREFLIGHT_TIMEOUT_MS;
  const runner = opts.runner || ((args) => defaultRunnerAsync(args, timeoutMs));
  try {
    await runner(['api', 'rate_limit', '-q', '.rate.remaining']);
    return { ok: true, reason: null };
  } catch (e) {
    const { failure } = classifyGhApiError(e);
    return failure === 'gh-absent' ? { ok: false, reason: 'gh-absent' } : { ok: false, reason: 'github-unreachable' };
  }
}

module.exports = { ghHealthCheck, ghHealthCheckAsync, PREFLIGHT_TIMEOUT_MS };
