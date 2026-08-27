'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { gitInfo, composeReport } = require(path.join(
  __dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'report.js'));

const PASSING = {
  name: 'tests', command: 'npm test', exitCode: 0, durationMs: 10,
  logPath: '/tmp/l/tests.log', summary: 'tests 5, pass 5, fail 0',
  failingRegion: null, counts: { tests: 5, pass: 5, fail: 0 },
};

test('composeReport keys checks by name and carries AC3 per-check fields', () => {
  const report = composeReport({
    checks: [PASSING], startedAt: '2026-08-18T14:00:00.000Z', durationMs: 12,
    git: { sha: 'abc', dirty: false },
  });
  assert.deepStrictEqual(report.checks.tests, {
    command: 'npm test', exitCode: 0, durationMs: 10,
    logPath: '/tmp/l/tests.log', summary: 'tests 5, pass 5, fail 0',
    failingRegion: null, counts: { tests: 5, pass: 5, fail: 0 },
  });
  assert.strictEqual(report.pass, true);
  assert.strictEqual(report.sha, 'abc');
  assert.strictEqual(report.dirty, false);
  assert.strictEqual(report.startedAt, '2026-08-18T14:00:00.000Z');
  assert.strictEqual(report.durationMs, 12);
});

test('counts is omitted from the entry when null (spec: never guessed/partial)', () => {
  const report = composeReport({
    checks: [{ ...PASSING, counts: null }],
    startedAt: 'x', durationMs: 1, git: { sha: null, dirty: null },
  });
  assert.ok(!('counts' in report.checks.tests));
});

test('a failing check flips pass and keeps its real exit code (AC4)', () => {
  const report = composeReport({
    checks: [{ ...PASSING, exitCode: 7, failingRegion: 'not ok 1' }],
    startedAt: 'x', durationMs: 1, git: { sha: null, dirty: null },
  });
  assert.strictEqual(report.pass, false);
  assert.strictEqual(report.checks.tests.exitCode, 7);
});

test('a spawn-error check flips pass and carries spawnError (AC6)', () => {
  const report = composeReport({
    checks: [{ name: 'lint', command: 'nope', exitCode: null, spawnError: 'ENOENT', durationMs: 1, logPath: '/tmp/l/lint.log' }],
    startedAt: 'x', durationMs: 1, git: { sha: null, dirty: null },
  });
  assert.strictEqual(report.pass, false);
  assert.strictEqual(report.checks.lint.spawnError, 'ENOENT');
});

test('a skipped check carries {skipped} in place of an exit code and does not affect pass (AC3)', () => {
  const report = composeReport({
    checks: [PASSING, { name: 'e2e', command: 'x', skipped: 'fail-fast' }],
    startedAt: 'x', durationMs: 1, git: { sha: null, dirty: null },
  });
  assert.deepStrictEqual(report.checks.e2e, { command: 'x', skipped: 'fail-fast' });
  assert.strictEqual(report.pass, true);
});

test('gitInfo returns nulls when git is unavailable (AC3 outside-a-repo)', () => {
  const throwing = () => { throw new Error('not a repo'); };
  assert.deepStrictEqual(gitInfo(throwing), { sha: null, dirty: null });
});

test('gitInfo derives sha and dirty from the injected exec', () => {
  const fake = (cmd, args) => (args[0] === 'rev-parse' ? 'abc123\n' : ' M file.js\n');
  assert.deepStrictEqual(gitInfo(fake), { sha: 'abc123', dirty: true });
  const clean = (cmd, args) => (args[0] === 'rev-parse' ? 'abc123\n' : '');
  assert.deepStrictEqual(gitInfo(clean), { sha: 'abc123', dirty: false });
});

test('testCountRegression is omitted when null (#881, mirrors counts-never-guessed convention)', () => {
  const report = composeReport({
    checks: [PASSING], startedAt: 'x', durationMs: 1, git: { sha: null, dirty: null },
  });
  assert.ok(!('testCountRegression' in report));
});

test('testCountRegression is carried on the report when non-null (#881)', () => {
  const regression = { previousTests: 10, currentTests: 8, droppedBy: 2 };
  const report = composeReport({
    checks: [PASSING], startedAt: 'x', durationMs: 1, git: { sha: null, dirty: null },
    testCountRegression: regression,
  });
  assert.deepStrictEqual(report.testCountRegression, regression);
});
