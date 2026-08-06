// tests/hooks-git-exec.test.js — the shared git spawn wrapper behind every
// hooks/ module. It had no suite of its own before #134, which is part of why
// the timeout branch went unexamined for so long: nothing ever exercised it.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runGit, isIndeterminate, FAILURE, DEFAULT_TIMEOUT_MS } = require('../bin/lib/hooks/git-exec');
const { gitRepo } = require('./helpers/git-fixtures');

test('runGit: success returns trimmed stdout and a null failure', () => {
  const dir = gitRepo();
  const { stdout, failure } = runGit(['rev-parse', '--show-toplevel'], dir);
  assert.strictEqual(failure, null);
  assert.strictEqual(stdout, fs.realpathSync(dir));
  assert.ok(!stdout.endsWith('\n'), 'stdout must be trimmed');
});

test('runGit: a non-git directory is git-error — git ANSWERED, in the negative', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ct-ge-nongit-'));
  const { stdout, failure } = runGit(['rev-parse', '--show-toplevel'], dir);
  assert.strictEqual(stdout, null);
  assert.strictEqual(failure, FAILURE.GIT_ERROR);
  assert.strictEqual(isIndeterminate(failure), false,
    'git exiting non-zero is a real answer — a caller may act on it');
});

test('runGit: a blown budget is timeout, and timeout is indeterminate (#134)', () => {
  const dir = gitRepo();
  // 1ms cannot complete any real git invocation, so this deterministically
  // exercises the branch that fired non-deterministically under load.
  const { stdout, failure } = runGit(['rev-parse', '--show-toplevel'], dir, { timeoutMs: 1 });
  assert.strictEqual(stdout, null);
  assert.strictEqual(failure, FAILURE.TIMEOUT);
  assert.strictEqual(isIndeterminate(failure), true,
    'a timeout means the question went unanswered — a caller must NOT read it as a negative');
});

test('runGit: the timeout and non-git cases are distinguishable from each other', () => {
  // The single assertion that would have prevented #134. Before this change
  // both of these produced an identical `null`, so no caller could tell a
  // transient load spike from a permanent fact about the filesystem.
  const repo = gitRepo();
  const nonGit = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ct-ge-cmp-'));

  const timedOut = runGit(['rev-parse', '--show-toplevel'], repo, { timeoutMs: 1 });
  const notARepo = runGit(['rev-parse', '--show-toplevel'], nonGit);

  assert.strictEqual(timedOut.stdout, notARepo.stdout, 'both still yield no stdout');
  assert.notStrictEqual(timedOut.failure, notARepo.failure,
    'but the FAILURE KIND must differ — that difference is the entire fix');
  assert.notStrictEqual(isIndeterminate(timedOut.failure), isIndeterminate(notARepo.failure));
});

test('runGit: always returns an object, never null, on every path', () => {
  // The old contract returned `string | null`. Callers testing `if (!out)` were
  // correct then and would be silently WRONG now, so the rename to runGit is
  // load-bearing. This pins the new contract so a future revert to a nullable
  // return has to fail a test rather than fail a gate in production.
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ct-ge-shape-'));
  for (const result of [
    runGit(['rev-parse', '--show-toplevel'], gitRepo()),
    runGit(['rev-parse', '--show-toplevel'], dir),
    runGit(['rev-parse', '--show-toplevel'], dir, { timeoutMs: 1 }),
    runGit(['definitely-not-a-git-subcommand'], dir),
  ]) {
    assert.strictEqual(typeof result, 'object');
    assert.ok(result !== null);
    assert.ok('stdout' in result && 'failure' in result);
  }
});

test('isIndeterminate: success (null failure) is not indeterminate', () => {
  assert.strictEqual(isIndeterminate(null), false);
});

test('the default budget has real headroom over the peak measured under load', () => {
  // #134 measured the enforcement-critical rev-parse at 2492ms maximum under 24
  // concurrent workers plus two full test suites. The previous 3000ms budget
  // left 20% headroom and demonstrably fired. This asserts the replacement is
  // not merely different but has margin over the evidence that motivated it.
  const PEAK_MEASURED_MS = 2492;
  assert.ok(DEFAULT_TIMEOUT_MS >= PEAK_MEASURED_MS * 3,
    `budget ${DEFAULT_TIMEOUT_MS}ms must be >=3x the ${PEAK_MEASURED_MS}ms peak measured under load`);
});
