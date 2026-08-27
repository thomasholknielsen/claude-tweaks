'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile, spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'verify.js');

function runCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cli-test-'));
}

test('recorded exitCode is the check command own exit code (AC4)', async () => {
  const logDir = tmpDir();
  const { code } = await runCli([
    '--log-dir', logDir, '--cmd', 'tests=node -e "process.exit(7)"']);
  assert.notStrictEqual(code, 0);
  const report = JSON.parse(fs.readFileSync(path.join(logDir, 'report.json'), 'utf8'));
  assert.strictEqual(report.checks.tests.exitCode, 7);
  assert.strictEqual(report.pass, false);
});

test('overall exit is 0 and report carries AC3 top-level fields on pass (AC3, AC7)', async () => {
  const logDir = tmpDir();
  const { code } = await runCli([
    '--log-dir', logDir, '--cmd', 'tests=node -e "console.log(String(1))"']);
  assert.strictEqual(code, 0);
  const report = JSON.parse(fs.readFileSync(path.join(logDir, 'report.json'), 'utf8'));
  assert.strictEqual(report.pass, true);
  for (const key of ['sha', 'dirty', 'startedAt', 'durationMs', 'checks']) {
    assert.ok(key in report, `report missing ${key}`);
  }
  const entry = report.checks.tests;
  for (const key of ['command', 'exitCode', 'durationMs', 'logPath', 'summary', 'failingRegion']) {
    assert.ok(key in entry, `check entry missing ${key}`);
  }
});

test('a metacharacter-bearing --cmd value executes intact in the child shell (AC10)', async () => {
  const logDir = tmpDir();
  const { code } = await runCli([
    '--log-dir', logDir,
    '--cmd', 'tests=node -e "console.log(String(11))" && node -e "console.log(String(22))"']);
  assert.strictEqual(code, 0);
  const log = fs.readFileSync(path.join(logDir, 'tests.log'), 'utf8');
  assert.ok(log.includes('11'));
  assert.ok(log.includes('22'));
});

test('a >1MB emitter leaves runner stdout <= 64KB while the log holds everything (AC2)', () => {
  // execFile's pipe-captured stdout would only ever measure the OS pipe
  // buffer's own capacity (65536 bytes on this platform), not the runner's
  // real output size — a >64KB write truncated by that buffer looks
  // identical to a genuinely-bounded one. Redirect to a real file instead so
  // the assertion measures what the runner actually wrote.
  const logDir = tmpDir();
  const outFile = path.join(tmpDir(), 'stdout.txt');
  const outFd = fs.openSync(outFile, 'w');
  const result = spawnSync(process.execPath, [CLI,
    '--log-dir', logDir,
    '--cmd', 'tests=node -e "process.stdout.write(Buffer.alloc(1500000, 120), () => process.exit(1))"',
  ], { stdio: ['ignore', outFd, 'ignore'] });
  fs.closeSync(outFd);
  assert.notStrictEqual(result.status, 0);
  const stdoutSize = fs.statSync(outFile).size;
  assert.ok(stdoutSize <= 64 * 1024, `runner stdout was ${stdoutSize} bytes`);
  assert.ok(fs.statSync(path.join(logDir, 'tests.log')).size >= 1500000);
});

test('an unresolvable shell command is a failed check via shell exit code (not the spawnError seam — see run.test.js for that path) (AC6 partial)', async () => {
  // spawn(cmd, {shell: true}) means the shell itself always spawns
  // successfully, then reports "command not found" via its own exit code
  // (127) — this exercises that shell exit-code path, not the runner's
  // own spawnError capture (a spawnImpl that throws synchronously, or
  // emits a child 'error' event), which is only exercised end-to-end via
  // the injected fake in run.test.js.
  const logDir = tmpDir();
  const { code } = await runCli([
    '--log-dir', logDir, '--cmd', 'tests=definitely-not-a-real-command-892']);
  assert.notStrictEqual(code, 0);
  const report = JSON.parse(fs.readFileSync(path.join(logDir, 'report.json'), 'utf8'));
  assert.strictEqual(report.pass, false);
  assert.notStrictEqual(report.checks.tests.exitCode, 0);
});

test('malformed argv exits non-zero with usage on stderr (AC6)', async () => {
  for (const args of [['--cmd', 'noequals'], ['--cmd', '=x'], ['--bogus'], []]) {
    const { code, stderr } = await runCli(args);
    assert.notStrictEqual(code, 0, `args ${JSON.stringify(args)} should fail`);
    assert.ok(stderr.includes('usage:'), `stderr missing usage for ${JSON.stringify(args)}`);
  }
});

