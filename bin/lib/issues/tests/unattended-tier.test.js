'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { clearsFloor } = require('../unattended-tier');

test('clearsFloor returns true for an external-state blocker', () => {
  assert.strictEqual(
    clearsFloor('Requires external state (third-party API data) before this can be fixed'),
    true,
  );
});

test('clearsFloor returns true for a product/design-decision blocker', () => {
  assert.strictEqual(
    clearsFloor('Needs a product decision on the rate-limit value'),
    true,
  );
});

test('clearsFloor returns true for a not-yet-built-dependency blocker', () => {
  assert.strictEqual(
    clearsFloor('Depends on functionality not yet built in this pipeline (the /auth refresh endpoint)'),
    true,
  );
});

test('clearsFloor returns true for a scope-expansion blocker', () => {
  assert.strictEqual(
    clearsFloor('Would expand scope -- breaks 14 unrelated tests'),
    true,
  );
});

// Regression tests for the line-by-line finding: the digit count must exceed
// resolve-gate.md's own '>10 unrelated tests' threshold, not merely be present.
// These deliberately avoid the standalone "expand(s) scope" phrasing (its own
// CATEGORY_PATTERNS entry) so only the digit-count check is exercised.
test('clearsFloor returns false for a test-break count below the >10 threshold', () => {
  assert.strictEqual(
    clearsFloor('This fix breaks 2 unrelated tests'),
    false,
  );
});

test('clearsFloor returns false at exactly 10 unrelated tests (threshold is strictly >10)', () => {
  assert.strictEqual(
    clearsFloor('This fix breaks 10 unrelated tests'),
    false,
  );
});

test('clearsFloor returns true at 11 unrelated tests (just over the >10 threshold)', () => {
  assert.strictEqual(
    clearsFloor('This fix breaks 11 unrelated tests'),
    true,
  );
});

test('clearsFloor returns true for "more than 10 unrelated tests" wording', () => {
  assert.strictEqual(
    clearsFloor('This fix breaks more than 10 unrelated tests'),
    true,
  );
});

test('clearsFloor is case-insensitive', () => {
  assert.strictEqual(clearsFloor('REQUIRES EXTERNAL STATE to proceed'), true);
});

test('clearsFloor returns false for an ambiguous or unrecognized reason', () => {
  assert.strictEqual(clearsFloor('Not sure if this is even still relevant'), false);
});

test('clearsFloor returns false for an empty string', () => {
  assert.strictEqual(clearsFloor(''), false);
});

test('clearsFloor returns false for a non-string input', () => {
  assert.strictEqual(clearsFloor(undefined), false);
});

test('clearsFloor returns false for a whitespace-only string', () => {
  assert.strictEqual(clearsFloor('   '), false);
});

test('clearsFloor returns true for a third-party-dependency blocker', () => {
  assert.strictEqual(
    clearsFloor('Blocked on a third-party vendor shipping their webhook payload format'),
    true,
  );
});

test('clearsFloor returns true for a singular "approval" blocker', () => {
  assert.strictEqual(
    clearsFloor('Requires stakeholder approval before proceeding'),
    true,
  );
});

test('clearsFloor returns true for a plural "approvals" blocker (resolve-gate.md\'s own wording)', () => {
  assert.strictEqual(
    clearsFloor('Requires stakeholder approvals before proceeding'),
    true,
  );
});
