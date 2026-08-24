// bin/lib/release-claim/release.js
// The one claim-release write path: read the claim blob, classify it, honor the
// ownership rule, overwrite it with releasePayload's tombstone (conditional on
// the read sha), post the release comment, and optionally strip labels — the
// mechanics wrap-up/cleanup-procedures.md Section E steps 3-6 and the
// `bot:in-progress` half of step 7 describe, in one call. bin/release-claim.js
// is the thin CLI; bin/lib/reconcile/release-merged.js
// shares writeTombstone below instead of composing its own PUT. Injectable
// runner(args) is invoked as `gh ${args.join(' ')}` (gh-api-module-pattern);
// tests never touch real gh. Contract: skills/_shared/issue-claims.md.
'use strict';

const { execFileSync } = require('child_process');
const { classifyClaimBlob, releasePayload } = require('../issues/claims');
const claimStore = require('../issues/claim-store');

const GRANT_LABELS = ['auto:build', 'auto:merge'];
const IN_PROGRESS_LABEL = 'bot:in-progress';

function defaultRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function errorText(err) {
  const parts = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).map(String);
  return parts.length ? parts.join(' ') : String(err);
}

function isNotFoundError(err) { return /\b404\b|Not Found/i.test(errorText(err)); }
// 404 (already swept), 409/422 (sha mismatch — someone else re-claimed or released first).
// Anchored on the status-line shape (`HTTP <code>`) so a 500 whose body happens to mention
// "404" is never downgraded to already-released.
function isAlreadyReleasedError(err) { return /HTTP (404|409|422)\b/.test(errorText(err)); }

// -> { content, sha } | { content:null, sha:null, absent:true }; other failures throw.
// Delegates to claim-store.js's readClaimBlob (the surviving single
// write-path module, now with git-CAS tried first when `gitRunner` is
// supplied) instead of this module's own separate gh api call (#787
// consolidation). `gitRunner` is a new optional parameter — omitted
// (`undefined`), this behaves exactly as before (contents-API only).
function readClaimBlob({ owner, repo, issueNumber, runner = defaultRunner, gitRunner }) {
  const ghApi = (args) => {
    try {
      const stdout = runner(['api', ...args]);
      return { stdout, failure: null, status: null };
    } catch (err) {
      if (isNotFoundError(err)) return { stdout: null, failure: null, status: 404 };
      return { stdout: null, failure: 'network-failure', status: null };
    }
  };
  const result = claimStore.readClaimBlob({ ghApi, gitRunner }, `${owner}/${repo}`, issueNumber);
  if (result.failure) { const e = new Error(`claim-store read failure: ${result.failure}`); throw e; }
  return result.absent ? { content: null, sha: null, absent: true } : { content: result.content, sha: result.sha };
}

// Conditional overwrite (sha = the blob's current sha from the read) — now
// delegating to claim-store.js's writeClaimBlob (#787 consolidation), which
// tries git-CAS first per the amendment when `gitRunner` is supplied.
// release-merged.js's own call site never passes one (see that module's own
// header comment) and stays contents-API-only, unchanged by this task;
// bin/release-claim.js does pass a real one.
function writeTombstone({ owner, repo, issueNumber, sha, tombstoneContent, message, runner = defaultRunner, gitRunner }) {
  const ghApi = (args) => {
    const stdout = runner(['api', ...args]);
    return { stdout, failure: null, status: null };
  };
  const result = claimStore.writeClaimBlob({ ghApi, gitRunner }, `${owner}/${repo}`, issueNumber, {
    content: tombstoneContent, sha, message,
  });
  if (!result.ok) {
    const e = new Error(result.conflict ? 'HTTP 409/422 sha mismatch' : (result.failure || 'write failed'));
    throw e;
  }
  return '';
}

function postReleaseComment({ owner, repo, issueNumber, body, runner = defaultRunner }) {
  return runner(['issue', 'comment', String(issueNumber), '--repo', `${owner}/${repo}`, '--body', body]);
}

// Best-effort — never throws (a failed label edit never blocks a release).
function removeLabel({ owner, repo, issueNumber, label, runner = defaultRunner }) {
  try {
    runner(['issue', 'edit', String(issueNumber), '--repo', `${owner}/${repo}`, '--remove-label', label]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// -> { outcome, holder?, calls, commentPosted, labelsRemoved, labelsFailed, error?, note? }
// `error` is set only when outcome === 'failed' (a read failure, or a PUT
// failure that isn't already-released). Non-fatal diagnostics — the
// 404/409/422 PUT error text on the already-released path, and any
// comment-post failure — go into `note` instead (joined with '; ' if both
// occur).
function releaseClaim({
  owner, repo, issueNumber, runId, reason, link, removeGrants = false, removeInProgress = false, runner = defaultRunner, gitRunner, now = Date.now(),
}) {
  const result = { outcome: 'failed', calls: [], commentPosted: false, labelsRemoved: [], labelsFailed: [], note: null };
  let blob;
  try { blob = readClaimBlob({ owner, repo, issueNumber, runner, gitRunner }); } catch (err) { result.error = errorText(err); return result; }
  result.calls.push('read');
  const classified = classifyClaimBlob(blob.content, now);
  if (classified.state === 'unreadable') { result.outcome = 'skipped-not-owner'; result.holder = 'unreadable'; return result; }
  const isHeld = classified.state === 'live' || classified.state === 'stale';
  if (isHeld) {
    const holder = JSON.parse(blob.content).runId;
    if (holder !== runId) { result.outcome = 'skipped-not-owner'; result.holder = holder; return result; }
  }
  const payload = releasePayload({ issueNumber, runId, reason, link: link || undefined, now });
  if (isHeld) {
    try {
      writeTombstone({
        owner, repo, issueNumber, sha: blob.sha, tombstoneContent: payload.tombstoneContent, message: `Release claim on issue #${issueNumber}`, runner, gitRunner,
      });
      result.calls.push('put');
      result.outcome = 'released';
    } catch (err) {
      if (!isAlreadyReleasedError(err)) { result.error = errorText(err); return result; }
      result.outcome = 'already-released';
      result.note = errorText(err);
    }
  } else {
    // absent, or a tombstone (own or foreign) — nothing to overwrite. A
    // tombstone is not a held lock, so the ownership rule above (which
    // guards only a live/stale lock held by another run) deliberately does
    // not apply here: the comment and label removals still run.
    result.outcome = 'already-released';
  }
  try {
    postReleaseComment({ owner, repo, issueNumber, body: payload.commentBody, runner });
    result.calls.push('comment');
    result.commentPosted = true;
  } catch (err) {
    result.note = result.note ? `${result.note}; ${errorText(err)}` : errorText(err);
  }
  const labels = [...(removeGrants ? GRANT_LABELS : []), ...(removeInProgress ? [IN_PROGRESS_LABEL] : [])];
  for (const label of labels) {
    const r = removeLabel({ owner, repo, issueNumber, label, runner });
    result.calls.push(`label:${label}`);
    (r.ok ? result.labelsRemoved : result.labelsFailed).push(label);
  }
  return result;
}

module.exports = {
  defaultRunner, errorText, isNotFoundError, isAlreadyReleasedError,
  readClaimBlob, writeTombstone, postReleaseComment, removeLabel, releaseClaim,
  GRANT_LABELS, IN_PROGRESS_LABEL,
};
