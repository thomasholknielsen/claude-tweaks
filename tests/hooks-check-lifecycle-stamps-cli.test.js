// tests/hooks-check-lifecycle-stamps-cli.test.js
//
// [IL-131] second recurrence (#991): CLI-level coverage for `node
// bin/hooks.js check-lifecycle-stamps`, spawning the real process (unlike
// tests/bin-lib/hooks/lifecycle-stamps.test.js, which tests the pure
// decision function directly) — proves the argv parsing, exit codes, and
// stdout/stderr split actually work end to end, mirroring
// tests/hooks-resolve-run-dir-cli.test.js's pattern for the dispatcher's
// other genuinely-non-zero-exit verb.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOKS_JS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

function run(args, cwd, env) {
  try {
    const stdout = execFileSync('node', [HOOKS_JS, ...args], {
      cwd, env: { ...process.env, ...env }, timeout: 15000,
    });
    return { code: 0, stdout: stdout.toString('utf8'), stderr: '' };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString('utf8') : '',
      stderr: e.stderr ? e.stderr.toString('utf8') : '',
    };
  }
}

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-lcstamp-repo-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return fs.realpathSync(dir);
}

function mkRunDir(main, name) {
  const dir = path.join(main, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'decisions.md'), '');
  return dir;
}

test('exit 0 and a not-applicable note when no run dir resolves (standalone /test)', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-lcstamp-bare-'));
  const result = run(['check-lifecycle-stamps'], bare);
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /nothing to enforce/);
});

test('exit 1 and both problems on stderr when neither stamp is present (the #118/#893/#991 trigger)', () => {
  const main = gitRepo();
  const run1 = mkRunDir(main, '2026-08-21T000000-record-991');
  const result = run(['check-lifecycle-stamps', '--run', run1, '--git-strategy', 'worktree', '--integration-model', 'pr-first'], main);
  assert.strictEqual(result.code, 1);
  assert.match(result.stderr, /lifecycle stamp gate FAILED/);
  assert.match(result.stderr, /record-worktree was never called/);
  assert.match(result.stderr, /PR-early lifecycle/);
  assert.strictEqual(result.stdout, '');
});

test('exit 0 once record-worktree and record-pr have both run', () => {
  const main = gitRepo();
  const run1 = mkRunDir(main, '2026-08-21T000000-record-1');
  const wt = path.join(main, 'wt');
  assert.strictEqual(run(['record-worktree', '--run', run1, wt], main).code, 0);
  assert.strictEqual(run(['record-pr', '--run', run1, '9', 'https://github.com/o/r/pull/9'], main).code, 0);
  const result = run(['check-lifecycle-stamps', '--run', run1, '--git-strategy', 'worktree', '--integration-model', 'pr-first'], main);
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /lifecycle stamps OK/);
});

test('a recorded degrade satisfies the gate — never turns a legitimate push/create failure into a block', () => {
  const main = gitRepo();
  const run1 = mkRunDir(main, '2026-08-21T000000-record-2');
  const wt = path.join(main, 'wt');
  assert.strictEqual(run(['record-worktree', '--run', run1, wt], main).code, 0);
  const degrade = run(['record-pr', '--run', run1, '--degraded', 'push-failed: no network'], main);
  assert.strictEqual(degrade.code, 0);
  assert.match(degrade.stdout, /PR-early degrade recorded/);
  const result = run(['check-lifecycle-stamps', '--run', run1, '--git-strategy', 'worktree', '--integration-model', 'pr-first'], main);
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /lifecycle stamps OK/);
});

test('local-merge never requires a PR stamp', () => {
  const main = gitRepo();
  const run1 = mkRunDir(main, '2026-08-21T000000-record-3');
  const wt = path.join(main, 'wt');
  assert.strictEqual(run(['record-worktree', '--run', run1, wt], main).code, 0);
  const result = run(['check-lifecycle-stamps', '--run', run1, '--git-strategy', 'worktree', '--integration-model', 'local-merge'], main);
  assert.strictEqual(result.code, 0);
});

test('current-branch never requires a worktree stamp', () => {
  const main = gitRepo();
  const run1 = mkRunDir(main, '2026-08-21T000000-record-4');
  const result = run(['check-lifecycle-stamps', '--run', run1, '--git-strategy', 'current-branch', '--integration-model', 'local-merge'], main);
  assert.strictEqual(result.code, 0);
});

test('an invalid --run path fails loudly on stderr rather than silently passing', () => {
  const main = gitRepo();
  const bogus = path.join(main, 'nope');
  const result = run(['check-lifecycle-stamps', '--run', bogus, '--git-strategy', 'worktree', '--integration-model', 'pr-first'], main);
  assert.strictEqual(result.code, 1);
  assert.match(result.stderr, /--run path rejected/);
});
