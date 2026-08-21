'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readCache, writeCache, isFresh, CACHE_FILENAME, DEFAULT_TTL_MS,
  RESIDUE_ESCALATE_THRESHOLD, recordResidueFailure, recordResidueSuccess, listResidueFailures,
} = require('../../../plugin/bin/lib/reconcile/cache');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-cache-'));
}

test('readCache: absent file reads as empty defaults, not a throw', () => {
  const root = tmpRoot();
  assert.deepEqual(readCache(root), { lastRunAt: null, claimShas: {}, residueFailures: {} });
});

test('readCache: corrupt JSON fails closed to empty defaults, not a throw', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', CACHE_FILENAME), '{not json');
  assert.deepEqual(readCache(root), { lastRunAt: null, claimShas: {}, residueFailures: {} });
});

test('writeCache then readCache round-trips', () => {
  const root = tmpRoot();
  writeCache(root, { lastRunAt: 12345, claimShas: { 7: 'abc' }, residueFailures: {} });
  assert.deepEqual(readCache(root), { lastRunAt: 12345, claimShas: { 7: 'abc' }, residueFailures: {} });
});

test('writeCache: a failure (unwritable dir) is swallowed, never throws', () => {
  const root = '/nonexistent-does-not-exist-820';
  assert.doesNotThrow(() => writeCache(root, { lastRunAt: 1, claimShas: {} }));
});

test('isFresh: within TTL is fresh', () => {
  assert.equal(isFresh({ lastRunAt: 1000 }, 1000 + DEFAULT_TTL_MS - 1, DEFAULT_TTL_MS), true);
});

test('isFresh: past TTL is not fresh', () => {
  assert.equal(isFresh({ lastRunAt: 1000 }, 1000 + DEFAULT_TTL_MS + 1, DEFAULT_TTL_MS), false);
});

test('isFresh: null lastRunAt (never run) is never fresh', () => {
  assert.equal(isFresh({ lastRunAt: null }, Date.now(), DEFAULT_TTL_MS), false);
});

// #644 Deliverable 2 — per-path consecutive-failure counter + escalation.
test('recordResidueFailure: does not escalate before the threshold', () => {
  const root = tmpRoot();
  for (let i = 1; i < RESIDUE_ESCALATE_THRESHOLD; i++) {
    const r = recordResidueFailure(root, 'move-failed', '/x/run-1', { now: 1000 + i });
    assert.equal(r.count, i);
    assert.equal(r.shouldEscalate, false, `call ${i} must not escalate yet`);
  }
});

test('recordResidueFailure: escalates exactly once, on the threshold-th call, never again while still failing', () => {
  const root = tmpRoot();
  let last;
  for (let i = 1; i <= RESIDUE_ESCALATE_THRESHOLD + 3; i++) {
    last = recordResidueFailure(root, 'removal-failed', '/x/wt-1', { now: 2000 + i });
    if (i < RESIDUE_ESCALATE_THRESHOLD) assert.equal(last.shouldEscalate, false);
    else if (i === RESIDUE_ESCALATE_THRESHOLD) assert.equal(last.shouldEscalate, true, 'must escalate on the threshold-th call');
    else assert.equal(last.shouldEscalate, false, `call ${i} (past threshold) must not re-escalate`);
  }
  assert.equal(last.count, RESIDUE_ESCALATE_THRESHOLD + 3);
});

test('recordResidueSuccess: resets the counter to zero — a later failure starts a fresh streak (and can re-escalate)', () => {
  const root = tmpRoot();
  for (let i = 0; i < RESIDUE_ESCALATE_THRESHOLD; i++) recordResidueFailure(root, 'move-failed', '/x/run-2', { now: 3000 + i });
  recordResidueSuccess(root, 'move-failed', '/x/run-2');
  assert.deepEqual(listResidueFailures(root), []);

  const afterReset = recordResidueFailure(root, 'move-failed', '/x/run-2', { now: 9000 });
  assert.equal(afterReset.count, 1);
  assert.equal(afterReset.shouldEscalate, false);

  // afterReset already used up the 1st of RESIDUE_ESCALATE_THRESHOLD
  // failures needed to re-escalate — (threshold - 2) more calls land just
  // short of the threshold, and the final call is the threshold-th.
  for (let i = 0; i < RESIDUE_ESCALATE_THRESHOLD - 2; i++) {
    const r = recordResidueFailure(root, 'move-failed', '/x/run-2', { now: 9000 + i + 1 });
    assert.equal(r.shouldEscalate, false, `pre-threshold call ${i} must not escalate`);
  }
  const reEscalated = recordResidueFailure(root, 'move-failed', '/x/run-2', { now: 9999 });
  assert.equal(reEscalated.count, RESIDUE_ESCALATE_THRESHOLD);
  assert.equal(reEscalated.shouldEscalate, true, 're-failing after a success must be able to escalate again');
});

test('recordResidueSuccess: a no-op on a path with no tracked failure never throws', () => {
  const root = tmpRoot();
  assert.doesNotThrow(() => recordResidueSuccess(root, 'move-failed', '/never/failed'));
});

test('listResidueFailures: splits the composite key back into reason and path', () => {
  const root = tmpRoot();
  recordResidueFailure(root, 'move-failed', '/x/run-3', { now: 1 });
  const [entry] = listResidueFailures(root);
  assert.equal(entry.reason, 'move-failed');
  assert.equal(entry.path, '/x/run-3');
  assert.equal(entry.count, 1);
  assert.equal(entry.firstFailedAt, 1);
});

test('recordResidueFailure: independent counters for the same path under different reasons', () => {
  const root = tmpRoot();
  recordResidueFailure(root, 'move-failed', '/x/shared', { now: 1 });
  recordResidueFailure(root, 'removal-failed', '/x/shared', { now: 1 });
  const entries = listResidueFailures(root);
  assert.equal(entries.length, 2);
});
