'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  planRetry, applyRetryResults, retryLogName, runRetries, flakyCaveatLines,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'flaky.js'));

const FLAKY = { files: ['tests/a.test.js', 'tests/b.test.js'], maxRetries: 1 };
const RETRY = { tests: 'node --test {file}' };

test('planRetry: every failing file listed + a template → retry with one command per file, log order kept (AC2)', () => {
  const plan = planRetry({ failingFiles: ['tests/b.test.js', 'tests/a.test.js'], flaky: FLAKY, retry: RETRY, suite: 'tests' });
  assert.deepStrictEqual(plan, {
    retry: true,
    files: ['tests/b.test.js', 'tests/a.test.js'],
    command: [
      { file: 'tests/b.test.js', cmd: 'node --test tests/b.test.js' },
      { file: 'tests/a.test.js', cmd: 'node --test tests/a.test.js' },
    ],
  });
});

test('planRetry: any unlisted failing file → no retry, and the reason names every unlisted file (AC2)', () => {
  const plan = planRetry({ failingFiles: ['tests/a.test.js', 'tests/real.test.js', 'tests/other.test.js'], flaky: FLAKY, retry: RETRY, suite: 'tests' });
  assert.strictEqual(plan.retry, false);
  assert.strictEqual(plan.reason, 'unlisted: [tests/real.test.js, tests/other.test.js]');
  assert.deepStrictEqual(plan.unlisted, ['tests/real.test.js', 'tests/other.test.js']);
});

test('planRetry: empty failingFiles → no-parse; no template for the suite → no-template; maxRetries 0 → max-retries-0 (AC2)', () => {
  assert.deepStrictEqual(planRetry({ failingFiles: [], flaky: FLAKY, retry: RETRY, suite: 'tests' }), { retry: false, reason: 'no-parse' });
  assert.deepStrictEqual(planRetry({ failingFiles: ['tests/a.test.js'], flaky: FLAKY, retry: {}, suite: 'tests' }), { retry: false, reason: 'no-template' });
  assert.deepStrictEqual(planRetry({ failingFiles: ['tests/a.test.js'], flaky: FLAKY, retry: RETRY, suite: 'unit' }), { retry: false, reason: 'no-template' });
  assert.deepStrictEqual(planRetry({ failingFiles: ['tests/a.test.js'], flaky: { files: ['tests/a.test.js'], maxRetries: 0 }, retry: RETRY, suite: 'tests' }), { retry: false, reason: 'max-retries-0' });
});

test('planRetry: the allowlist is suite-agnostic — a listed file retries under whichever suite it failed in, with that suite\'s template', () => {
  const plan = planRetry({ failingFiles: ['tests/a.test.js'], flaky: FLAKY, retry: { unit: 'pnpm --filter api test -- {file}' }, suite: 'unit' });
  assert.deepStrictEqual(plan.command, [{ file: 'tests/a.test.js', cmd: 'pnpm --filter api test -- tests/a.test.js' }]);
});

test('retryLogName namespaces per file and per attempt', () => {
  assert.strictEqual(retryLogName('tests', 'tests/bin-lib/a.test.js', 2), 'tests-retry-tests-bin-lib-a.test.js-2');
});

test('applyRetryResults: every attempted file passed → exitCode 0 + flakyRetried; a file with no pass → retryFailed and the original exit code kept', () => {
  const check = { name: 'tests', command: 'npm test', exitCode: 1, durationMs: 5, logPath: '/l/tests.log' };
  const ok = applyRetryResults(check, [
    { file: 'tests/a.test.js', attempt: 1, exitCode: 1, logPath: '/l/a1.log', durationMs: 1 },
    { file: 'tests/a.test.js', attempt: 2, exitCode: 0, logPath: '/l/a2.log', durationMs: 1 },
    { file: 'tests/b.test.js', attempt: 1, exitCode: 0, logPath: '/l/b1.log', durationMs: 1 },
  ]);
  assert.strictEqual(ok.exitCode, 0);
  assert.deepStrictEqual(ok.flakyRetried, ['tests/a.test.js', 'tests/b.test.js']);
  assert.strictEqual(ok.retryAttempts.length, 3);
  const bad = applyRetryResults(check, [
    { file: 'tests/a.test.js', attempt: 1, exitCode: 1, logPath: '/l/a1.log', durationMs: 1 },
  ]);
  assert.strictEqual(bad.exitCode, 1);
  assert.deepStrictEqual(bad.flakyRetried, []);
  assert.deepStrictEqual(bad.retryFailed, ['tests/a.test.js']);
});

