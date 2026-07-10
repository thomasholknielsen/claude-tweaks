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

test('hasHitRetryCeiling is false below the ceiling and true at/above it', () => {
  const twoFailures = [
    { body: 'Attempt 1 failed: a. Claim released, will retry.' },
    { body: 'Attempt 2 failed: b. Claim released, will retry.' },
  ];
  assert.strictEqual(hasHitRetryCeiling(twoFailures, 3), false);
  const threeFailures = [...twoFailures, { body: 'Attempt 3 failed: c. Claim released, will retry.' }];
  assert.strictEqual(hasHitRetryCeiling(threeFailures, 3), true);
});

test('hasHitRetryCeiling defaults the ceiling to 3', () => {
  const threeFailures = [
    { body: 'Attempt 1 failed: a. Claim released, will retry.' },
    { body: 'Attempt 2 failed: b. Claim released, will retry.' },
    { body: 'Attempt 3 failed: c. Claim released, will retry.' },
  ];
  assert.strictEqual(hasHitRetryCeiling(threeFailures), true);
});

test('hasHitRetryCeiling respects a custom ceiling', () => {
  const oneFailure = [{ body: 'Attempt 1 failed: a. Claim released, will retry.' }];
  assert.strictEqual(hasHitRetryCeiling(oneFailure, 1), true);
});
