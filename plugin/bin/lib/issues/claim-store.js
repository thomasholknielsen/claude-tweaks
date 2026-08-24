// bin/lib/issues/claim-store.js
// The one write-path implementation for the claims-registry blob store
// (`claims/issue-{n}.json` on `CLAIMS_BRANCH` — see `_shared/issue-claims.md`
// "The lock"). `readClaimBlob`/`writeClaimBlob` try a **git compare-and-swap**
// first (`./claims-git-cas.js` — fetch the branch tip, commit the blob on
// it, push with `--force-with-lease`), falling back to the contents-API PUT
// implementation below only when git-CAS fails for a transport reason (no
// git push credential — an MCP-only sandbox, for instance) or a secondary
// rate limit (#787's amendment: the contents-API claim writes were the
// fleet's most-contended endpoint; git-protocol operations cost zero API
// budget). Both the claim-side preflight CLI and
// `bin/lib/reconcile/release-merged.js`'s release path delegate their I/O
// here so there is exactly one code path performing this keyspace's writes,
// instead of multiple implementations drifting apart.
//
// The `deps.ghApi` seam is injectable (never real `gh` in tests):
// `ghApi(args)` is invoked as if `gh api ${args.join(' ')}` and returns a
// non-throwing `{stdout, failure, status}` — the same object shape
// release-merged.js's own (pre-extraction) ghApi already used, extended
// with `status` so a 404 can be told apart from a genuine failure.
// `defaultGhApi` below is the real implementation; release-merged.js keeps
// supplying its own ghApi (which never sets `status`) and no `gitRunner`,
// so `readClaimBlob`'s `absent` branch simply never fires there and it stays
// on the contents-API-only path deliberately — see release-merged.js's
// delegation comments for why that is exactly the pre-extraction behavior,
// unchanged. `deps.gitRunner` is optional — omitted, both functions skip
// straight to the contents-API path (the gh-absent/MCP fallback seam).
'use strict';

const { execFileSync } = require('child_process');
const { CLAIMS_BRANCH } = require('./claims');
const { readClaimBlobGit, writeClaimBlobGit } = require('./claims-git-cas');

const GH_TIMEOUT_MS = 5000;

function claimPath(issueNumber) {
  return `claims/issue-${issueNumber}.json`;
}

// Pure: classify a caught execFileSync error into {failure, status} — split
// out from defaultGhApi's catch block so the text-matching regexes below are
// unit-testable without touching the real `gh` binary. `defaultGhApi` is the
// only caller.
//
// `_shared/issue-claims.md`'s "The lock" step 1 documents a 404 as a normal
// outcome ("file does not exist"), not an error — gh reports it as
// `gh: Not Found (HTTP 404)` on stderr, so a thrown error whose text
// contains "HTTP 404" or "Not Found" is reported as `{status: 404,
// failure: null}` rather than folded into `network-failure`.
//
// A 422 is the other non-error rejection a claim write can hit: a lost race
// on a create-only write (someone else's landed first) or a sha-mismatch on
// a conditional write. Live-confirmed GitHub wording for the create-race
// case (gh-api-module-pattern skill): `Validation failed: Target issue has
// already been taken`. Accept the HTTP status text ("HTTP 422"), the reason
// phrase ("Unprocessable"), and the observed body text ("Validation
// failed") — any one of the three still classifies as a write-conflict
// (`status: 422`) rather than falling through to a generic
// `network-failure`, which is what `writeClaimBlob` uses to tell a lost
// race apart from a real transient failure (see that function).
//
// A 409 is the Contents API's own rejection for a conditional-write sha
// mismatch — the RECLAIM-path equivalent of the 422 create-race above (a
// stale/tombstone target someone else re-claimed between this read and this
// write). Symmetric with the 422 block: accept the HTTP status text ("HTTP
// 409"), the reason phrase ("Conflict"), or the sha-mismatch body wording
// ("does not match") — any one classifies as `status: 409`, the same
// write-conflict signal `writeClaimBlob` folds into `conflict: true`.
// Without this branch a lost reclaim race fell through to
// `network-failure`, routing `bin/claim-targets.js` to transient (exit 4)
// instead of contested (exit 3) — #723.
//
// ENOENT (no `gh` binary) is reported separately as `gh-absent` so a
// preflight CLI can name the real fallback instead of a generic failure.
//
// A secondary/abuse rate limit (403 + "secondary rate limit" text, an abuse
// detection mechanism message, or a `Retry-After` header) is checked first,
// before every other branch — it must never be misread as a contest or a
// generic network failure (record-697's incident read exactly that way
// before diagnosis; #787's amendment requires this to classify as its own
// distinct, transient outcome).
function classifyGhApiError(e) {
  if (e && e.code === 'ENOENT') return { failure: 'gh-absent', status: null };
  const text = [e && e.message, e && e.stderr, e && e.stdout].filter(Boolean).map(String).join(' ');
  if (/secondary rate limit|abuse detection mechanism|Retry-After/i.test(text)) return { failure: 'secondary-rate-limit', status: 403 };
  if (/HTTP 404|Not Found/.test(text)) return { failure: null, status: 404 };
  if (/HTTP 422|Unprocessable|Validation failed/.test(text)) return { failure: null, status: 422 };
  if (/HTTP 409|Conflict|does not match/i.test(text)) return { failure: null, status: 409 };
  return { failure: 'network-failure', status: null };
}

