'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readCache, writeCache, isFresh, checksSignature, isChecksFresh, recordChecksRun, CACHE_FILENAME, DEFAULT_TTL_MS,
  RESIDUE_ESCALATE_THRESHOLD, recordResidueFailure, recordResidueSuccess, listResidueFailures,
  trackResidue,
} = require('../../../plugin/bin/lib/reconcile/cache');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-cache-'));
}

test('readCache: absent file reads as empty defaults, not a throw', () => {
  const root = tmpRoot();
  assert.deepEqual(readCache(root), { lastRunAt: {}, claimShas: {}, residueFailures: {} });
});

test('readCache: corrupt JSON fails closed to empty defaults, not a throw', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', CACHE_FILENAME), '{not json');
  assert.deepEqual(readCache(root), { lastRunAt: {}, claimShas: {}, residueFailures: {} });
});

// #873: a legacy cache file written before lastRunAt became a per-checks-
// subset map carries it as a bare number — that shape must be rejected back
// to the empty default rather than misread as a signature map.
test('readCache: a legacy scalar lastRunAt (pre-#873 shape) falls back to the empty map default', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', CACHE_FILENAME), JSON.stringify({ lastRunAt: 12345, claimShas: {} }));
  assert.deepEqual(readCache(root), { lastRunAt: {}, claimShas: {}, residueFailures: {} });
});

test('writeCache then readCache round-trips', () => {
  const root = tmpRoot();
  writeCache(root, { lastRunAt: { mirror: 12345 }, claimShas: { 7: 'abc' }, residueFailures: {} });
  assert.deepEqual(readCache(root), { lastRunAt: { mirror: 12345 }, claimShas: { 7: 'abc' }, residueFailures: {} });
});