test('a fail-fast skip appears in the report and in stdout as skipped (AC1 reporting half)', async () => {
  const logDir = tmpDir();
  const { code, stdout } = await runCli([
    '--log-dir', logDir,
    '--cmd', 'lint=node -e "process.exit(1)"',
    '--cmd', 'tests=node -e "console.log(String(1))"']);
  assert.notStrictEqual(code, 0);
  const report = JSON.parse(fs.readFileSync(path.join(logDir, 'report.json'), 'utf8'));
  assert.deepStrictEqual(report.checks.tests,
    { command: 'node -e "console.log(String(1))"', skipped: 'fail-fast' });
  assert.ok(stdout.includes('skipped'));
});

// IL-84's exact shape end-to-end (#881): an enumerated-glob npm test config
// silently excluded a whole test directory while still exiting 0 -- a drop
// invisible to exit-code-only reporting. Reproduce it via two verify.js runs
// sharing one --count-stamp: the first "sees" a wider glob (10 tests), the
// second simulates the exclusion (7 tests) with the same exit code (0).
test('a suite-count drop between two runs sharing --count-stamp fires the caveat (#881, IL-84 shape)', async () => {
  const logDir1 = tmpDir();
  const logDir2 = tmpDir();
  const countStamp = path.join(tmpDir(), 'count.json');
  const tapOutput = (n) => `node -e "console.log('# tests ${n}'); console.log('# pass ${n}'); console.log('# fail 0')"`;

  const first = await runCli([
    '--log-dir', logDir1, '--count-stamp', countStamp, '--cmd', `tests=${tapOutput(10)}`]);
  assert.strictEqual(first.code, 0);
  assert.ok(!first.stdout.includes('CAVEAT'), 'first run has no baseline to regress against');
  assert.ok(fs.existsSync(countStamp), 'first run must persist a baseline stamp');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(countStamp, 'utf8')).tests, 10);

  const second = await runCli([
    '--log-dir', logDir2, '--count-stamp', countStamp, '--cmd', `tests=${tapOutput(7)}`]);
  assert.strictEqual(second.code, 0, 'the tests check itself still passes -- this is a caveat, not a gate');
  assert.match(second.stdout, /^CAVEAT:.*from 10 to 7/ms);
  const report2 = JSON.parse(fs.readFileSync(path.join(logDir2, 'report.json'), 'utf8'));
  assert.deepStrictEqual(report2.testCountRegression, { previousTests: 10, currentTests: 7, droppedBy: 3 });
  assert.strictEqual(report2.pass, true, 'a count drop must not flip the report to failing');
  assert.strictEqual(JSON.parse(fs.readFileSync(countStamp, 'utf8')).tests, 7, 'stamp advances to the new count');
});

test('a steady or higher count between runs never fires the caveat', async () => {
  const countStamp = path.join(tmpDir(), 'count.json');
  const tapOutput = (n) => `node -e "console.log('# tests ${n}'); console.log('# pass ${n}'); console.log('# fail 0')"`;

  await runCli(['--log-dir', tmpDir(), '--count-stamp', countStamp, '--cmd', `tests=${tapOutput(10)}`]);
  const same = await runCli(['--log-dir', tmpDir(), '--count-stamp', countStamp, '--cmd', `tests=${tapOutput(10)}`]);
  assert.ok(!same.stdout.includes('CAVEAT'));
  const higher = await runCli(['--log-dir', tmpDir(), '--count-stamp', countStamp, '--cmd', `tests=${tapOutput(15)}`]);
  assert.ok(!higher.stdout.includes('CAVEAT'));
});

test('omitting --count-stamp disables persistence and comparison entirely', async () => {
  const { code, stdout } = await runCli([
    '--log-dir', tmpDir(), '--cmd', 'tests=node -e "console.log(String(1))"']);
  assert.strictEqual(code, 0);
  assert.ok(!stdout.includes('CAVEAT'));
});

test('--log-dir defaults to a fresh tmpdir and --json defaults inside it', async () => {
  const { code, stdout } = await runCli(['--cmd', 'tests=node -e "console.log(String(1))"']);
  assert.strictEqual(code, 0);
  const m = stdout.match(/report: (\S+)/);
  assert.ok(m, 'stdout must name the report path');
  assert.ok(fs.existsSync(m[1]));
  assert.ok(path.basename(m[1]) === 'report.json');
});
