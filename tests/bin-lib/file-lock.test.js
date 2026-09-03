'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { acquireLock, releaseLock, withLock } = require('../../plugin/bin/lib/file-lock');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-file-lock-'));
}

test('acquireLock: creates the lock directory and returns its path', () => {
  const dir = tmpDir();
  const lockPath = path.join(dir, '.x.lock');
  const held = acquireLock(lockPath);
  assert.equal(held, lockPath);
  assert.ok(fs.existsSync(lockPath));
});

test('acquireLock: parent directory missing -> creates it and still acquires the lock (#1269 follow-up)', () => {
  // A missing parent is the common case on a brand-new store's first-ever write, not an
  // unexpected failure -- treating it as "nothing to lock" let every concurrent caller skip
  // locking entirely on a fresh project (the declined-learning/store-concurrency.test.js
  // regression this follow-up fixes).
  const lockPath = path.join(tmpDir(), 'nonexistent-subdir', '.x.lock');
  const held = acquireLock(lockPath);
  assert.equal(held, lockPath);
  assert.ok(fs.existsSync(lockPath));
});

test('releaseLock: removes the lock directory; a no-op on null is safe', () => {
  const dir = tmpDir();
  const lockPath = path.join(dir, '.x.lock');
  acquireLock(lockPath);
  releaseLock(lockPath);
  assert.ok(!fs.existsSync(lockPath));
  assert.doesNotThrow(() => releaseLock(null));
});

test('withLock: runs fn while holding the lock, releases it afterward even on throw', () => {
  const dir = tmpDir();
  const lockPath = path.join(dir, '.x.lock');

  const result = withLock(lockPath, () => 'ok');
  assert.equal(result, 'ok');
  assert.ok(!fs.existsSync(lockPath), 'released after a normal return');

  assert.throws(() => withLock(lockPath, () => { throw new Error('boom'); }), /boom/);
  assert.ok(!fs.existsSync(lockPath), 'released even when fn throws');
});

test('withLock: a second acquirer waits for the first to release, under real cross-process concurrency (no lost updates)', async () => {
  // Reproduces the shape declined-learning/store.js's recordDecline relies on: many real OS
  // processes racing a read-modify-write against the same JSON file, each appending its own key.
  // Without the lock, one writer's stale-snapshot write would silently drop another's entry.
  const dir = tmpDir();
  const lockPath = path.join(dir, '.x.lock');
  const dataPath = path.join(dir, 'data.json');
  fs.writeFileSync(dataPath, '{}');

  const WORKERS = 8;
  const fileLockModule = path.join(__dirname, '..', '..', 'plugin', 'bin', 'lib', 'file-lock.js');
  const workerScript = (i) => `
    const fs = require('fs');
    const { withLock } = require(${JSON.stringify(fileLockModule)});
    withLock(${JSON.stringify(lockPath)}, () => {
      const current = JSON.parse(fs.readFileSync(${JSON.stringify(dataPath)}, 'utf8'));
      current['w${i}'] = true;
      fs.writeFileSync(${JSON.stringify(dataPath)}, JSON.stringify(current));
    });
  `;

  const procs = [];
  for (let i = 0; i < WORKERS; i++) {
    procs.push(new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['-e', workerScript(i)], {
        env: { ...process.env, CLAUDE_TWEAKS_LOCK_WAIT_MS: '60000' },
      });
      let stderr = '';
      p.stderr.on('data', (d) => { stderr += d; });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}: ${stderr}`))));
      p.on('error', reject);
    }));
  }
  await Promise.all(procs);

  const final = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  for (let i = 0; i < WORKERS; i++) {
    assert.equal(final[`w${i}`], true, `worker ${i}'s key must not be lost to a concurrent writer's stale snapshot`);
  }
});
