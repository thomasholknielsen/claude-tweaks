const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  cachePath, readCache, writeCache,
  cursorsPath, readCursors, writeCursors,
  recordAudit, readCoverageScanCursor, recordCoverageScan,
  recordRun, readRuns, computeChurn,
} = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cache-')); }

test('readCache returns {} when the cache file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCache(root), {});
});

test('writeCache then readCache round-trips', () => {
  const root = tmp();
  writeCache(root, { 'journeyhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
  assert.deepStrictEqual(readCache(root), { 'journeyhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
});

test('cachePath points under .claude-tweaks/journey-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'journey-health', 'cache.json'));
});

test('readCursors returns {} when the cursors file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCursors(root), {});
});

test('recordAudit writes a light-tier cursor entry', () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'light', { hash: 'h1', whenMs: 5000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors['checkout-flow'], { lastLightAuditMs: 5000, lastLightHash: 'h1' });
});

test('recordAudit writes a deep-tier cursor entry', () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'deep', { hash: 'h2', whenMs: 9000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors['checkout-flow'], { lastDeepAuditMs: 9000, lastDeepHash: 'h2' });
});

test('recordAudit for light tier does not clobber an existing deep-tier entry, and vice versa', () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'deep', { hash: 'd1', whenMs: 1000 });
  recordAudit(root, 'checkout-flow', 'light', { hash: 'l1', whenMs: 2000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors['checkout-flow'], {
    lastDeepAuditMs: 1000, lastDeepHash: 'd1',
    lastLightAuditMs: 2000, lastLightHash: 'l1',
  });
});

test("recordAudit for one journey does not clobber another journey's entry", () => {
  const root = tmp();
  recordAudit(root, 'checkout-flow', 'light', { hash: 'a1', whenMs: 1000 });
  recordAudit(root, 'signup-flow', 'light', { hash: 'b1', whenMs: 2000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors['checkout-flow'].lastLightHash, 'a1');
  assert.strictEqual(cursors['signup-flow'].lastLightHash, 'b1');
});

test('recordAudit defaults whenMs to now when omitted', () => {
  const root = tmp();
  const before = Date.now();
  recordAudit(root, 'checkout-flow', 'light', {});
  const cursors = readCursors(root);
  assert.ok(cursors['checkout-flow'].lastLightAuditMs >= before);
});

test('readCoverageScanCursor returns null when never recorded', () => {
  const root = tmp();
  assert.deepStrictEqual(readCoverageScanCursor(root), { lastScannedMs: null });
});

test('recordCoverageScan then readCoverageScanCursor round-trips and does not appear in per-journey keys', () => {
  const root = tmp();
  recordCoverageScan(root, { whenMs: 9000 });
  assert.deepStrictEqual(readCoverageScanCursor(root), { lastScannedMs: 9000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors.__coverageScan.lastScannedMs, 9000);
});

test('readRuns returns [] when no run logs exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readRuns(root), []);
});

test('recordRun then readRuns round-trips, sorted oldest first', () => {
  const root = tmp();
  recordRun(root, 'run-2', ['journeyhealth-b']);
  const start = Date.now();
  while (Date.now() === start) { /* spin past this millisecond */ }
  recordRun(root, 'run-1', ['journeyhealth-a']);
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].runId, 'run-2');
  assert.strictEqual(runs[1].runId, 'run-1');
});

test('computeChurn: no prior run treats every fingerprint as appeared, giving ratio 1', () => {
  const result = computeChurn(['a', 'b'], null);
  assert.deepStrictEqual(result.appeared, ['a', 'b']);
  assert.deepStrictEqual(result.disappeared, []);
  assert.strictEqual(result.ratio, 1);
});

test('computeChurn: identical current and prior gives ratio 0', () => {
  const prior = { fingerprints: ['a', 'b'] };
  const result = computeChurn(['a', 'b'], prior);
  assert.strictEqual(result.ratio, 0);
});
