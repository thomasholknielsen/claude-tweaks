// plugin/bin/lib/repo-resolve.js — shared owner/repo resolution for the
// single-invocation gh-api CLI wrappers under bin/, factored out of
// apply-refine-labels.js, fetch-sub-issues.js, and resolve-blockers.js,
// which each hand-rolled an identical parseRepo/ghAvailable/remoteUrl trio
// (review finding: these three newest CLIs brought the total to 9
// independent copies of the same owner/repo regex across the codebase). Not
// a migration of the six pre-existing copies (link-records.js,
// release-claim.js, preflight-records.js, file-feedback.js, materialize.js,
// claims.js, plus hooks/teardown-run.js's inline copy) — out of scope for
// this fix; see gh-api-module-pattern's note that a fourth/fifth hand-rolled
// copy is not license for a fifth/sixth.
'use strict';
const { execFileSync } = require('child_process');

// A GitHub remote URL (SSH or HTTPS, with or without .git, or an
// `owner/name` string wrapped as `github.com/owner/name` by a caller) ->
// { owner, repo }, or null when it doesn't match.
function parseRepo(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

function ghAvailable() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function remoteUrl() {
  return execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
}

module.exports = { parseRepo, ghAvailable, remoteUrl };