// The real ghApi.
function defaultGhApi(args) {
  try {
    const stdout = execFileSync('gh', ['api', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT_MS,
    });
    return { stdout, failure: null, status: null };
  } catch (e) {
    const { failure, status } = classifyGhApiError(e);
    return { stdout: null, failure, status };
  }
}

// (ghApi, repoSlug) -> { entries: [{name, sha}], failure: null|'gh-absent'|'network-failure' }
// One Contents-API directory listing — the SAME single call this module
// already made — extended to keep each entry's `sha` (previously discarded
// by `-q .[].name`) instead of adding a second Git Trees API call (#820,
// D6). `claims/` is flat and single-level, so the directory listing already
// carries everything a Trees API call would add.
function listClaimEntries(ghApi, repoSlug) {
  const r = ghApi([`repos/${repoSlug}/contents/claims?ref=${CLAIMS_BRANCH}`, '-q', '[.[] | {name, sha}]']);
  if (r.failure) return { entries: [], failure: r.failure };
  try {
    const parsed = JSON.parse(r.stdout || '[]');
    return { entries: Array.isArray(parsed) ? parsed : [], failure: null };
  } catch {
    return { entries: [], failure: 'network-failure' };
  }
}

// Thin wrapper — the only pre-existing consumer (release-merged.js) is
// migrating to listClaimEntries in the same change (see that module), but
// kept exported as-is rather than removed, since a bare rename with no
// remaining caller to prove it is unnecessary churn.
function listClaimNames(ghApi, repoSlug) {
  const { entries, failure } = listClaimEntries(ghApi, repoSlug);
  return { names: entries.map((e) => e.name), failure };
}

// (deps: {ghApi, gitRunner?}, repoSlug, issueNumber) -> { content, sha, failure, absent }
// Tries git-CAS first (no `gitRunner` dep = skip straight to contents-API,
// the gh-absent/MCP-only-sandbox seam #787's amendment requires — see
// `_shared/issue-claims.md`). A git-CAS transport failure (auth, no remote
// access) falls back to contents-API silently — the documented degrade, not
// an error. `sha` doubles as the git-CAS tip sha when this read came from
// git (`writeClaimBlob` accepts either shape as its compare-and-swap lease).
// `absent: true` (with `failure: null`) also fires on the contents-API path
// only when the ghApi dep sets `status: 404` — a caller whose ghApi never
// sets `status` (release-merged's own, pre-extraction) simply never sees
// `absent: true` there; every failure still lands as
// `gh-absent`/`network-failure`, exactly as before this extraction.
function readClaimBlob(deps, repoSlug, issueNumber) {
  if (deps.gitRunner) {
    const gitResult = readClaimBlobGit({ issueNumber, runner: deps.gitRunner });
    if (gitResult.failure === null) {
      return {
        content: gitResult.content, sha: gitResult.tipSha, failure: null, absent: gitResult.absent,
      };
    }
    // fall through to contents-API on a git-side transport failure
  }
  const r = deps.ghApi([`repos/${repoSlug}/contents/${claimPath(issueNumber)}?ref=${CLAIMS_BRANCH}`, '-q', '{content: (.content | @base64d), sha: .sha}']);
  if (r.status === 404) return { content: null, sha: null, failure: null, absent: true };
  if (r.failure) return { content: null, sha: null, failure: r.failure, absent: false };
  try {
    const parsed = JSON.parse(r.stdout);
    return { content: parsed.content, sha: parsed.sha, failure: null, absent: false };
  } catch {
    return { content: null, sha: null, failure: 'network-failure', absent: false };
  }
}

