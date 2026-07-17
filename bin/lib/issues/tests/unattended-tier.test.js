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
