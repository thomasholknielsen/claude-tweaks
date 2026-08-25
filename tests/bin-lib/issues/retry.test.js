'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  attemptFailedCommentBody, countFailedAttempts, hasHitRetryCeiling, hasNegativeEvidenceMarker,
  extractNegativeEvidenceMarker,
} = require('../../../plugin/bin/lib/issues/retry');

test('attemptFailedCommentBody formats the human-readable retry comment', () => {
  const body = attemptFailedCommentBody({ attemptNumber: 2, reason: 'test gate failed (3 type errors)' });
  assert.strictEqual(body, 'Attempt 2 failed: test gate failed (3 type errors). Claim released, will retry.');
});

test('attemptFailedCommentBody varies its closing line when the ceiling was hit', () => {
  const body = attemptFailedCommentBody({ attemptNumber: 3, reason: 'test gate failed', ceilingHit: true });
  assert.strictEqual(body, 'Attempt 3 failed: test gate failed. Retry ceiling reached — no further automatic retries.');
});

test('countFailedAttempts counts only matching comments', () => {
  const comments = [
    { body: 'Attempt 1 failed: build error. Claim released, will retry.' },
    { body: 'Some unrelated comment' },
    { body: 'Attempt 2 failed: test gate failed. Claim released, will retry.' },
  ];
  assert.strictEqual(countFailedAttempts(comments), 2);
});

test('countFailedAttempts returns 0 for no comments or no matches', () => {
  assert.strictEqual(countFailedAttempts([]), 0);
  assert.strictEqual(countFailedAttempts(undefined), 0);
  assert.strictEqual(countFailedAttempts([{ body: 'unrelated' }]), 0);
});

test('hasHitRetryCeiling is false while the attempt being evaluated is still below the ceiling', () => {
  const oneFailure = [{ body: 'Attempt 1 failed: a. Claim released, will retry.' }];
  // comments reflects only the prior (posted) attempt — the attempt being
  // evaluated is #2, which is below a ceiling of 3.
  assert.strictEqual(hasHitRetryCeiling(oneFailure, 3), false);
});

test('hasHitRetryCeiling is true once the attempt being evaluated reaches the ceiling', () => {
  const twoFailures = [
    { body: 'Attempt 1 failed: a. Claim released, will retry.' },
    { body: 'Attempt 2 failed: b. Claim released, will retry.' },
  ];
  // comments reflects the 2 prior (posted) attempts — the attempt being
  // evaluated is #3, which equals a ceiling of 3.
  assert.strictEqual(hasHitRetryCeiling(twoFailures, 3), true);
});

test('hasHitRetryCeiling defaults the ceiling to 3', () => {
  const twoFailures = [
    { body: 'Attempt 1 failed: a. Claim released, will retry.' },
    { body: 'Attempt 2 failed: b. Claim released, will retry.' },
  ];
  assert.strictEqual(hasHitRetryCeiling(twoFailures), true);
});

test('hasHitRetryCeiling respects a custom ceiling', () => {
  // No prior comments — the attempt being evaluated is #1, which already
  // equals a ceiling of 1 (no retries permitted after the first attempt).
  assert.strictEqual(hasHitRetryCeiling([], 1), true);
  assert.strictEqual(hasHitRetryCeiling([], 3), false);
});

// Regression test for the off-by-one finding: hasHitRetryCeiling must agree
// with skills/dispatch/SKILL.md's inline `attemptNumber >= ceiling` check
// (Settle step) when given the same comments fetched before this attempt's
// own comment is posted — the exact failure_scenario the finding describes.
test('hasHitRetryCeiling matches the attemptNumber >= ceiling formula dispatch/SKILL.md inlines', () => {
  const comments = [
    { body: 'Attempt 1 failed: a. Claim released, will retry.' },
    { body: 'Attempt 2 failed: b. Claim released, will retry.' },
  ];
  const ceiling = 3;
  const attemptNumber = countFailedAttempts(comments) + 1;
  assert.strictEqual(attemptNumber, 3);
  assert.strictEqual(hasHitRetryCeiling(comments, ceiling), attemptNumber >= ceiling);
  assert.strictEqual(hasHitRetryCeiling(comments, ceiling), true);
});

// #779: reproduces #418's shape — three identical failure attempts — using
// production-shaped comment bodies (attemptFailedCommentBody's own output,
// not a hand-typed string) sourced from wherever settle-and-merge.md Step 6
// step 4 actually fetches them (the PR's own comments under `pr-first`, the
// issue's under `local-merge` — never a mix of both within one run: the
// comment-source routing in `_shared/pr-run-comments.md` picks exactly one
// source per run, so a real Settle invocation never hands this function a
// split-source list to begin with — see that file's Anti-Patterns table).
// Because countFailedAttempts/hasHitRetryCeiling only ever see the single
// comment set their caller fetched, they correctly count all three attempts
// and fire the ceiling at attempt 3 regardless of whether that source was
// the issue or a linked PR.
test('#779: three attempts landing on the same pr-first source (the PR) still fire the ceiling at attempt 3', () => {
  const comments = [
    { body: attemptFailedCommentBody({ attemptNumber: 1, reason: 'x', ceilingHit: false }) },
    { body: attemptFailedCommentBody({ attemptNumber: 2, reason: 'x', ceilingHit: false }) },
  ];
  const ceiling = 3;
  const attemptNumber = countFailedAttempts(comments) + 1;
  assert.strictEqual(attemptNumber, 3);
  assert.strictEqual(hasHitRetryCeiling(comments, ceiling), true);
});

