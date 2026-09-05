'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile, spawnSync, execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'verify.js');

// Every invocation runs from a fresh temp dir — never from this repo — so the
// runner's git-dir-relative defaults (#1921) can never write into the real
// checkout's .git (a stamp or count written by a test would poison the next
// real run's skip/caveat decisions).
function tmpDir() {
  // realpathSync: on macOS, os.tmpdir() is a symlink (/var -> /private/var)
  // that a spawned child's own process.cwd() reports already resolved — an
  // unresolved mkdtemp path compared against a path the CLI derives from its
  // own cwd would spuriously mismatch on this platform alone.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cli-test-')));
}

function runCli(args, opts = {}) {
  const cwd = opts.cwd || tmpDir();
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { maxBuffer: 10 * 1024 * 1024, cwd },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr, cwd }));
  });
}

// A throwaway git repo with one commit: git-dir === {repo}/.git.
function tmpGitRepo() {
  const repo = tmpDir();
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q');
  git('config', 'user.email', 'verify-test@example.invalid');
  git('config', 'user.name', 'verify test');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  return { repo, git, gitDir: path.join(repo, '.git') };
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
  ], { stdio: ['ignore', outFd, 'ignore'], cwd: tmpDir() });
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

test('a --count-stamp write failure never crashes the run or discards report.json (review fix: fail-toward-absence, write side)', async () => {
  const logDir = tmpDir();
  const blockerFile = path.join(tmpDir(), 'blocker'); // a FILE, not a directory
  fs.writeFileSync(blockerFile, 'not a directory');
  // A path component of the stamp is a file, not a directory -- mkdirSync's
  // recursive create throws ENOTDIR, and (pre-fix) the stamp write's own
  // writeFileSync would too. Both must be swallowed, never propagated to
  // main()'s top-level catch, which would otherwise skip report.json
  // entirely even though the "tests" check itself passed.
  const countStamp = path.join(blockerFile, 'nested', 'count.json');
  // Must be a TAP-shaped "tests" command (parseCounts-parseable), not a bare
  // console.log — a non-parseable count leaves currentCount null, which
  // skips the stamp write entirely and would make this test pass
  // vacuously even against the unguarded pre-fix code (verified against
  // 57ed3752d before landing this test).
  const { code, stdout } = await runCli([
    '--log-dir', logDir, '--count-stamp', countStamp,
    '--cmd', 'tests=node -e "console.log(\'# tests 1\'); console.log(\'# pass 1\'); console.log(\'# fail 0\')"']);
  assert.strictEqual(code, 0, 'a stamp-write failure must not fail an otherwise-passing run');
  assert.ok(fs.existsSync(path.join(logDir, 'report.json')), 'report.json must still be written despite the stamp-write failure');
  const report = JSON.parse(fs.readFileSync(path.join(logDir, 'report.json'), 'utf8'));
  assert.strictEqual(report.pass, true);
  assert.ok(stdout.includes('report:'), 'stdout must still print the normal report line, not just an uncaught-error message');
});

test('omitting --count-stamp disables persistence and comparison entirely', async () => {
  const { code, stdout } = await runCli([
    '--log-dir', tmpDir(), '--cmd', 'tests=node -e "console.log(String(1))"']);
  assert.strictEqual(code, 0);
  assert.ok(!stdout.includes('CAVEAT'));
});

test('outside a checkout, --log-dir defaults to a fresh tmpdir and --json defaults inside it (#1921 AC4)', async () => {
  const { code, stdout } = await runCli(['--cmd', 'tests=node -e "console.log(String(1))"']);
  assert.strictEqual(code, 0);
  const m = stdout.match(/report: (\S+)/);
  assert.ok(m, 'stdout must name the report path');
  assert.ok(fs.existsSync(m[1]));
  assert.ok(path.basename(m[1]) === 'report.json');
  assert.ok(m[1].includes('claude-tweaks-verify-'), 'mkdtemp fallback dir');
});

