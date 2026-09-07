'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCleanupTable, renderCleanupTable } = require('../../../plugin/bin/lib/smoke-test/verify-cleanup');

test('all rows verified absent -> clean', () => {
  const result = verifyCleanupTable([
    { artifact: 'issue #900', claimed: true, verifiedAbsent: true },
    { artifact: 'claim on #900', claimed: true, verifiedAbsent: true },
  ]);
  assert.deepStrictEqual(result, { clean: true, leaked: [] });
});

test('a row claiming success but failing verification is reported as leaked, not clean', () => {
  const rows = [
    { artifact: 'issue #900', claimed: true, verifiedAbsent: true },
    { artifact: 'worktree flow-spec-900-smoke', claimed: true, verifiedAbsent: false },
  ];
  const result = verifyCleanupTable(rows);
  assert.strictEqual(result.clean, false);
  assert.deepStrictEqual(result.leaked, [rows[1]]);
});

test('an artifact never claimed and never verified is still leaked, not silently ignored', () => {
  const rows = [{ artifact: 'claim on #900', claimed: false, verifiedAbsent: false }];
  const result = verifyCleanupTable(rows);
  assert.strictEqual(result.clean, false);
  assert.strictEqual(result.leaked.length, 1);
});

test('an empty run (no artifacts created) is trivially clean', () => {
  assert.deepStrictEqual(verifyCleanupTable([]), { clean: true, leaked: [] });
});

test('renderCleanupTable renders the documented three-column markdown shape', () => {
  const table = renderCleanupTable([{ artifact: 'issue #900', claimed: true, verifiedAbsent: true }]);
  assert.match(table, /^\| Artifact \| Cleanup claimed \| Verified absent \|/);
  assert.match(table, /\| issue #900 \| yes \| yes \|/);
});

test('renderCleanupTable renders the header alone for an empty run', () => {
  const table = renderCleanupTable([]);
  assert.strictEqual(table, '| Artifact | Cleanup claimed | Verified absent |\n|---|---|---|');
});
