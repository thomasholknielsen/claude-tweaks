const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  cachePath, readCache, writeCache,
  cursorsPath, readCursors, writeCursors,
  recordAudit, readGapScanCursor, recordGapScan,
  recordRun, readRuns, computeChurn,
} = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-cache-')); }

test('readCache returns {} when the cache file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCache(root), {});
});

test('writeCache then readCache round-trips', () => {
  const root = tmp();
  writeCache(root, { 'skillhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
  assert.deepStrictEqual(readCache(root), { 'skillhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
});

test('cachePath points under .claude-tweaks/skill-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'skill-health', 'cache.json'));
});

test('readCursors returns {} when the cursors file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCursors(root), {});
});

test('recordAudit writes a per-skill cursor entry', () => {
  const root = tmp();
  recordAudit(root, 'auth', { sha: 'abc123', whenMs: 5000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors.auth, { lastAuditedSha: 'abc123', lastAuditedMs: 5000 });
});

test('recordAudit defaults whenMs to now when omitted', () => {
  const root = tmp();
  const before = Date.now();
  recordAudit(root, 'auth', {});
  const cursors = readCursors(root);
  assert.ok(cursors.auth.lastAuditedMs >= before);
});

test("recordAudit for one skill does not clobber another skill's entry", () => {
  const root = tmp();
  recordAudit(root, 'auth', { sha: 'a1', whenMs: 1000 });
  recordAudit(root, 'billing', { sha: 'b1', whenMs: 2000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors.auth.lastAuditedSha, 'a1');
  assert.strictEqual(cursors.billing.lastAuditedSha, 'b1');
});

test('readGapScanCursor returns nulls when never recorded', () => {
  const root = tmp();
  assert.deepStrictEqual(readGapScanCursor(root), { lastScannedSha: null, lastScannedMs: null });
});

test('recordGapScan then readGapScanCursor round-trips and does not appear in listSkills-relevant keys', () => {
  const root = tmp();
  recordGapScan(root, { sha: 'gap1', whenMs: 9000 });
  assert.deepStrictEqual(readGapScanCursor(root), { lastScannedSha: 'gap1', lastScannedMs: 9000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors.__gapScan.lastScannedSha, 'gap1');
});

test('readRuns returns [] when no run logs exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readRuns(root), []);
});

test('recordRun then readRuns round-trips, sorted oldest first', () => {
  const root = tmp();
  recordRun(root, 'run-2', ['skillhealth-b']);
  recordRun(root, 'run-1', ['skillhealth-a']);
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 2);
  // Sort key is runAt (write order here), not runId — both records get a runAt
  // at write time, so run-2 (written first) sorts first.
  assert.strictEqual(runs[0].runId, 'run-2');
  assert.strictEqual(runs[1].runId, 'run-1');
});

test('computeChurn: no prior run gives ratio 0 for identical sets, appeared for new ones', () => {
  const result = computeChurn(['a', 'b'], null);
  assert.deepStrictEqual(result.appeared, ['a', 'b']);
  assert.deepStrictEqual(result.disappeared, []);
});

test('computeChurn: identical current and prior gives ratio 0', () => {
  const prior = { fingerprints: ['a', 'b'] };
  const result = computeChurn(['a', 'b'], prior);
  assert.strictEqual(result.ratio, 0);
});

test('computeChurn: complete turnover gives ratio 1', () => {
  const prior = { fingerprints: ['a', 'b'] };
  const result = computeChurn(['c', 'd'], prior);
  assert.strictEqual(result.ratio, 1);
});