test('a passing full-set run writes the JSON stamp and the legacy bare-SHA twin (#1921 AC1)', async () => {
  const { repo, git, gitDir } = tmpGitRepo();
  const { code, stdout } = await runCli(['--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(code, 0);
  const stamp = JSON.parse(fs.readFileSync(path.join(gitDir, 'claude-tweaks-verify-pass.json'), 'utf8'));
  const head = git('rev-parse', 'HEAD').trim();
  assert.strictEqual(stamp.scope, 'full');
  assert.strictEqual(stamp.sha, head);
  assert.strictEqual(stamp.fullSha, head);
  assert.strictEqual(stamp.dirty, false);
  assert.strictEqual(stamp.base, null);
  assert.deepStrictEqual(stamp.changedFiles, []);
  assert.deepStrictEqual(stamp.suitesRun, ['tests']);
  assert.deepStrictEqual(stamp.flakyRetried, []);
  assert.ok(fs.existsSync(stamp.reportPath), 'reportPath must exist');
  assert.strictEqual(fs.readFileSync(path.join(gitDir, 'claude-tweaks-verify-pass'), 'utf8'), `${head}\n`);
  assert.ok(stdout.includes('report:'));
});

test('a failing run, a fail-fast skip, and --no-stamp write neither stamp file (#1921 AC2, #1784)', async () => {
  for (const args of [
    ['--cmd', 'tests=node -e "process.exit(1)"'],
    ['--cmd', 'types=node -e "process.exit(1)"', '--cmd', 'tests=node -e 0'],
    ['--cmd', 'tests=node -e 0', '--no-stamp'],
  ]) {
    const { repo, gitDir } = tmpGitRepo();
    await runCli(args, { cwd: repo });
    assert.ok(!fs.existsSync(path.join(gitDir, 'claude-tweaks-verify-pass.json')), `json stamp written for ${JSON.stringify(args)}`);
    assert.ok(!fs.existsSync(path.join(gitDir, 'claude-tweaks-verify-pass')), `bare stamp written for ${JSON.stringify(args)}`);
  }
});

test('--stamp-status reports match/mismatch/absent as data with exit 0 (#1921 AC3)', async () => {
  const { repo, git, gitDir } = tmpGitRepo();
  const absent = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(absent.code, 0);
  const a = JSON.parse(absent.stdout);
  assert.strictEqual(a.present, false);
  assert.strictEqual(a.match, false);

  await runCli(['--cmd', 'tests=node -e 0'], { cwd: repo });
  const matched = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(matched.code, 0);
  const m = JSON.parse(matched.stdout);
  assert.strictEqual(m.present, true);
  assert.strictEqual(m.match, true);
  assert.strictEqual(m.sha, git('rev-parse', 'HEAD').trim());
  assert.strictEqual(m.head, m.sha);
  assert.strictEqual(m.dirty, false);
  assert.strictEqual(m.scope, 'full');
  assert.strictEqual(m.legacy, false);
  assert.ok(fs.existsSync(m.reportPath));

  git('commit', '-q', '--allow-empty', '-m', 'move head');
  const moved = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(moved.code, 0);
  const v = JSON.parse(moved.stdout);
  assert.strictEqual(v.present, true);
  assert.strictEqual(v.match, false);
  assert.notStrictEqual(v.head, v.sha);
  assert.ok(fs.existsSync(path.join(gitDir, 'claude-tweaks-verify-pass.json')));
});

test('--stamp-status recomputes dirty from the live tree — a dirty edit with no new commit is match:false (#1921 Gotchas)', async () => {
  const { repo } = tmpGitRepo();
  await runCli(['--cmd', 'tests=node -e 0'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'scratch.txt'), 'dirty');
  const { code, stdout } = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(code, 0);
  const s = JSON.parse(stdout);
  assert.strictEqual(s.present, true);
  assert.strictEqual(s.dirty, true);
  assert.strictEqual(s.match, false);
});

test('--stamp-status honors --git-dir and reads a legacy bare-SHA stamp as scope full (#1921)', async () => {
  const { repo, git, gitDir } = tmpGitRepo();
  fs.writeFileSync(path.join(gitDir, 'claude-tweaks-verify-pass'), `${git('rev-parse', 'HEAD').trim()}\n`);
  const { code, stdout } = await runCli(['--stamp-status', '--git-dir', gitDir], { cwd: repo });
  assert.strictEqual(code, 0);
  const s = JSON.parse(stdout);
  assert.strictEqual(s.present, true);
  assert.strictEqual(s.legacy, true);
  assert.strictEqual(s.scope, 'full');
  assert.strictEqual(s.match, true);
  assert.strictEqual(s.reportPath, null);
});

test('--stamp-status outside any checkout prints present:false and exits 0 (#1921 Gotchas)', async () => {
  const { code, stdout } = await runCli(['--stamp-status']);
  assert.strictEqual(code, 0);
  const s = JSON.parse(stdout);
  assert.strictEqual(s.present, false);
  assert.strictEqual(s.match, false);
  assert.strictEqual(s.head, null);
});

test('inside a checkout, --log-dir defaults under the git dir and --count-stamp is persisted there (#1921 AC4)', async () => {
  const { repo, gitDir } = tmpGitRepo();
  const tap = 'node -e "console.log(\'# tests 3\'); console.log(\'# pass 3\'); console.log(\'# fail 0\')"';
  const { code, stdout } = await runCli(['--cmd', `tests=${tap}`], { cwd: repo });
  assert.strictEqual(code, 0);
  const m = stdout.match(/report: (\S+)/);
  assert.strictEqual(m[1], path.join(gitDir, 'claude-tweaks-verify', 'report.json'));
  assert.ok(fs.existsSync(m[1]));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(gitDir, 'claude-tweaks-test-count.json'), 'utf8')).tests, 3);
});

