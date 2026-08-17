// bin/lib/issues/claim-engine.js
// Network-touching read-classify-write engine for the claims-registry blob
// lock (`_shared/issue-claims.md`'s "The lock"). `bin/lib/issues/claims.js`
// stays pure (payload shaping + classification, no network); this module is
// the gh-CLI transport that reads a claim blob, classifies it via
// `classifyClaimBlob`, and writes create-only or conditional per the
// classification — the exact read-classify-write loop that used to be
// hand-scripted per run (a zsh `echo`/`jq` escaping bug in that loop shipped
// six empty claim blobs, all classified `unreadable`, before a mid-run fix —
// the incident this module exists to close off structurally).
//
// The runner is injectable: runner(args) is invoked as if `gh ${args.join(' ')}`
// and returns stdout; a throw is a failed call. Tests never touch a real `gh`.
//
// 404-vs-error (the specific bug class this replaces): a claim path that does
// not exist yet is a NORMAL outcome ('absent', reclaimable) distinguished from
// every other transport failure (network, auth, malformed JSON) which must
// surface as a real error, never be silently treated as "absent". `isHttp404`
// below is the one place that distinction is made.
'use strict';

const { execFileSync } = require('child_process');
const { classifyClaimBlob, claimPayload, releasePayload, CLAIMS_BRANCH } = require('./claims');

function defaultRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function errorText(err) {
  const parts = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).map(String);
  return parts.length ? parts.join(' ') : String(err);
}

// `gh api` prints `gh: {message} (HTTP {code})` to stderr on any non-2xx
// response and exits non-zero — confirmed live against this repo (2026-08-17,
// a rate-limit 403: "gh: API rate limit exceeded ... (HTTP 403)"). Matching
// the literal `(HTTP {code})` suffix, not a bare `\b{code}\b`, avoids a false
// match on an unrelated digit elsewhere in a message (an issue number, a byte
// count) — the same over-broad-regex trap `link.js`'s 422 matcher accepts for
// its narrower "422 AND already" pairing; a bare status code alone is not
// narrow enough on its own to gate a read that decides absent-vs-error.
function isHttpStatus(err, code) {
  return new RegExp(`\\(HTTP ${code}\\)`).test(errorText(err));
}

function isHttp404(err) { return isHttpStatus(err, 404); }
function isHttp422(err) { return isHttpStatus(err, 422); }

function claimFilePath(issueNumber) {
  return `claims/issue-${issueNumber}.json`;
}

// { owner, repo, runner } -> void. Idempotent: tolerates a 422 (branch
// already exists — a concurrent agent created it first) as success, the same
// race-tolerance every create-only write in this protocol has.
function ensureClaimsBranch({ owner, repo, runner = defaultRunner }) {
  try {
    runner(['api', `repos/${owner}/${repo}/git/refs/heads/${CLAIMS_BRANCH}`]);
    return; // already exists
  } catch (err) {
    if (!isHttp404(err)) throw err; // anything but "doesn't exist yet" is a real failure
  }
  const defaultBranch = runner(['api', `repos/${owner}/${repo}`, '-q', '.default_branch']).trim();
  const sha = runner(['api', `repos/${owner}/${repo}/commits/${defaultBranch}`, '-q', '.sha']).trim();
  try {
    runner(['api', `repos/${owner}/${repo}/git/refs`, '-f', `ref=refs/heads/${CLAIMS_BRANCH}`, '-f', `sha=${sha}`]);
  } catch (err) {
    if (!isHttp422(err)) throw err; // "already exists" — a concurrent bootstrap won the race
  }
}

// { owner, repo, issueNumber, runner } -> { content, sha } — content is the
// decoded blob text, sha is its current blob sha. A 404 (path does not exist
// yet on claims-registry) is the documented 'absent' outcome, not an error:
// returns { content: null, sha: null }. Any other failure (network, auth,
// malformed response) rethrows — this is the exact distinction the hand-rolled
// zsh loop got wrong (an escaping bug produced empty content that then
// classified as 'unreadable' rather than a clean 'absent' or a loud error).
function readClaimBlob({ owner, repo, issueNumber, branch = CLAIMS_BRANCH, runner = defaultRunner }) {
  const path = claimFilePath(issueNumber);
  try {
    const out = runner(['api', `repos/${owner}/${repo}/contents/${path}?ref=${branch}`, '-q', '{content: (.content | @base64d), sha: .sha}']);
    const parsed = JSON.parse(out);
    return { content: parsed.content, sha: parsed.sha };
  } catch (err) {
    if (isHttp404(err)) return { content: null, sha: null };
    throw err;
  }
}

// { owner, repo, issueNumber, message, content, sha?, branch?, runner } -> void.
// Omitting `sha` is a create-only write (PUT rejects if the path already
// exists); passing it is a conditional overwrite (PUT rejects on a sha
// mismatch — someone else wrote first between our read and this write).
function writeClaimBlob({ owner, repo, issueNumber, message, content, sha, branch = CLAIMS_BRANCH, runner = defaultRunner }) {
  const path = claimFilePath(issueNumber);
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const args = ['api', '--method', 'PUT', `repos/${owner}/${repo}/contents/${path}`,
    '-f', `message=${message}`, '-f', `content=${encoded}`, '-f', `branch=${branch}`];
  if (sha) args.push('-f', `sha=${sha}`);
  runner(args);
}

