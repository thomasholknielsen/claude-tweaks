'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  failurePath, readFailedModels, recordFailure,
} = require('../../../plugin/bin/lib/model-profiles/session-failures');

function cleanup(sessionId) {
  const p = failurePath(sessionId);
  if (p) { try { fs.unlinkSync(p); } catch { /* already absent */ } }
}

test('failurePath is null for a missing/blank session id, a real path otherwise', () => {
  assert.strictEqual(failurePath(undefined), null);
  assert.strictEqual(failurePath(''), null);
  assert.strictEqual(failurePath('  '), null);
  assert.strictEqual(failurePath('abc-123'), path.join(os.tmpdir(), 'ct-model-failures-abc-123.json'));
});

test('readFailedModels returns an empty set when no file exists', () => {
  const id = `sf-test-empty-${process.pid}`;
  cleanup(id);
  assert.deepStrictEqual(readFailedModels(id), new Set());
});

test('readFailedModels degrades to an empty set on malformed JSON, never throws', () => {
  const id = `sf-test-malformed-${process.pid}`;
  fs.writeFileSync(failurePath(id), 'not json');
  assert.deepStrictEqual(readFailedModels(id), new Set());
  cleanup(id);
});

test('recordFailure then readFailedModels round-trips one model', () => {
  const id = `sf-test-roundtrip-${process.pid}`;
  cleanup(id);
  recordFailure(id, 'fable');
  assert.deepStrictEqual(readFailedModels(id), new Set(['fable']));
  cleanup(id);
});

test('recordFailure is idempotent — recording the same model twice does not duplicate', () => {
  const id = `sf-test-idempotent-${process.pid}`;
  cleanup(id);
  recordFailure(id, 'fable');
  recordFailure(id, 'fable');
  const raw = JSON.parse(fs.readFileSync(failurePath(id), 'utf8'));
  assert.strictEqual(raw.length, 1);
  cleanup(id);
});

test('recordFailure accumulates distinct models across calls', () => {
  const id = `sf-test-accumulate-${process.pid}`;
  cleanup(id);
  recordFailure(id, 'fable');
  recordFailure(id, 'opus');
  assert.deepStrictEqual(readFailedModels(id), new Set(['fable', 'opus']));
  cleanup(id);
});

test('recordFailure is a no-op with no session id — nothing thrown, no file written', () => {
  assert.doesNotThrow(() => recordFailure(undefined, 'fable'));
  assert.doesNotThrow(() => recordFailure('', 'fable'));
});

// recordFailure's atomic-write guarantee (#763 final-review fix): a
// concurrent readFailedModels must never observe a torn/truncated write.
// Proving this without real concurrency: spy on fs.writeFileSync/renameSync
// and assert recordFailure only ever writes to a same-directory temp path
// and only reaches the real path via rename — never a direct write to `p`,
// which is the one operation that could leave a reader mid-truncation.
test('recordFailure writes via a temp file + atomic rename, never a direct write to the real path', () => {
  const id = `sf-test-atomic-${process.pid}`;
  cleanup(id);
  const p = failurePath(id);
  const realWriteFileSync = fs.writeFileSync;
  const realRenameSync = fs.renameSync;
  const writeCalls = [];
  const renameCalls = [];
  const writeSpy = mock.method(fs, 'writeFileSync', (target, ...rest) => {
    writeCalls.push(target);
    return realWriteFileSync.call(fs, target, ...rest);
  });
  const renameSpy = mock.method(fs, 'renameSync', (from, to) => {
    renameCalls.push([from, to]);
    return realRenameSync.call(fs, from, to);
  });
  try {
    recordFailure(id, 'fable');
  } finally {
    writeSpy.mock.restore();
    renameSpy.mock.restore();
  }
  assert.ok(!writeCalls.includes(p), 'writeFileSync must never target the real path directly');
  assert.strictEqual(writeCalls.length, 1);
  assert.strictEqual(writeCalls[0], `${p}.${process.pid}.tmp`);
  assert.strictEqual(renameCalls.length, 1);
  assert.deepStrictEqual(renameCalls[0], [`${p}.${process.pid}.tmp`, p]);
  // The rename happened for real — the real path now holds the recorded model,
  // and no leftover temp file remains.
  assert.deepStrictEqual(readFailedModels(id), new Set(['fable']));
  assert.ok(!fs.existsSync(`${p}.${process.pid}.tmp`));
  cleanup(id);
});

test('two session ids never share a file', () => {
  const idA = `sf-test-a-${process.pid}`;
  const idB = `sf-test-b-${process.pid}`;
  cleanup(idA);
  cleanup(idB);
  recordFailure(idA, 'fable');
  assert.deepStrictEqual(readFailedModels(idB), new Set());
  cleanup(idA);
  cleanup(idB);
});
