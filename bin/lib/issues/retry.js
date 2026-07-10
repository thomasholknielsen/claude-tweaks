// Pure: retry-ceiling tracking for /claude-tweaks:triage's dispatch mode.
// Each failed build attempt posts a human-readable comment (never a hidden
// marker) so a maintainer can see exactly what happened on every attempt.
// This module generates that comment body and counts prior attempts from
// an issue's existing comments.
'use strict';

const ATTEMPT_RE = /^Attempt (\d+) failed: /;

function attemptFailedCommentBody({ attemptNumber, reason, ceilingHit }) {
  const closing = ceilingHit
    ? 'Retry ceiling reached — no further automatic retries.'
    : 'Claim released, will retry.';
  return `Attempt ${attemptNumber} failed: ${reason}. ${closing}`;
}

function countFailedAttempts(comments) {
  return (comments || []).filter((c) => ATTEMPT_RE.test((c && c.body) || '')).length;
}

function hasHitRetryCeiling(comments, ceiling = 3) {
  return countFailedAttempts(comments) >= ceiling;
}

module.exports = { attemptFailedCommentBody, countFailedAttempts, hasHitRetryCeiling };
