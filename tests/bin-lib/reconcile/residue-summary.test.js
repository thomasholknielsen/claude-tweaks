'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatReconcileSummary, archivedCountFromRunsResult, humanAge, mirrorFfPart } = require('../../../plugin/bin/lib/reconcile/residue-summary');
const { recordResidueFailure } = require('../../../plugin/bin/lib/reconcile/cache');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-residue-summary-'));
}

test('archivedCountFromRunsResult: counts only action:archived entries; tolerates a missing/non-array runs', () => {
  assert.equal(archivedCountFromRunsResult({ runs: [{ action: 'archived' }, { action: 'skipped' }, { action: 'archived' }] }), 2);
  assert.equal(archivedCountFromRunsResult({ runs: [] }), 0);
  assert.equal(archivedCountFromRunsResult({}), 0);
  assert.equal(archivedCountFromRunsResult(null), 0);
});

test('humanAge: renders days, then hours, then minutes, in that precedence', () => {
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  assert.equal(humanAge(7 * day), '7d');
  assert.equal(humanAge(3 * hour), '3h');
  assert.equal(humanAge(5 * 60 * 1000), '5m');
  assert.equal(humanAge(0), '0m');
});

test('mirrorFfPart: the issue\'s own worked example — a dirty tree reads as "declined — dirty"', () => {
  assert.equal(mirrorFfPart({ state: 'dirty', action: 'none', reason: 'dirty' }), 'declined — dirty');
});

test('mirrorFfPart: a successful fast-forward and an already-current tree both read as "ok"', () => {
  assert.equal(mirrorFfPart({ state: 'behind', action: 'fast-forwarded' }), 'ok');
  assert.equal(mirrorFfPart({ state: 'current', action: 'none' }), 'ok');
});

test('mirrorFfPart: no mirror data at all reads as "n/a"', () => {
  assert.equal(mirrorFfPart(null), 'n/a');
  assert.equal(mirrorFfPart(undefined), 'n/a');
});

test('formatReconcileSummary: the issue\'s own worked example, end to end', () => {
  const root = tmpRoot();
  const now = 1000 * 60 * 60 * 24 * 30; // an arbitrary "now"
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < 3; i++) recordResidueFailure(root, 'move-failed', `/x/run-${i}`, { now: oneWeekAgo });
  const line = formatReconcileSummary(root, { archivedCount: 1, mirror: { state: 'dirty', action: 'none', reason: 'dirty' } }, now);
  assert.equal(line, 'reconcile: 1 archived, 3 stuck (oldest 7d), mirror ff declined — dirty');
});

test('formatReconcileSummary: nothing stuck omits the age parenthetical', () => {
  const root = tmpRoot();
  const line = formatReconcileSummary(root, { archivedCount: 0, mirror: null });
  assert.equal(line, 'reconcile: 0 archived, 0 stuck, mirror ff n/a');
});

test('formatReconcileSummary: oldest is the earliest firstFailedAt across every tracked entry, not the latest', () => {
  const root = tmpRoot();
  const now = 10_000_000;
  recordResidueFailure(root, 'move-failed', '/x/old', { now: now - 5 * 24 * 60 * 60 * 1000 });
  recordResidueFailure(root, 'removal-failed', '/x/new', { now: now - 1 * 24 * 60 * 60 * 1000 });
  const line = formatReconcileSummary(root, { archivedCount: 0, mirror: null }, now);
  assert.equal(line, 'reconcile: 0 archived, 2 stuck (oldest 5d), mirror ff n/a');
});
