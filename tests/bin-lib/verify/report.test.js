'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { gitInfo, composeReport, writeReportAtomic } = require(path.join(
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

test('writeReportAtomic writes a pid-suffixed temp file then renames it over the target (AC3)', () => {
  const calls = [];
  const writeFile = (p, content) => calls.push(['write', p, content]);
  const rename = (from, to) => calls.push(['rename', from, to]);
  writeReportAtomic({ pass: true }, '/out/report.json', { writeFile, rename });
  assert.strictEqual(calls[0][0], 'write');
  assert.ok(calls[0][1].startsWith('/out/report.json.tmp-'), 'tmp path is pid-suffixed, not a fixed name');
  assert.deepStrictEqual(JSON.parse(calls[0][2]), { pass: true });
  assert.deepStrictEqual(calls[1], ['rename', calls[0][1], '/out/report.json']);
});

test('writeReportAtomic: two different-pid writers no longer collide on the tmp filename (fixes the shared `.tmp` bug)', () => {
  const writePaths = [];
  const writeFile = (p) => writePaths.push(p);
  const rename = () => {};

  const originalPid = process.pid;
  try {
    Object.defineProperty(process, 'pid', { value: 111, configurable: true });
    writeReportAtomic({ pass: true }, '/out/report.json', { writeFile, rename });
    Object.defineProperty(process, 'pid', { value: 222, configurable: true });
    writeReportAtomic({ pass: true }, '/out/report.json', { writeFile, rename });
  } finally {
    Object.defineProperty(process, 'pid', { value: originalPid, configurable: true });
  }

  assert.notStrictEqual(writePaths[0], writePaths[1], 'two different-pid writers use two different tmp paths');
  assert.ok(writePaths[0].endsWith('.tmp-111'));
  assert.ok(writePaths[1].endsWith('.tmp-222'));
});