// A scripted runOne: `script[file]` is the list of exit codes successive
// attempts return; records every call in order.
function fakeRunOne(script) {
  const calls = [];
  const runOne = async ({ name, command }) => {
    const file = command.replace(/^run /, '');
    const codes = script[file] || [0];
    const attempt = calls.filter((c) => c.file === file).length;
    calls.push({ name, file });
    return { name, command, exitCode: codes[Math.min(attempt, codes.length - 1)], durationMs: 1, logPath: `/l/${name}.log` };
  };
  return { runOne, calls };
}

test('runRetries: files run serially in plan order, each stops at its first pass, and the result carries flakyRetried', async () => {
  const { runOne, calls } = fakeRunOne({ 'tests/a.test.js': [1, 0], 'tests/b.test.js': [0] });
  const plan = { retry: true, files: ['tests/a.test.js', 'tests/b.test.js'], command: [{ file: 'tests/a.test.js', cmd: 'run tests/a.test.js' }, { file: 'tests/b.test.js', cmd: 'run tests/b.test.js' }] };
  const out = await runRetries({ check: { name: 'tests', exitCode: 1 }, plan, maxRetries: 2, logDir: '/l', runOne, spawnImpl: null, now: () => 0 });
  assert.deepStrictEqual(calls.map((c) => c.name), ['tests-retry-tests-a.test.js-1', 'tests-retry-tests-a.test.js-2', 'tests-retry-tests-b.test.js-1']);
  assert.strictEqual(out.exitCode, 0);
  assert.deepStrictEqual(out.flakyRetried, ['tests/a.test.js', 'tests/b.test.js']);
});

test('runRetries: a file that exhausts maxRetries fails the run and short-circuits the files after it', async () => {
  const { runOne, calls } = fakeRunOne({ 'tests/a.test.js': [1, 1, 1], 'tests/b.test.js': [0] });
  const plan = { retry: true, files: ['tests/a.test.js', 'tests/b.test.js'], command: [{ file: 'tests/a.test.js', cmd: 'run tests/a.test.js' }, { file: 'tests/b.test.js', cmd: 'run tests/b.test.js' }] };
  const out = await runRetries({ check: { name: 'tests', exitCode: 1 }, plan, maxRetries: 2, logDir: '/l', runOne, spawnImpl: null, now: () => 0 });
  assert.strictEqual(calls.length, 2, 'two attempts for a, none for b');
  assert.strictEqual(out.exitCode, 1);
  assert.deepStrictEqual(out.retryFailed, ['tests/a.test.js']);
  assert.deepStrictEqual(out.flakyRetried, []);
});

test('flakyCaveatLines: one line per retried check naming the files and the passing retry logs; none for an ordinary check', () => {
  const lines = flakyCaveatLines([
    { name: 'lint', exitCode: 0 },
    { name: 'tests', exitCode: 0, flakyRetried: ['tests/a.test.js'], retryAttempts: [{ file: 'tests/a.test.js', attempt: 1, exitCode: 1, logPath: '/l/a1.log' }, { file: 'tests/a.test.js', attempt: 2, exitCode: 0, logPath: '/l/a2.log' }] },
  ]);
  assert.deepStrictEqual(lines, ['CAVEAT: flaky-retried: tests/a.test.js — passed on isolated rerun; see /l/a2.log']);
});
