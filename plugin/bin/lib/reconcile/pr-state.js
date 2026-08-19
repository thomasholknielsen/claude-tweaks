// bin/lib/reconcile/pr-state.js — PR-state join: a branch name -> the PR(s)
// covering it, tie-broken to one governing state. Flat sibling, not nested
// under any one check module — reap-merged.js, release-merged.js, and
// archive-merged.js all need this exact join, and the alternative (each
// re-deriving its own `gh pr list` call and tie-break) is the duplication
// CLAUDE.md's Don'ts already warns against. Deliberately gh-CLI-only: a
// Node subprocess cannot see an agent session's MCP tools (see
// `_shared/integration-model.md`) — a gh-absent environment reports that
// reason rather than attempting an MCP path.
'use strict';
const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const { classifyGhApiError } = require('../issues/claim-store');

const execFileAsync = promisify(execFile);

// Shared with claim-store.js/preflight.js/release-merged.js rather than a
// fourth/fifth copy of the same ENOENT-vs-everything-else classification
// (review finding: 5 near-identical copies drifting independently).
function classifyExecError(e) {
  return classifyGhApiError(e).failure === 'gh-absent' ? 'gh-absent' : 'network-failure';
}

const FETCH_TIMEOUT_MS = 5000;
const PR_LIST_ARGS = ['pr', 'list', '--state', 'all', '--json', 'number,state,mergedAt,updatedAt'];

// Pure: the parsed `gh pr list` JSON array -> the one governing PR. Shared by
// both the sync and async resolvers below so the tie-break logic (and any
// future fix to it) lives in exactly one place (#820 review).
//
// Multi-PR tie-break: merge is terminal, so any merged PR in the set wins
// regardless of how many others exist for the same branch (a re-opened PR
// after a first was closed unmerged, for instance).
function pickGoverningPr(prs) {
  if (!Array.isArray(prs) || prs.length === 0) return null;
  const merged = prs.find((pr) => pr.state === 'MERGED');
  if (merged) return merged;
  // Otherwise the most recently updated PR governs.
  return prs.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

// Never use `gh pr list --search` — GitHub's search index lags fresh writes.
// `--head {branch}` resolves against the REST list, which does not.
function resolvePrState(repoRoot, branch) {
  if (!branch) return null;
  let stdout;
  try {
    stdout = execFileSync(
      'gh',
      ['pr', 'list', '--head', branch, ...PR_LIST_ARGS.slice(2)],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: FETCH_TIMEOUT_MS, windowsHide: true },
    );
  } catch (e) {
    return classifyExecError(e);
  }
  let prs;
  try {
    prs = JSON.parse(stdout);
  } catch {
    return 'network-failure';
  }
  return pickGoverningPr(prs);
}

// Async twin of resolvePrState — a real (non-blocking) execFile, so a caller
// can fan this out through gh-pool's runWithConcurrency the same way
// release-merged.js already does for its issue-state reads (#820 review: the
// prior release-merged.js only pooled the issue-state call, leaving this
// per-active-claim `gh pr list` call — a superset of what needs issue
// evidence — fully serial).
async function resolvePrStateAsync(repoRoot, branch) {
  if (!branch) return null;
  let stdout;
  try {
    const r = await execFileAsync(
      'gh',
      ['pr', 'list', '--head', branch, ...PR_LIST_ARGS.slice(2)],
      { cwd: repoRoot, encoding: 'utf8', timeout: FETCH_TIMEOUT_MS, windowsHide: true },
    );
    stdout = r.stdout;
  } catch (e) {
    return classifyExecError(e);
  }
  let prs;
  try {
    prs = JSON.parse(stdout);
  } catch {
    return 'network-failure';
  }
  return pickGoverningPr(prs);
}

module.exports = { resolvePrState, resolvePrStateAsync, FETCH_TIMEOUT_MS };
