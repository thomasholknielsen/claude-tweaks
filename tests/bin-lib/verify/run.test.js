'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const { runChecks } = require(path.join(
  __dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'run.js'));

function tmpLogDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-run-test-'));
}

// Fake spawn: records spawn order; each child completes with the scripted
// exit code on the next macrotask unless `manual` — then the test closes it.
function makeFakeSpawn(script) {
  const spawned = [];
  const children = {};
  function spawnImpl(command) {
    spawned.push(command);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; };
    children[command] = child;
    const plan = script[command] || { exit: 0 };
    if (plan.throw) throw new Error(plan.throw);
    if (plan.output) child.stdout.end(plan.output); else child.stdout.end();
    child.stderr.end();
    if (!plan.manual) setImmediate(() => child.emit('close', plan.exit));
    if (plan.error) setImmediate(() => child.emit('error', new Error(plan.error)));
    return child;
  }
  return { spawnImpl, spawned, children };
}

test('types and lint spawn concurrently; tests waits for both (AC1)', async () => {
  const { spawnImpl, spawned, children } = makeFakeSpawn({
    types: { manual: true }, lint: { manual: true }, tests: { exit: 0 },
  });
  const done = runChecks({
    cmds: [
      { name: 'types', command: 'types' },
      { name: 'lint', command: 'lint' },
      { name: 'tests', command: 'tests' },
    ],
    logDir: tmpLogDir(), spawnImpl,
  });
  await new Promise((r) => setImmediate(r));
  // Both stage-1 checks spawned before either completed; tests not yet spawned.
  assert.deepStrictEqual(spawned.sort(), ['lint', 'types']);
  children.types.emit('close', 0);
  children.lint.emit('close', 0);
  const results = await done;
  assert.strictEqual(spawned.length, 3);
  assert.strictEqual(spawned[2], 'tests', 'tests must spawn only after both stage-1 checks close');
  assert.strictEqual(results.find((r) => r.name === 'tests').exitCode, 0);
});

test('a supplied types failure records tests as skipped: fail-fast (AC1)', async () => {
  const { spawnImpl, spawned } = makeFakeSpawn({ types: { exit: 1 }, lint: { exit: 0 } });
  const results = await runChecks({
    cmds: [
      { name: 'types', command: 'types' },
      { name: 'lint', command: 'lint' },
      { name: 'tests', command: 'tests' },
    ],
    logDir: tmpLogDir(), spawnImpl,
  });
  assert.ok(!spawned.includes('tests'), 'tests must never spawn after a stage-1 failure');
  const tests = results.find((r) => r.name === 'tests');
  assert.deepStrictEqual(tests, { name: 'tests', command: 'tests', skipped: 'fail-fast' });
});

test('tests alone starts immediately (AC1 partial set)', async () => {
  const { spawnImpl, spawned } = makeFakeSpawn({ t: { exit: 0 } });
  const results = await runChecks({
    cmds: [{ name: 'tests', command: 't' }], logDir: tmpLogDir(), spawnImpl,
  });
  assert.deepStrictEqual(spawned, ['t']);
  assert.strictEqual(results[0].exitCode, 0);
});

test('lint+tests without types: lint failure skips tests (AC1 partial set)', async () => {
  const { spawnImpl, spawned } = makeFakeSpawn({ lint: { exit: 2 } });
  const results = await runChecks({
    cmds: [{ name: 'lint', command: 'lint' }, { name: 'tests', command: 'tests' }],
    logDir: tmpLogDir(), spawnImpl,
  });
  assert.ok(!spawned.includes('tests'));
  assert.strictEqual(results.find((r) => r.name === 'tests').skipped, 'fail-fast');
});

test('unknown names run serially after known stages, in argv order (AC9)', async () => {
  const { spawnImpl, spawned } = makeFakeSpawn({});
  await runChecks({
    cmds: [
      { name: 'smoke', command: 'smoke' },
      { name: 'types', command: 'types' },
      { name: 'e2e', command: 'e2e' },
      { name: 'tests', command: 'tests' },
    ],
    logDir: tmpLogDir(), spawnImpl,
  });
  assert.deepStrictEqual(spawned, ['types', 'tests', 'smoke', 'e2e']);
});