// (deps: {ghApi, gitRunner?}, repoSlug, issueNumber, {content, sha, message})
// -> { ok, conflict?, secondaryRateLimit?, failure }
// `sha` here is the compare-and-swap lease — the git-CAS tip sha when the
// preceding read went through git, or the contents-API blob sha otherwise;
// either shape is threaded straight through to whichever transport this
// write actually uses. Only attempted when both a `gitRunner` dep AND a
// `sha` lease are present — a create-only write (`sha` absent) has no
// git-CAS lease to compare against, since `writeClaimBlobGit` requires
// `expectedTipSha`; that write always goes straight to the contents-API
// create-only path below. A git-CAS contest is reported as-is (never
// silently retried against contents-API — that would race the same write
// twice under two different concurrency mechanisms). A git-CAS
// secondary-rate-limit or transport-failure falls back to contents-API once.
//
// `sha` included in the contents-API fallback only when provided: omitted =
// create-only (PUT rejects if the path already exists), present =
// conditional-update (must match the blob's current sha) — the
// create-vs-reclaim split `_shared/issue-claims.md`'s "The lock" steps 3-4
// document. A `status: 422` or `status: 409` response (see
// `classifyGhApiError`) is a genuine write-conflict — someone else's
// create-only write landed first (422), or a conditional write's sha no
// longer matches because someone else's reclaim landed first (409) — and
// must resolve `ok: false` on its own, not fall through to the generic
// `status !== 404` formula below (422 / 409 !== 404 would otherwise read as
// success). Callers distinguish this from a transient `ghApi` failure via
// `conflict: true` vs a non-null `failure` — `_shared/issue-claims.md`'s
// "the lock" step 3: "a rejection on either transport is contested — same
// handling as `'live'`, not a retry." A consumer supplying its own `ghApi`
// that never sets `status` (e.g. `release-merged.js`) never sees
// `status === 422` or `status === 409` here, so its `ok` computation is
// unchanged by this branch — see that module's delegation comments.
function writeClaimBlob(deps, repoSlug, issueNumber, { content, sha, message }) {
  if (deps.gitRunner && sha) {
    const gitResult = writeClaimBlobGit({
      issueNumber, content, message, expectedTipSha: sha, runner: deps.gitRunner,
    });
    if (gitResult.ok || gitResult.conflict) return gitResult;
    // transport-failure or secondaryRateLimit -> fall back to contents-API below
  }
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const args = [
    '--method', 'PUT', `repos/${repoSlug}/contents/${claimPath(issueNumber)}`,
    '-f', `message=${message}`,
    '-f', `content=${encoded}`,
    '-f', `branch=${CLAIMS_BRANCH}`,
  ];
  if (sha) args.push('-f', `sha=${sha}`);
  const r = deps.ghApi(args);
  if (r.failure === 'secondary-rate-limit') return { ok: false, secondaryRateLimit: true, failure: null };
  if (r.status === 422 || r.status === 409) return { ok: false, conflict: true, failure: null };
  return { ok: r.failure === null && r.status !== 404, failure: r.failure };
}

module.exports = {
  listClaimEntries, listClaimNames, readClaimBlob, writeClaimBlob, defaultGhApi, claimPath, classifyGhApiError,
};