test('writeCache: a failure (unwritable dir) is swallowed, never throws', () => {
  const root = '/nonexistent-does-not-exist-820';
  assert.doesNotThrow(() => writeCache(root, { lastRunAt: { mirror: 1 }, claimShas: {} }));
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

// --- #873: per-checks-subset freshness (checksSignature / isChecksFresh / recordChecksRun) ---

test('checksSignature: order-independent — same members in a different order share one signature', () => {
  assert.equal(checksSignature(['mirror', 'red-tip', 'console']), checksSignature(['console', 'mirror', 'red-tip']));
});

test('checksSignature: different subsets produce different signatures', () => {
  assert.notEqual(checksSignature(['mirror']), checksSignature(['archive', 'release']));
});

test('checksSignature: empty/missing checks signature to the empty string', () => {
  assert.equal(checksSignature([]), '');
  assert.equal(checksSignature(undefined), '');
});

test('isChecksFresh: fresh when THIS subset\'s own stamp is within TTL', () => {
  const cache = { lastRunAt: { mirror: 1000 } };
  assert.equal(isChecksFresh(cache, ['mirror'], 1000 + DEFAULT_TTL_MS - 1, DEFAULT_TTL_MS), true);
});

test('isChecksFresh: stale when THIS subset\'s own stamp is past TTL', () => {
  const cache = { lastRunAt: { mirror: 1000 } };
  assert.equal(isChecksFresh(cache, ['mirror'], 1000 + DEFAULT_TTL_MS + 1, DEFAULT_TTL_MS), false);
});

// The #820 Task 10 regression shape, reproduced against the new map: a
// DIFFERENT checks subset's fresh stamp must never satisfy this subset's own
// freshness check — this is the exact cross-subset collision the reverted
// single-scalar fix hit (background checks silently starved by a
// FAST_CHECKS-only stamp, and vice versa).
test('isChecksFresh: never fresh from a DIFFERENT checks subset\'s stamp (#820 regression shape)', () => {
  const cache = { lastRunAt: { mirror: Date.now() } };
  assert.equal(isChecksFresh(cache, ['archive', 'release'], Date.now(), DEFAULT_TTL_MS), false);
});

test('isChecksFresh: never fresh with no stamp recorded for this subset at all', () => {
  assert.equal(isChecksFresh({ lastRunAt: {} }, ['mirror'], Date.now(), DEFAULT_TTL_MS), false);
});

test('isChecksFresh: empty checks is never fresh, regardless of cache contents', () => {
  assert.equal(isChecksFresh({ lastRunAt: { '': Date.now() } }, [], Date.now(), DEFAULT_TTL_MS), false);
});

test('recordChecksRun: stamps only this subset\'s own signature, leaving others untouched', () => {
  const root = tmpRoot();
  recordChecksRun(root, ['archive', 'release'], 5000);
  recordChecksRun(root, ['mirror'], 6000);
  const after = readCache(root);
  assert.deepEqual(after.lastRunAt, { 'archive,release': 5000, mirror: 6000 });
});

test('recordChecksRun: a later stamp for the same subset overwrites only that subset\'s entry', () => {
  const root = tmpRoot();
  recordChecksRun(root, ['mirror'], 1000);
  recordChecksRun(root, ['archive', 'release'], 2000);
  recordChecksRun(root, ['mirror'], 3000);
  const after = readCache(root);
  assert.deepEqual(after.lastRunAt, { mirror: 3000, 'archive,release': 2000 });
});

test('recordChecksRun: a no-op for empty checks', () => {
  const root = tmpRoot();
  recordChecksRun(root, [], 1000);
  assert.deepEqual(readCache(root).lastRunAt, {});
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

// #1233 — trackResidue is the shared success/fail branch-into-cache-helpers
// helper both reap-merged.js's trackReapResidue and archive-merged.js's
// trackArchiveResult now call instead of duplicating it. Covers escalate-on-
// threshold behavior for both reason strings the two call sites use.
test('trackResidue: escalates exactly once at the threshold via an injected escalate, never on later still-failing calls (removal-failed)', () => {
  const root = tmpRoot();
  const calls = [];
  const escalate = (args) => { calls.push(args); return { status: 'filed', number: 1 }; };

  for (let i = 0; i < RESIDUE_ESCALATE_THRESHOLD; i++) {
    trackResidue(root, 'o/r', 'removal-failed', '/x/wt', { failed: true, lastError: 'x' }, { escalate });
  }
  assert.equal(calls.length, 1, `expected exactly one escalation call, got ${calls.length}`);
  assert.equal(calls[0].reason, 'removal-failed');
  assert.equal(calls[0].targetPath, '/x/wt');
  assert.equal(calls[0].count, RESIDUE_ESCALATE_THRESHOLD);

  trackResidue(root, 'o/r', 'removal-failed', '/x/wt', { failed: true, lastError: 'x' }, { escalate });
  assert.equal(calls.length, 1, 'must not re-escalate on a later still-failing call');
});

test('trackResidue: escalates exactly once at the threshold via an injected escalate, never on later still-failing calls (move-failed)', () => {
  const root = tmpRoot();
  const calls = [];
  const escalate = (args) => { calls.push(args); return { status: 'filed', number: 1 }; };
  const dir = path.join(root, '.claude-tweaks', 'pipelines', '2026-01-01T000000-stuck');

  for (let i = 0; i < RESIDUE_ESCALATE_THRESHOLD; i++) {
    trackResidue(root, 'o/r', 'move-failed', dir, { failed: true, lastError: undefined }, { escalate });
  }
  assert.equal(calls.length, 1, `expected exactly one escalation call, got ${calls.length}`);
  assert.equal(calls[0].reason, 'move-failed');
  assert.equal(calls[0].targetPath, dir);
  assert.equal(calls[0].count, RESIDUE_ESCALATE_THRESHOLD);

  trackResidue(root, 'o/r', 'move-failed', dir, { failed: true, lastError: undefined }, { escalate });
  assert.equal(calls.length, 1, 'must not re-escalate on a later still-failing call');
});

test('trackResidue: a success clears a prior failure streak and never escalates', () => {
  const root = tmpRoot();
  const calls = [];
  const escalate = (args) => { calls.push(args); return { status: 'filed', number: 1 }; };

  trackResidue(root, 'o/r', 'removal-failed', '/x/wt-success', { failed: true, lastError: 'x' }, { escalate });
  assert.equal(listResidueFailures(root).length, 1);

  trackResidue(root, 'o/r', 'removal-failed', '/x/wt-success', { failed: false }, { escalate });
  assert.deepEqual(listResidueFailures(root), []);
  assert.equal(calls.length, 0, 'a success must never escalate');
});

test('trackResidue: never throws when escalate itself throws (best-effort)', () => {
  const root = tmpRoot();
  const escalate = () => { throw new Error('gh not found'); };
  for (let i = 0; i < RESIDUE_ESCALATE_THRESHOLD; i++) {
    assert.doesNotThrow(() => trackResidue(root, 'o/r', 'removal-failed', '/x/wt-throws', { failed: true, lastError: 'x' }, { escalate }));
  }
});