test('unknown checks are skipped when an earlier check failed, including a preceding unknown (AC9)', async () => {
  const { spawnImpl, spawned } = makeFakeSpawn({ smoke: { exit: 3 } });
  const results = await runChecks({
    cmds: [
      { name: 'tests', command: 'tests' },
      { name: 'smoke', command: 'smoke' },
      { name: 'e2e', command: 'e2e' },
    ],
    logDir: tmpLogDir(), spawnImpl,
  });
  assert.ok(!spawned.includes('e2e'));
  assert.strictEqual(results.find((r) => r.name === 'e2e').skipped, 'fail-fast');
  assert.strictEqual(results.find((r) => r.name === 'smoke').exitCode, 3);
});

test('a throwing spawnImpl records a failed check with spawnError, never a silent skip (AC6)', async () => {
  const { spawnImpl } = makeFakeSpawn({ bad: { throw: 'ENOENT: no such command' } });
  const results = await runChecks({
    cmds: [{ name: 'tests', command: 'bad' }], logDir: tmpLogDir(), spawnImpl,
  });
  assert.strictEqual(results[0].exitCode, null);
  assert.ok(results[0].spawnError.includes('ENOENT'));
});

test('a child error event records a failed check with spawnError (AC6)', async () => {
  const { spawnImpl } = makeFakeSpawn({ bad: { manual: true, error: 'spawn failure' } });
  const results = await runChecks({
    cmds: [{ name: 'tests', command: 'bad' }], logDir: tmpLogDir(), spawnImpl,
  });
  assert.strictEqual(results[0].exitCode, null);
  assert.ok(results[0].spawnError.includes('spawn failure'));
});

test('spawn error in stage 1 fail-fasts downstream stages like any failure', async () => {
  const { spawnImpl, spawned } = makeFakeSpawn({ types: { throw: 'ENOENT' } });
  const results = await runChecks({
    cmds: [{ name: 'types', command: 'types' }, { name: 'tests', command: 'tests' }],
    logDir: tmpLogDir(), spawnImpl,
  });
  assert.ok(!spawned.includes('tests'));
  assert.strictEqual(results.find((r) => r.name === 'tests').skipped, 'fail-fast');
});

test('check output lands in its own {name}.log under logDir (AC2 capture half)', async () => {
  const logDir = tmpLogDir();
  const { spawnImpl } = makeFakeSpawn({ t: { exit: 0, output: 'hello from the check\n' } });
  const results = await runChecks({
    cmds: [{ name: 'tests', command: 't' }], logDir, spawnImpl,
  });
  assert.strictEqual(results[0].logPath, path.join(logDir, 'tests.log'));
  assert.strictEqual(fs.readFileSync(results[0].logPath, 'utf8'), 'hello from the check\n');
});

test('a write-stream failure (unwritable logDir) records a failed check with spawnError, never a crash', async () => {
  // manual: true means the fake child never closes on its own — the only way
  // this promise can resolve is via the write-stream's 'error' event. If that
  // handler is missing/broken, this test hangs instead of racing to a false
  // pass against the fake spawn's close event.
  const { spawnImpl } = makeFakeSpawn({ t: { manual: true } });
  // logDir itself doesn't exist (and its parent isn't created either), so
  // fs.createWriteStream emits 'error' (ENOENT) rather than opening the file.
  const logDir = path.join(tmpLogDir(), 'does-not-exist', 'nested');
  const results = await runChecks({
    cmds: [{ name: 'tests', command: 't' }], logDir, spawnImpl,
  });
  assert.strictEqual(results[0].exitCode, null);
  assert.strictEqual(typeof results[0].spawnError, 'string');
  assert.ok(results[0].spawnError.length > 0);
});

test('a child.stdout stream error records a failed check without crashing the process (security)', async () => {
  const logDir = tmpLogDir();
  function spawnImpl() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; };
    setImmediate(() => child.stdout.emit('error', new Error('stream broke')));
    return child;
  }
  const results = await runChecks({
    cmds: [{ name: 'tests', command: 't' }], logDir, spawnImpl,
  });
  assert.strictEqual(results[0].exitCode, null);
  assert.ok(results[0].spawnError.includes('stream broke'));
});

test('a write-stream failure kills the already-spawned child instead of leaving it orphaned (security)', async () => {
  const { spawnImpl, children } = makeFakeSpawn({ t: { manual: true } });
  const logDir = path.join(tmpLogDir(), 'does-not-exist', 'nested');
  await runChecks({
    cmds: [{ name: 'tests', command: 't' }], logDir, spawnImpl,
  });
  assert.strictEqual(children.t.killed, true);
});
