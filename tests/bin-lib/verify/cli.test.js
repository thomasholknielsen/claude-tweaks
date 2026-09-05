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

test('outside a checkout, omitting --count-stamp disables persistence and comparison entirely', async () => {
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

// Review fix round 2, finding A: --stamp-status --git-dir <dir> read the
// stamp from <dir> but computed head/dirty from the invoking cwd's own
// git dir via gitInfo() -- a sibling checkout sitting at the same commit
// could read match:true for a verification it never ran. B is a distinct
// repo from A; A's stamp is read from B's cwd and must never match.
test('--stamp-status --git-dir pointing at a foreign checkout never matches (#1921 review fix)', async () => {
  const a = tmpGitRepo();
  const b = tmpGitRepo();
  const { code: passCode } = await runCli(['--cmd', 'tests=node -e 0'], { cwd: a.repo });
  assert.strictEqual(passCode, 0);
  const { code, stdout } = await runCli(['--stamp-status', '--git-dir', a.gitDir], { cwd: b.repo });
  assert.strictEqual(code, 0);
  const s = JSON.parse(stdout);
  assert.strictEqual(s.present, true);
  assert.strictEqual(s.match, false);
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

// Review fix round 1, finding 2 (superseded by the #1921 final review, finding
// 4): --git-dir routing for a normal --cmd run (as opposed to --stamp-status
// --git-dir, already covered above) had no dedicated test. The original
// version of this test ran from a non-git cwd, so gitInfo()'s sha:null
// already blocked the stamp write for an unrelated reason and never proved
// the actual invariant. gitInfo() still reads HEAD/dirty from the process's
// own cwd (report.js's gitInfo has no --git-dir-aware overload), so an
// explicit --git-dir must never let a run stamp a repo with a HEAD that
// isn't the invoking cwd's own — the write gate now short-circuits on
// `parsed.gitDir` explicitly, rather than relying on cwd happening to be
// non-git. This test runs from a cwd that IS a git checkout (a second
// tmpGitRepo()) so the old "sha:null blocks it" path can't mask a
// regression.
test('--git-dir on a normal run redirects report/count paths to that git dir and never writes the pass stamp (#1921)', async () => {
  const { gitDir: otherGitDir } = tmpGitRepo();
  const { repo: cwdRepo, gitDir: cwdGitDir } = tmpGitRepo();
  const { code, stdout } = await runCli(['--cmd', 'tests=node -e 0', '--git-dir', otherGitDir], { cwd: cwdRepo });
  assert.strictEqual(code, 0);
  assert.ok(
    stdout.includes(`report: ${path.join(otherGitDir, 'claude-tweaks-verify', 'report.json')}`),
    'report.json must land under the --git-dir-routed default log dir',
  );
  assert.ok(fs.existsSync(path.join(otherGitDir, 'claude-tweaks-verify', 'report.json')));
  assert.ok(
    !fs.existsSync(path.join(otherGitDir, 'claude-tweaks-verify-pass.json')),
    'an explicit --git-dir must never write the pass stamp into the redirected repo',
  );
  assert.ok(!fs.existsSync(path.join(otherGitDir, 'claude-tweaks-verify-pass')));
  assert.ok(
    !fs.existsSync(path.join(cwdGitDir, 'claude-tweaks-verify-pass.json')),
    'nor into the invoking cwd\'s own repo — a --git-dir run never stamps at all',
  );
  assert.ok(!fs.existsSync(path.join(cwdGitDir, 'claude-tweaks-verify-pass')));
});

// A declaration file inside a temp repo, plus a marker-touching "unit" command
// so a test can prove a suite was or was not spawned. Two suites are declared
// so "every declared suite selected" (which collapses to mode full) is not
// trivially true whenever the one suite's rule matches.
function scopedRepo(rules, extra = {}) {
  const r = tmpGitRepo();
  const marker = path.join(r.repo, 'unit-ran.marker');
  const decl = { checks: { tests: { unit: 'placeholder', other: 'placeholder' } }, rules, ...extra };
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify(decl));
  r.git('add', '.claude-tweaks/verify-scope.json');
  r.git('commit', '-q', '-m', 'declare verify scope');
  // Shell-quoted with an outer single-quoted -e script: JSON.stringify's
  // double-quoted path literal must never sit inside an outer double-quoted
  // -e script (spawn's shell:true runs this through /bin/sh -c) — nesting
  // "..." inside "..." closes the shell's quoting early and corrupts the
  // path into a bareword the JS parser then misreads as a regex literal.
  const unitCmd = `node -e 'require("fs").writeFileSync(${JSON.stringify(marker)}, "ran")'`;
  // The temp repo has no origin, so --integration-branch names its own local
  // branch — whatever init.defaultBranch made it (master on this machine).
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  return { ...r, marker, unitCmd, branch, declPath: '.claude-tweaks/verify-scope.json' };
}

function stampOf(gitDir) {
  return JSON.parse(fs.readFileSync(path.join(gitDir, 'claude-tweaks-verify-pass.json'), 'utf8'));
}

function commitFile(r, rel, content) {
  fs.mkdirSync(path.dirname(path.join(r.repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(r.repo, rel), content);
  r.git('add', rel);
  r.git('commit', '-q', '-m', `add ${rel}`);
}

test('--scope: full → none → scoped across three commits, anchored to the first full pass (#1922 AC4)', async () => {
  const r = scopedRepo([
    { match: 'src/**', suites: ['unit'], static: true },
    { match: 'docs/**', suites: [], static: false },
  ]);
  const args = ['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', `unit=${r.unitCmd}`];

  const run1 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run1.code, 0, run1.stderr);
  assert.match(run1.stdout, /^Scope: full/m);
  const s1 = stampOf(r.gitDir);
  assert.strictEqual(s1.scope, 'full');
  assert.strictEqual(s1.fullSha, r.git('rev-parse', 'HEAD').trim());
  assert.ok(fs.existsSync(r.marker), 'run 1 must spawn unit');
  fs.unlinkSync(r.marker);

  commitFile(r, 'docs/a.md', 'docs');
  const run2 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run2.code, 0, run2.stderr);
  assert.match(run2.stdout, /^Scope: none — 1 changed file\(s\) since/m);
  assert.match(run2.stdout, /still-verified: bookkeeping-only delta \(docs\/a\.md\)/);
  const s2 = stampOf(r.gitDir);
  assert.strictEqual(s2.scope, 'none');
  assert.strictEqual(s2.fullSha, s1.fullSha);
  assert.strictEqual(s2.base, s1.fullSha);
  assert.deepStrictEqual(s2.suitesRun, []);
  assert.deepStrictEqual(s2.changedFiles, ['docs/a.md']);
  assert.ok(!fs.existsSync(r.marker), 'run 2 must not spawn unit');
  const report2 = JSON.parse(fs.readFileSync(s2.reportPath, 'utf8'));
  assert.strictEqual(report2.scope.mode, 'none');
  assert.strictEqual(report2.pass, true);

  commitFile(r, 'src/a.js', 'module.exports = 1;');
  const run3 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run3.code, 0, run3.stderr);
  assert.match(run3.stdout, /^Scope: scoped — 2 changed file\(s\) since/m);
  const s3 = stampOf(r.gitDir);
  assert.strictEqual(s3.scope, 'scoped');
  assert.deepStrictEqual(s3.suitesRun, ['unit']);
  assert.strictEqual(s3.base, s1.fullSha);
  assert.strictEqual(s3.fullSha, s1.fullSha);
  assert.deepStrictEqual(s3.changedFiles, ['docs/a.md', 'src/a.js']);
  assert.ok(fs.existsSync(r.marker), 'run 3 must spawn unit');
});

test('--scope: an unmatched path fails closed to a full run and is listed as unmatched (#1922)', async () => {
  const r = scopedRepo([{ match: 'docs/**', suites: [], static: false }]);
  const args = ['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', `unit=${r.unitCmd}`];
  await runCli(args, { cwd: r.repo });
  fs.unlinkSync(r.marker);
  commitFile(r, 'mystery/x.txt', 'x');
  const run = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run.code, 0, run.stderr);
  assert.match(run.stdout, /^Scope: full — 1 changed file\(s\) since .*unmatched: 1/m);
  assert.ok(fs.existsSync(r.marker));
  const s = stampOf(r.gitDir);
  assert.strictEqual(s.scope, 'full');
  assert.strictEqual(s.fullSha, r.git('rev-parse', 'HEAD').trim(), 'a full run advances fullSha');
  const report = JSON.parse(fs.readFileSync(s.reportPath, 'utf8'));
  assert.deepStrictEqual(report.scope.unmatched, ['mystery/x.txt']);
});

test('--scope: a --cmd name that is neither types/lint nor a declared suite exits 2 naming it, and writes no stamp (#1922 AC5)', async () => {
  const r = scopedRepo([{ match: 'src/**', suites: ['unit'], static: true }]);
  const run = await runCli(['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', 'smoke=node -e 0'], { cwd: r.repo });
  assert.strictEqual(run.code, 2);
  assert.match(run.stderr, /smoke/);
  assert.match(run.stderr, /usage:/);
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
});

test('--scope: a declaration with an unknown suite in a rule exits 2 naming the rule index and suite, and writes no stamp (#1922 AC6)', async () => {
  const r = scopedRepo([{ match: 'src/**', suites: ['nope'], static: true }]);
  const run = await runCli(['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', `unit=${r.unitCmd}`], { cwd: r.repo });
  assert.strictEqual(run.code, 2);
  assert.match(run.stderr, /rules\[0\].*nope/);
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
  assert.ok(!fs.existsSync(r.marker));
});

test('--scope with no declaration file behaves as a full run and stamps full (#1922)', async () => {
  const r = tmpGitRepo();
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  const run = await runCli(['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', branch, '--cmd', 'tests=node -e 0'], { cwd: r.repo });
  assert.strictEqual(run.code, 0, run.stderr);
  assert.match(run.stdout, /^Scope: full/m);
  assert.strictEqual(stampOf(r.gitDir).scope, 'full');
});

test('--scope tool-scoped: {base} is substituted into the single tests command and fullSha never advances (#1922 Gotchas)', async () => {
  const r = tmpGitRepo();
  const out = path.join(r.repo, 'base-seen.txt');
  // Same outer-single-quote shape as scopedRepo's unitCmd above: a
  // JSON.stringify'd double-quoted path must never sit inside a
  // double-quoted -e script.
  const decl = {
    checks: { tests: `node -e 'require("fs").writeFileSync(${JSON.stringify(out)}, "{base}")'` },
    rules: [{ match: 'src/**', suites: [], static: true }, { match: 'docs/**', suites: [], static: false }],
  };
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify(decl));
  r.git('add', '.claude-tweaks/verify-scope.json');
  r.git('commit', '-q', '-m', 'declare');
  const args = ['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', r.git('symbolic-ref', '--short', 'HEAD').trim(), '--cmd', 'tests=node -e 0'];
  const run1 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run1.code, 0, run1.stderr);
  const s1 = stampOf(r.gitDir);
  assert.strictEqual(s1.scope, 'full');
  commitFile(r, 'src/a.js', '1');
  const run2 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run2.code, 0, run2.stderr);
  assert.match(run2.stdout, /^Scope: tool-scoped/m);
  assert.strictEqual(fs.readFileSync(out, 'utf8'), s1.fullSha, 'the resolved base replaced {base}');
  const s2 = stampOf(r.gitDir);
  assert.strictEqual(s2.scope, 'tool-scoped');
  assert.strictEqual(s2.fullSha, s1.fullSha);
  assert.strictEqual(s2.base, s1.fullSha);
  assert.deepStrictEqual(s2.suitesRun, ['tests']);
});

test('--scope with no --cmd is a usage error even when a declaration exists — an empty check set must never stamp (#1922)', async () => {
  const r = scopedRepo([{ match: 'src/**', suites: ['unit'], static: true }]);
  const run = await runCli(['--scope', r.declPath, '--integration-branch', r.branch], { cwd: r.repo });
  assert.strictEqual(run.code, 2);
  assert.match(run.stderr, /at least one --cmd/);
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
});

test('--scope: an unresolvable base exits 2 with a ChangedFilesError message, never an empty diff (#1922 AC3 posture)', async () => {
  const r = tmpGitRepo();
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify({ checks: { tests: 'x' }, rules: [] }));
  const run = await runCli(['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', 'no-such-branch', '--cmd', 'tests=node -e 0'], { cwd: r.repo });
  assert.strictEqual(run.code, 2);
  assert.match(run.stderr, /could not resolve a base/);
});
