'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireLock, releaseLock, withLock } = require('../../plugin/bin/lib/file-lock');

function tmpLock() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-lock-'));
  return path.join(dir, 'x.lock');
}

test('acquireLock/releaseLock: acquire succeeds once, fails while held, succeeds again after release', () => {
  const lock = tmpLock();
  assert.equal(acquireLock(lock), true);
  assert.equal(acquireLock(lock, { waitMs: 50 }), false);
  releaseLock(lock);
  assert.equal(acquireLock(lock), true);
  releaseLock(lock);
});

test('acquireLock: reclaims a lock older than staleMs', () => {
  const lock = tmpLock();
  fs.mkdirSync(lock);
  const old = Date.now() - 10_000;
  fs.utimesSync(lock, old / 1000, old / 1000);
  assert.equal(acquireLock(lock, { waitMs: 200, staleMs: 100 }), true);
  releaseLock(lock);
});

test('withLock: runs fn while holding the lock and releases it after (sync fn)', () => {
  const lock = tmpLock();
  let ranWhileHeld = false;
  const result = withLock(lock, () => {
    ranWhileHeld = fs.existsSync(lock);
    return 'ok';
  });
  assert.equal(ranWhileHeld, true);
  assert.equal(result, 'ok');
  assert.equal(fs.existsSync(lock), false);
});

test('withLock: releases the lock after an async fn resolves', async () => {
  const lock = tmpLock();
  const result = await withLock(lock, async () => {
    await new Promise((r) => setImmediate(r));
    return 'done';
  });
  assert.equal(result, 'done');
  assert.equal(fs.existsSync(lock), false);
});

test('withLock: releases the lock when fn throws, and rethrows', () => {
  const lock = tmpLock();
  assert.throws(() => withLock(lock, () => { throw new Error('boom'); }), /boom/);
  assert.equal(fs.existsSync(lock), false);
});

test('withLock: default is fail-open — fn still runs unlocked when the lock cannot be acquired', () => {
  const lock = tmpLock();
  fs.mkdirSync(lock); // pre-held by "someone else", fresh (not stale)
  let ran = false;
  withLock(lock, () => { ran = true; }, { waitMs: 30 });
  assert.equal(ran, true);
  fs.rmdirSync(lock);
});

test('withLock: failClosed throws LOCK_TIMEOUT instead of running fn', () => {
  const lock = tmpLock();
  fs.mkdirSync(lock);
  let ran = false;
  assert.throws(
    () => withLock(lock, () => { ran = true; }, { waitMs: 30, failClosed: true }),
    (err) => err.code === 'LOCK_TIMEOUT',
  );
  assert.equal(ran, false);
  fs.rmdirSync(lock);
});
