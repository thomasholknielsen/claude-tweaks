'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { attemptFailedCommentBody, countFailedAttempts, hasHitRetryCeiling } = require('../retry');

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
