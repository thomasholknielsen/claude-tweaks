'use strict';
// tests/bin-lib/release-local/hardening.test.js — wrap-up fix wave (#2254,
// deferral-gate fix-now items, run ledger rows 48-53). Every new test the
// wave adds lives here, per the wave's own hard constraint: two staged
// review patches (review-1.patch, review-2.patch) must keep applying, so
// nothing here may touch the regions those patches own in release-local.js,
// cli.test.js, or manifest.js's applyVersion body.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommit } = require('../../../plugin/bin/lib/release-local/commits.js');

// W1 (row 48): an unconventional subject's empty BREAKING CHANGE: footer
// falls back to the subject, same as the conventional path's own fallback.
test('W1: parseCommit — an unconventional subject with an empty BREAKING CHANGE: footer falls back to the subject', () => {
  const out = parseCommit({ sha: 'f'.repeat(40), subject: 'Merge branch x', body: 'BREAKING CHANGE:' });
  assert.strictEqual(out.breaking, true);
  assert.strictEqual(out.breakingNote, 'Merge branch x');
  assert.strictEqual(out.unconventional, true);
});