// --- Negative-evidence marker (#268) ---------------------------------------

test('attemptFailedCommentBody embeds the negative-evidence marker for a correctness classification', () => {
  const body = attemptFailedCommentBody({
    attemptNumber: 1, reason: 'wrong output shape', classification: 'correctness',
  });
  assert.match(body, /^Attempt 1 failed: wrong output shape\. Claim released, will retry\./);
  assert.match(body, /<!-- trust-negative-evidence: attempt=1 classification=correctness -->$/);
});

test('attemptFailedCommentBody embeds the marker for an ambiguous classification too', () => {
  const body = attemptFailedCommentBody({
    attemptNumber: 2, reason: 'unclear failure', classification: 'ambiguous', ceilingHit: true,
  });
  assert.match(body, /<!-- trust-negative-evidence: attempt=2 classification=ambiguous -->$/);
});

test('attemptFailedCommentBody writes no marker for a transient classification', () => {
  const body = attemptFailedCommentBody({
    attemptNumber: 1, reason: 'CI runner timed out', classification: 'transient',
  });
  assert.strictEqual(body, 'Attempt 1 failed: CI runner timed out. Claim released, will retry.');
  assert.doesNotMatch(body, /trust-negative-evidence/);
});

test('attemptFailedCommentBody writes no marker when classification is omitted (pre-#268 callers)', () => {
  const body = attemptFailedCommentBody({ attemptNumber: 1, reason: 'build error' });
  assert.doesNotMatch(body, /trust-negative-evidence/);
});

test('hasNegativeEvidenceMarker reads a correctness marker back from comments', () => {
  const comments = [{ body: attemptFailedCommentBody({ attemptNumber: 1, reason: 'x', classification: 'correctness' }) }];
  assert.strictEqual(hasNegativeEvidenceMarker(comments), true);
});

test('hasNegativeEvidenceMarker reads an ambiguous marker back from comments', () => {
  const comments = [{ body: attemptFailedCommentBody({ attemptNumber: 1, reason: 'x', classification: 'ambiguous' }) }];
  assert.strictEqual(hasNegativeEvidenceMarker(comments), true);
});

test('hasNegativeEvidenceMarker is false for a transient-classified comment', () => {
  const comments = [{ body: attemptFailedCommentBody({ attemptNumber: 1, reason: 'x', classification: 'transient' }) }];
  assert.strictEqual(hasNegativeEvidenceMarker(comments), false);
});

test('hasNegativeEvidenceMarker is false with no comments, undefined, or unrelated comments', () => {
  assert.strictEqual(hasNegativeEvidenceMarker([]), false);
  assert.strictEqual(hasNegativeEvidenceMarker(undefined), false);
  assert.strictEqual(hasNegativeEvidenceMarker([{ body: 'unrelated' }]), false);
});

test('idempotency: two failed attempts on the same record still read as present (not counted)', () => {
  // AC4: settle can run more than once for the same record (retry ceiling) —
  // the reading side is presence-only, so N markers never inflate a count.
  const comments = [
    { body: attemptFailedCommentBody({ attemptNumber: 1, reason: 'a', classification: 'correctness' }) },
    { body: attemptFailedCommentBody({ attemptNumber: 2, reason: 'b', classification: 'ambiguous' }) },
  ];
  assert.strictEqual(hasNegativeEvidenceMarker(comments), true);
});

// #410: under pr-first the full comment moves to the PR; trust.js still needs
// just the marker line on the issue, extracted from that same comment body.
test('extractNegativeEvidenceMarker returns just the marker line for a correctness/ambiguous comment', () => {
  const body = attemptFailedCommentBody({ attemptNumber: 2, reason: 'test gate failed', classification: 'correctness' });
  assert.strictEqual(extractNegativeEvidenceMarker(body), '<!-- trust-negative-evidence: attempt=2 classification=correctness -->');
});

test('extractNegativeEvidenceMarker returns null for a transient comment or unrelated text', () => {
  const transient = attemptFailedCommentBody({ attemptNumber: 1, reason: 'x', classification: 'transient' });
  assert.strictEqual(extractNegativeEvidenceMarker(transient), null);
  assert.strictEqual(extractNegativeEvidenceMarker('unrelated'), null);
  assert.strictEqual(extractNegativeEvidenceMarker(undefined), null);
});