test('an explicit --log-dir still wins inside a checkout (#1921)', async () => {
  const { repo } = tmpGitRepo();
  const logDir = tmpDir();
  const { code, stdout } = await runCli(['--log-dir', logDir, '--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(code, 0);
  assert.ok(stdout.includes(`report: ${path.join(logDir, 'report.json')}`));
});

// Review fix round 1, finding 1: every write-path test up to this point ran
// from a freshly-committed CLEAN tmpGitRepo() — none proved the spec's
// explicit "dirty never gates the write" invariant, so a regression that
// reintroduced a `git.dirty === false` term into the write gate would pass
// the whole suite undetected.
test('a passing full-set run on a DIRTY tree still writes both stamp files, and --stamp-status reflects dirty:true, match:false (#1921 Gotchas)', async () => {
  const { repo, git, gitDir } = tmpGitRepo();
  fs.writeFileSync(path.join(repo, 'untracked.txt'), 'dirty');
  const { code } = await runCli(['--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(code, 0);
  const head = git('rev-parse', 'HEAD').trim();
  const stamp = JSON.parse(fs.readFileSync(path.join(gitDir, 'claude-tweaks-verify-pass.json'), 'utf8'));
  assert.strictEqual(stamp.dirty, true);
  assert.strictEqual(stamp.scope, 'full');
  assert.strictEqual(stamp.sha, head);
  assert.ok(fs.existsSync(path.join(gitDir, 'claude-tweaks-verify-pass')), 'legacy bare-SHA stamp must also be written on a dirty tree');

  const status = await runCli(['--stamp-status'], { cwd: repo });
  assert.strictEqual(status.code, 0);
  const s = JSON.parse(status.stdout);
  assert.strictEqual(s.present, true);
  assert.strictEqual(s.dirty, true);
  assert.strictEqual(s.match, false);
});

// Review fix round 1, finding 2: --git-dir routing for a normal --cmd run
// (as opposed to --stamp-status --git-dir, already covered above) had no
// dedicated test. Run from a non-git cwd with --git-dir pointing at a
// separate repo: default paths (--log-dir, report.json) resolve against
// that --git-dir, but gitInfo() itself still reads HEAD/dirty from the
// process's own cwd (report.js's gitInfo has no --git-dir-aware overload) —
// from a non-git cwd that's sha:null, so the write gate's `&& git.sha` term
// blocks the stamp write even though the report path routing worked.
// --git-dir on a run therefore redirects paths only; the stamp still keys
// on the invoking cwd's own HEAD. This is existing, unchanged verify.js
// behavior (confirmed empirically before writing this test), not a defect
// this test is asserting should be fixed.
test('--git-dir on a normal run routes default paths to that git dir, but the stamp still keys on the invoking cwd (#1921)', async () => {
  const { gitDir: otherGitDir } = tmpGitRepo();
  const nonGitCwd = tmpDir();
  const { code, stdout } = await runCli(['--cmd', 'tests=node -e 0', '--git-dir', otherGitDir], { cwd: nonGitCwd });
  assert.strictEqual(code, 0);
  assert.ok(
    stdout.includes(`report: ${path.join(otherGitDir, 'claude-tweaks-verify', 'report.json')}`),
    'report.json must land under the --git-dir-routed default log dir',
  );
  assert.ok(fs.existsSync(path.join(otherGitDir, 'claude-tweaks-verify', 'report.json')));
  assert.ok(
    !fs.existsSync(path.join(otherGitDir, 'claude-tweaks-verify-pass.json')),
    'no stamp is written: the run cwd is non-git, so gitInfo() sees sha:null and the write gate blocks',
  );
});
