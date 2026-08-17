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
const { execFileSync } = require('child_process');

const FETCH_TIMEOUT_MS = 5000;

// Never use `gh pr list --search` — GitHub's search index lags fresh writes.
// `--head {branch}` resolves against the REST list, which does not.
function resolvePrState(repoRoot, branch) {
  if (!branch) return null;
  let stdout;
  try {
    stdout = execFileSync(
      'gh',
      ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,mergedAt,updatedAt'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: FETCH_TIMEOUT_MS },
    );
  } catch (e) {
    if (e && e.code === 'ENOENT') return 'gh-absent';
    return 'network-failure';
  }
  let prs;
  try {
    prs = JSON.parse(stdout);
  } catch {
    return 'network-failure';
  }
  if (!Array.isArray(prs) || prs.length === 0) return null;
  // Multi-PR tie-break: merge is terminal, so any merged PR in the set wins
  // regardless of how many others exist for the same branch (a re-opened PR
  // after a first was closed unmerged, for instance).
  const merged = prs.find((pr) => pr.state === 'MERGED');
  if (merged) return merged;
  // Otherwise the most recently updated PR governs.
  return prs.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

module.exports = { resolvePrState, FETCH_TIMEOUT_MS };