// Best-effort: bootstrap-then-add the bot:in-progress label and post the
// claim comment. Never throws — a failure here must never affect claim
// state (`_shared/issue-claims.md`'s "The mirror" section: identity and lock
// are the blob write alone). Returns { labelOk, commentOk }.
function postClaimMirror({ owner, repo, issueNumber, commentBody, runner = defaultRunner }) {
  const result = { labelOk: false, commentOk: false };
  try {
    runner(['issue', 'edit', String(issueNumber), '--repo', `${owner}/${repo}`, '--add-label', 'bot:in-progress']);
    result.labelOk = true;
  } catch { /* best-effort — bootstrap-then-add label failures never block the claim */ }
  try {
    runner(['issue', 'comment', String(issueNumber), '--repo', `${owner}/${repo}`, '--body', commentBody]);
    result.commentOk = true;
  } catch { /* best-effort — the blob is the lock, the comment is a mirror only */ }
  return result;
}

function removeInProgressLabel({ owner, repo, issueNumber, runner = defaultRunner }) {
  try {
    runner(['issue', 'edit', String(issueNumber), '--repo', `${owner}/${repo}`, '--remove-label', 'bot:in-progress']);
    return true;
  } catch { return false; }
}

// { owner, repo, issueNumber, runId, sessionId, host, now, runner } ->
// { issueNumber, outcome: 'claimed'|'contested'|'error', state, holder?, error? }
function claimOne({ owner, repo, issueNumber, runId, sessionId, host, now, runner = defaultRunner }) {
  let read;
  try {
    read = readClaimBlob({ owner, repo, issueNumber, runner });
  } catch (err) {
    return { issueNumber, outcome: 'error', state: null, error: errorText(err) };
  }
  const classified = classifyClaimBlob(read.content, now);
  if (!classified.reclaimable) {
    let holder = null;
    try { holder = read.content ? JSON.parse(read.content) : null; } catch { /* unreadable — no holder identity to report */ }
    return { issueNumber, outcome: 'contested', state: classified.state, holder };
  }
  const payload = claimPayload({ issueNumber, runId, sessionId, host, now });
  try {
    writeClaimBlob({
      owner, repo, issueNumber,
      message: `Claim issue #${issueNumber}`,
      content: payload.fileContent,
      sha: classified.state === 'absent' ? undefined : read.sha,
      runner,
    });
  } catch (err) {
    // A rejected write (someone else's write landed between our read and
    // this write) is a contest, not a transport error.
    return { issueNumber, outcome: 'contested', state: classified.state, error: errorText(err) };
  }
  const mirror = postClaimMirror({ owner, repo, issueNumber, commentBody: payload.commentBody, runner });
  return { issueNumber, outcome: 'claimed', state: classified.state, mirror };
}

// { owner, repo, issueNumber, runId, reason, link, now, runner } ->
// { issueNumber, outcome: 'released'|'not-owner'|'error', error? }
function releaseOne({ owner, repo, issueNumber, runId, reason, link, now, runner = defaultRunner }) {
  let read;
  try {
    read = readClaimBlob({ owner, repo, issueNumber, runner });
  } catch (err) {
    return { issueNumber, outcome: 'error', error: errorText(err) };
  }
  const classified = classifyClaimBlob(read.content, now);
  if (classified.state === 'absent') return { issueNumber, outcome: 'not-owner', error: 'no claim to release (absent)' };
  let current = null;
  try { current = read.content ? JSON.parse(read.content) : null; } catch { /* unreadable — ownership check below fails closed */ }
  // Ownership rule: never release a claim this run does not hold — a
  // successor may have broken a stale claim and now owns the lock.
  if (!current || current.runId !== runId) {
    return { issueNumber, outcome: 'not-owner', error: current ? `held by ${current.runId}` : 'unreadable claim blob' };
  }
  const payload = releasePayload({ issueNumber, runId, reason, link, now });
  try {
    writeClaimBlob({ owner, repo, issueNumber, message: `Release issue #${issueNumber}`, content: payload.tombstoneContent, sha: read.sha, runner });
  } catch (err) {
    return { issueNumber, outcome: 'error', error: errorText(err) };
  }
  removeInProgressLabel({ owner, repo, issueNumber, runner });
  try { runner(['issue', 'comment', String(issueNumber), '--repo', `${owner}/${repo}`, '--body', payload.commentBody]); } catch { /* best-effort mirror */ }
  return { issueNumber, outcome: 'released' };
}

// { owner, repo, issueNumbers, runId, sessionId, host, now, runner, keepGoing } ->
// { claimed: [n...], contested: [{issueNumber, ...}], errored: [{issueNumber, ...}], released: [n...] }
// Group-claim-all-or-abort (`_shared/issue-claims.md`'s "Group claiming"):
// on the first contest/error, release everything this call *did* claim, per
// target, and stop — unless keepGoing, which downgrades the failing target
// to a skip and continues with the rest of the group.
function claimGroup({ owner, repo, issueNumbers, runId, sessionId, host, now, runner = defaultRunner, keepGoing = false }) {
  const claimed = [];
  const contested = [];
  const errored = [];
  for (const issueNumber of issueNumbers) {
    const result = claimOne({ owner, repo, issueNumber, runId, sessionId, host, now, runner });
    if (result.outcome === 'claimed') { claimed.push(issueNumber); continue; }
    if (result.outcome === 'contested') contested.push(result);
    else errored.push(result);
    if (!keepGoing) break; // all-or-abort: stop attempting further targets
  }
  const aborted = !keepGoing && (contested.length > 0 || errored.length > 0);
  const released = [];
  if (aborted) {
    for (const issueNumber of claimed) {
      releaseOne({ owner, repo, issueNumber, runId, reason: 'never-started: file-overlap group partial claim', now, runner });
      released.push(issueNumber);
    }
  }
  return { claimed: aborted ? [] : claimed, contested, errored, released };
}

module.exports = {
  defaultRunner, errorText, isHttpStatus, isHttp404, isHttp422, claimFilePath,
  ensureClaimsBranch, readClaimBlob, writeClaimBlob, postClaimMirror, removeInProgressLabel,
  claimOne, releaseOne, claimGroup,
};
