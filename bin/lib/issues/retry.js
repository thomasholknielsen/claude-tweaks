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

// `comments` must be the set of failure comments already posted BEFORE the
// attempt currently being evaluated — i.e. NOT including that attempt's own
// not-yet-posted comment (this mirrors skills/dispatch/SKILL.md's Settle-step
// fetch order: fetch comments, decide, then post). Returns whether the attempt
// currently being evaluated (attemptNumber = countFailedAttempts(comments) + 1)
// is at or past the ceiling, equivalent to dispatch's own inline
// `attemptNumber >= ceiling` check. A naive `countFailedAttempts(comments) >=
// ceiling` (comparing only already-posted comments against the ceiling) is off
// by one for this — it stays false through the attempt that IS the
// ceiling-hitting one.
function hasHitRetryCeiling(comments, ceiling = 3) {
  return countFailedAttempts(comments) + 1 >= ceiling;
}

module.exports = { attemptFailedCommentBody, countFailedAttempts, hasHitRetryCeiling };
