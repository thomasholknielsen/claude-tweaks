'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'visual-decide.js');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(args) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: err.stdout || '', err: err.stderr || '' };
  }
}

async function stopQuiet(stateDir) {
  try {
    run(['stop', '--state', stateDir]);
  } catch {
    // best-effort cleanup
  }
}

test('AC1: start returns detached-running server-info (mode 0600, url has ?key=); second start refuses naming the URL', async () => {
  const dir = mkTmp('vd-content-');
  const stateDir = mkTmp('vd-state-');
  const first = run(['start', '--dir', dir, '--state', stateDir, '--idle-minutes', '2']);
  try {
    assert.equal(first.code, 0, first.err);
    const info = JSON.parse(first.out);
    assert.match(info.url, /\?key=/);

    const infoPath = path.join(stateDir, 'server-info');
    assert.equal(fs.existsSync(infoPath), true);
    const mode = fs.statSync(infoPath).mode & 0o777;
    assert.equal(mode, 0o600);

    const second = run(['start', '--dir', dir, '--state', stateDir]);
    assert.notEqual(second.code, 0);
    assert.match(second.err, new RegExp(info.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    await stopQuiet(stateDir);
  }
});

test('status: never-started, running, stopped, crashed', async () => {
  const dir = mkTmp('vd-content-');
  const stateDir = mkTmp('vd-state-');

  const neverStarted = run(['status', '--state', stateDir]);
  assert.equal(neverStarted.out.trim(), 'never-started');

  const started = run(['start', '--dir', dir, '--state', stateDir, '--idle-minutes', '5']);
  assert.equal(started.code, 0, started.err);
  const info = JSON.parse(started.out);

  const running = run(['status', '--state', stateDir]);
  assert.equal(running.out.trim(), 'running');

  // crashed: SIGKILL the daemon directly, bypassing stop's own marker write
  process.kill(info.pid, 'SIGKILL');
  await new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
  const crashed = run(['status', '--state', stateDir]);
  assert.equal(crashed.out.trim(), 'crashed');

  // stopped: start again, then stop cleanly
  const restarted = run(['start', '--dir', dir, '--state', stateDir, '--idle-minutes', '5']);
  assert.equal(restarted.code, 0, restarted.err);
  const stopResult = run(['stop', '--state', stateDir]);
  assert.equal(stopResult.code, 0);
  const stoppedStatus = run(['status', '--state', stateDir]);
  assert.equal(stoppedStatus.out.trim(), 'stopped');
});

test('review fix: --idle-minutes 0 is honored by the daemon, not silently replaced by the 240min default', async () => {
  // idleMinutes=0 makes the daemon self-exit within ~1ms of starting — too
  // fast for `start`'s own probe to reliably observe as "running" (a race
  // inherent to the value itself, not the bug under test), so this checks
  // the effect (the stopped marker appears promptly) rather than gating on
  // `start`'s own exit code.
  const dir = mkTmp('vd-content-');
  const stateDir = mkTmp('vd-state-');
  run(['start', '--dir', dir, '--state', stateDir, '--idle-minutes', '0']);
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
  assert.equal(
    fs.existsSync(path.join(stateDir, 'server-stopped')),
    true,
    'idleMinutes=0 must self-exit almost immediately, not run for 240 minutes',
  );
});

test('stop is stale-PID tolerant (dead PID -> already-stopped, exit 0)', async () => {
  const dir = mkTmp('vd-content-');
  const stateDir = mkTmp('vd-state-');
  const started = run(['start', '--dir', dir, '--state', stateDir, '--idle-minutes', '5']);
  const info = JSON.parse(started.out);
  process.kill(info.pid, 'SIGKILL');
  await new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
  const stopResult = run(['stop', '--state', stateDir]);
  assert.equal(stopResult.code, 0);
  assert.equal(fs.existsSync(path.join(stateDir, 'server-stopped')), true);
});

test('AC6 (CLI path): fractional --idle-minutes self-exits and status reflects stopped', async () => {
  const dir = mkTmp('vd-content-');
  const stateDir = mkTmp('vd-state-');
  const started = run(['start', '--dir', dir, '--state', stateDir, '--idle-minutes', '0.05']);
  assert.equal(started.code, 0, started.err);
  await new Promise((resolve) => {
    setTimeout(resolve, 4000);
  });
  const status = run(['status', '--state', stateDir]);
  assert.equal(status.out.trim(), 'stopped');
});

test('AC8: cli.js and bin entry have zero non-builtin imports', () => {
  for (const file of [
    BIN,
    path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'visual-decide', 'cli.js'),
  ]) {
    const src = fs.readFileSync(file, 'utf8');
    const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    for (const spec of requires) {
      if (spec.startsWith('.')) continue; // local module references
      assert.match(spec, /^node:/, `unexpected non-builtin import in ${file}: ${spec}`);
    }
  }
});
