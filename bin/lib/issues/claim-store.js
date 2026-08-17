// bin/lib/issues/claim-store.js
// The one contents-API implementation for the claims-registry blob store
// (`claims/issue-{n}.json` on `CLAIMS_BRANCH` — see `_shared/issue-claims.md`
// "The lock"). Both the claim-side preflight CLI and
// `bin/lib/reconcile/release-merged.js`'s release path delegate their I/O
// here so there is exactly one code path shelling to `gh` for this
// keyspace, instead of two implementations drifting apart.
//
// The `ghApi` seam is injectable (never real `gh` in tests): `ghApi(args)`
// is invoked as if `gh api ${args.join(' ')}` and returns a non-throwing
// `{stdout, failure, status}` — the same object shape release-merged.js's
// own (pre-extraction) ghApi already used, extended with `status` so a 404
// can be told apart from a genuine failure. `defaultGhApi` below is the
// real implementation; release-merged.js keeps supplying its own ghApi
// (which never sets `status`), so `readClaimBlob`'s `absent` branch simply
// never fires there — see release-merged.js's delegation comments for why
// that is exactly the pre-extraction behavior, unchanged.
'use strict';

const { execFileSync } = require('child_process');
const { CLAIMS_BRANCH } = require('./claims');

const GH_TIMEOUT_MS = 5000;

function claimPath(issueNumber) {
  return `claims/issue-${issueNumber}.json`;
}

// The real ghApi. `_shared/issue-claims.md`'s "The lock" step 1 documents a
// 404 as a normal outcome ("file does not exist"), not an error — gh
// reports it as `gh: Not Found (HTTP 404)` on stderr, so a thrown error
// whose text contains "HTTP 404" or "Not Found" is reported as
// `{status: 404, failure: null}` rather than folded into `network-failure`.
// ENOENT (no `gh` binary) is reported separately as `gh-absent` so a
// preflight CLI can name the real fallback instead of a generic failure.
function defaultGhApi(args) {
  try {
    const stdout = execFileSync('gh', ['api', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT_MS,
    });
    return { stdout, failure: null, status: null };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { stdout: null, failure: 'gh-absent', status: null };
    const text = [e && e.message, e && e.stderr, e && e.stdout].filter(Boolean).map(String).join(' ');
    if (/HTTP 404|Not Found/.test(text)) return { stdout: null, failure: null, status: 404 };
    return { stdout: null, failure: 'network-failure', status: null };
  }
}

// (ghApi, repoSlug) -> { names: string[], failure: null|'gh-absent'|'network-failure' }
function listClaimNames(ghApi, repoSlug) {
  const r = ghApi([`repos/${repoSlug}/contents/claims?ref=${CLAIMS_BRANCH}`, '-q', '.[].name']);
  if (r.failure) return { names: [], failure: r.failure };
  const stdout = r.stdout || '';
  return { names: stdout.split('\n').map((s) => s.trim()).filter(Boolean), failure: null };
}

// (ghApi, repoSlug, issueNumber) -> { content, sha, failure, absent }
// `absent: true` (with `failure: null`) fires only when the ghApi dep sets
// `status: 404` — a caller whose ghApi never sets `status` (release-merged's
// own, pre-extraction) simply never sees `absent: true`; every failure
// still lands as `gh-absent`/`network-failure`, exactly as before this
// extraction.
function readClaimBlob(ghApi, repoSlug, issueNumber) {
  const r = ghApi([`repos/${repoSlug}/contents/${claimPath(issueNumber)}?ref=${CLAIMS_BRANCH}`, '-q', '{content: (.content | @base64d), sha: .sha}']);
  if (r.status === 404) return { content: null, sha: null, failure: null, absent: true };
  if (r.failure) return { content: null, sha: null, failure: r.failure, absent: false };
  try {
    const parsed = JSON.parse(r.stdout);
    return { content: parsed.content, sha: parsed.sha, failure: null, absent: false };
  } catch {
    return { content: null, sha: null, failure: 'network-failure', absent: false };
  }
}

// (ghApi, repoSlug, issueNumber, { content, sha, message }) -> { ok, failure }
// `sha` included only when provided: omitted = create-only (PUT rejects if
// the path already exists), present = conditional-update (must match the
// blob's current sha) — the create-vs-reclaim split
// `_shared/issue-claims.md`'s "The lock" steps 3-4 document.
function writeClaimBlob(ghApi, repoSlug, issueNumber, { content, sha, message }) {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const args = [
    '--method', 'PUT', `repos/${repoSlug}/contents/${claimPath(issueNumber)}`,
    '-f', `message=${message}`,
    '-f', `content=${encoded}`,
    '-f', `branch=${CLAIMS_BRANCH}`,
  ];
  if (sha) args.push('-f', `sha=${sha}`);
  const r = ghApi(args);
  return { ok: r.failure === null && r.status !== 404, failure: r.failure };
}

module.exports = {
  listClaimNames, readClaimBlob, writeClaimBlob, defaultGhApi, claimPath,
};
