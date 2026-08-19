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

// Mirrors plugin/bin/claim-targets.js's GH_TIMEOUT_MS — a hanging `gh` call
// (network stall, auth prompt) must fail, not block indefinitely, so every
// fail-open caller (tombstoneInFlightPr included, #315) actually gets to
// fall through instead of hanging the whole claim path.
const GH_TIMEOUT_MS = 5000;

function defaultRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT_MS });
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

// Escapes a literal string for embedding inside a `new RegExp(...)` pattern —
// `owner`/`repo` come from this claim's own caller (trusted), but are still
// escaped defensively since GitHub does allow `.` in either.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// link: the tombstone blob's `link` field (untrusted — see tombstoneInFlightPr's
// doc comment). owner/repo: the SAME owner/repo as the issue being claimed.
// True only when `link` is a string matching the well-formed PR URL shape
// `https://github.com/{owner}/{repo}/pull/{digits}` for that exact
// owner/repo (case-sensitive). Everything else — wrong repo, a non-string
// value, a malformed URL, a flag-like string such as `--repo` — is false.
function isSameRepoPrUrl(link, owner, repo) {
  if (typeof link !== 'string') return false;
  if (typeof owner !== 'string' || !owner || typeof repo !== 'string' || !repo) return false;
  const re = new RegExp(`^https://github\\.com/${escapeRegExp(owner)}/${escapeRegExp(repo)}/pull/\\d+$`);
  return re.test(link);
}

// content: the raw tombstone blob text just read (a `'tombstone'`-classified
// claim). runner: the same injectable gh runner claimOne already has in
// scope. owner/repo: the SAME owner/repo as the issue being claimed —
// `link` must validate against this exact repo before `runner` is ever
// called (#315 review follow-up: `link` is read from a claims-registry blob
// writable by any session with registry-branch access, so an unvalidated
// `link` could point at a permanently-open PR in an unrelated repo — or a
// malformed/non-string value — and wedge every future reclaim of the real
// issue, a stored-DoS on the claim path). Returns { link } when this
// tombstone's `reason` is a `pr-opened:` release whose `link` is a
// well-formed `https://github.com/{owner}/{repo}/pull/{number}` URL for
// this SAME owner/repo (see `isSameRepoPrUrl`) and `gh pr view` still
// reports that PR `OPEN` — the in-flight-build signal
// `_shared/issue-claims.md`'s release-reason vocabulary documents `link`
// for (#315). Returns null for every other case — a non-`pr-opened:` reason
// (`merged:`/`abandoned:`, left untouched per the issue's own scope), a
// missing/invalid/wrong-repo `link` (rejected before any `runner` call), a
// closed/merged PR, or any failure along the way (unparseable content, a
// `gh pr view` error, an unparseable state) — always fail OPEN to "not in
// flight" so a `gh` hiccup (rate limit, network blip, a deleted PR) or an
// untrusted `link` can never wedge the claim path; the caller falls through
// to today's unchanged reclaim behavior.
function tombstoneInFlightPr(content, runner, owner, repo) {
  try {
    const parsed = JSON.parse(content);
    const reason = parsed && parsed.reason;
    const link = parsed && parsed.link;
    if (typeof reason !== 'string' || !reason.startsWith('pr-opened:')) return null;
    if (!isSameRepoPrUrl(link, owner, repo)) return null;
    const state = runner(['pr', 'view', link, '--json', 'state', '--jq', '.state']).trim();
    return state === 'OPEN' ? { link } : null;
  } catch {
    return null; // fail open — a broken check must never block a legitimate reclaim
  }
}

// { owner, repo, issueNumber, runId, sessionId, host, now, runner } ->
// { issueNumber, outcome: 'claimed'|'contested'|'in-flight'|'error', state, holder?, link?, error? }
function claimOne({ owner, repo, issueNumber, runId, sessionId, host, now, runner = defaultRunner }) {
  let read;
  try {
    read = readClaimBlob({ owner, repo, issueNumber, runner });
  } catch (err) {
    return { issueNumber, outcome: 'error', state: null, error: errorText(err) };
  }
  const classified = classifyClaimBlob(read.content, now);
  // A `pr-opened:` tombstone whose linked PR is still open means a build
  // already completed for this issue and is awaiting merge — reclaiming
  // (and re-building) here would race that open PR (#315). Gate this ahead
  // of the reclaimable branch below since a tombstone is otherwise always
  // reclaimable; every other tombstone reason, and any failure in the
  // check itself, falls straight through unchanged.
  if (classified.state === 'tombstone') {
    const inFlight = tombstoneInFlightPr(read.content, runner, owner, repo);
    if (inFlight) return { issueNumber, outcome: 'in-flight', state: classified.state, link: inFlight.link };
  }
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
// { claimed: [n...], contested: [{issueNumber, ...}], errored: [{issueNumber, ...}], released: [n...], inFlight: [{issueNumber, link, ...}] }
// Group-claim-all-or-abort (`_shared/issue-claims.md`'s "Group claiming"):
// on the first contest/error/in-flight, release everything this call *did*
// claim, per target, and stop — unless keepGoing, which downgrades the
// failing target to a skip and continues with the rest of the group.
// `inFlight` (#315) is reported in its own bucket, distinct from
// `contested`/`errored`, so a caller can tell "someone else holds this" and
// "a real transport failure" apart from "a build for this issue already
// completed and has an open PR" — but it aborts the group the same way.
function claimGroup({ owner, repo, issueNumbers, runId, sessionId, host, now, runner = defaultRunner, keepGoing = false }) {
  const claimed = [];
  const contested = [];
  const errored = [];
  const inFlight = [];
  for (const issueNumber of issueNumbers) {
    const result = claimOne({ owner, repo, issueNumber, runId, sessionId, host, now, runner });
    if (result.outcome === 'claimed') { claimed.push(issueNumber); continue; }
    if (result.outcome === 'contested') contested.push(result);
    else if (result.outcome === 'in-flight') inFlight.push(result);
    else errored.push(result);
    if (!keepGoing) break; // all-or-abort: stop attempting further targets
  }
  const aborted = !keepGoing && (contested.length > 0 || errored.length > 0 || inFlight.length > 0);
  const released = [];
  const stillClaimed = [];
  if (aborted) {
    for (const issueNumber of claimed) {
      const releaseResult = releaseOne({ owner, repo, issueNumber, runId, reason: 'never-started: file-overlap group partial claim', now, runner });
      // Only report a target as released if the cleanup write actually
      // succeeded — the exact silent-failure shape this module exists to
      // close off. A failed cleanup release still holds this run's own
      // lock; reporting it as released anyway would strand the claim for
      // the reclaim TTL while every caller believed the group was free.
      if (releaseResult.outcome === 'released') released.push(issueNumber);
      else stillClaimed.push(issueNumber);
    }
  }
  return { claimed: aborted ? stillClaimed : claimed, contested, errored, released, inFlight };
}

module.exports = {
  defaultRunner, errorText, isHttpStatus, isHttp404, isHttp422, claimFilePath,
  ensureClaimsBranch, readClaimBlob, writeClaimBlob, postClaimMirror, removeInProgressLabel,
  tombstoneInFlightPr, claimOne, releaseOne, claimGroup,
};
