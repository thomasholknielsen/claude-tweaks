const { test } = require('node:test');
const assert = require('node:assert');
const { STALE_DAYS_LIGHT, STALE_DAYS_DEEP } = require('../../../plugin/bin/lib/journey-health/score');

test('STALE_DAYS_LIGHT is 30', () => {
  assert.strictEqual(STALE_DAYS_LIGHT, 30);
});

test('STALE_DAYS_DEEP is 90', () => {
  assert.strictEqual(STALE_DAYS_DEEP, 90);
});

test('STALE_DAYS_DEEP is greater than STALE_DAYS_LIGHT (deep tier audits less frequently)', () => {
  assert.ok(STALE_DAYS_DEEP > STALE_DAYS_LIGHT);
});
