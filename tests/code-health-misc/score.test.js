'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { MAX_STALE_DAYS } = require('../../plugin/bin/lib/code-health/score');

test('MAX_STALE_DAYS is exported and positive', () => {
  assert.ok(MAX_STALE_DAYS > 0);
});
