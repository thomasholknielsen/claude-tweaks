// bin/lib/wrap-up/tests/reflog.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseLine, classify, historyOps } = require('../../../plugin/bin/lib/wrap-up/reflog');
const { HEAD_REFLOG, REMOTE_REFLOG, TWELVE_COMMIT_REBASE } = require('./fixtures');

test('parseLine splits a --date=iso reflog line into sha, ref, date and message', () => {
  const parsed = parseLine('e4405303 HEAD@{2026-08-07 15:46:42 +0200}: merge origin/main: Fast-forward');
  assert.deepStrictEqual(parsed, {
    sha: 'e4405303',
    ref: 'HEAD',
    date: '2026-08-07 15:46:42 +0200',
    message: 'merge origin/main: Fast-forward',
  });
});

test('parseLine returns null for a line that is not reflog output', () => {
  assert.strictEqual(parseLine('not a reflog line at all'), null);
  assert.strictEqual(parseLine(''), null);
});

test('classify treats a fast-forward merge as routine and a real merge as report-worthy', () => {
  assert.strictEqual(classify('merge origin/main: Fast-forward'), null);
  assert.strictEqual(classify("merge feature-y: Merge made by the 'ort' strategy."), 'merge');
});

test('classify reports rebase only on its (finish) entry, so a rebase collapses to one row', () => {
  assert.strictEqual(classify('rebase (finish): returning to refs/heads/feature-x'), 'rebase');
  assert.strictEqual(classify('rebase (pick): Add the second thing'), null);
  assert.strictEqual(classify('rebase (start): checkout origin/dev'), null);
});

test('classify reports reset unconditionally — --hard and --soft are indistinguishable in reflog', () => {
  assert.strictEqual(classify('reset: moving to HEAD~1'), 'reset');
  assert.strictEqual(classify('reset: moving to origin/main'), 'reset');
});

test('classify reports cherry-pick, revert and amend', () => {
  assert.strictEqual(classify('cherry-pick: Bring over the fix'), 'cherry-pick');
  assert.strictEqual(classify('revert: Revert "Add the bad thing"'), 'revert');
  assert.strictEqual(classify('commit (amend): Fix the message'), 'amend');
});

test('classify treats checkout, pull and plain commit as routine', () => {
  assert.strictEqual(classify('checkout: moving from main to feature-x'), null);
  assert.strictEqual(classify('pull: Fast-forward'), null);
  assert.strictEqual(classify('commit: Add the first thing'), null);
  assert.strictEqual(classify('commit (initial): First'), null);
});

test('classify reports a push but not a fetch on a remote-tracking ref', () => {
  assert.strictEqual(classify('update by push'), 'push');
  assert.strictEqual(classify('fetch origin main: fast-forward'), null);
});

test('historyOps drops every routine entry from a mixed HEAD reflog', () => {
  const ops = historyOps(HEAD_REFLOG).map((o) => o.op);
  assert.deepStrictEqual(ops, ['rebase', 'reset', 'cherry-pick', 'revert', 'amend', 'merge']);
});

test('historyOps carries sha and date through for each reported op', () => {
  const [first] = historyOps(HEAD_REFLOG);
  assert.strictEqual(first.op, 'rebase');
  assert.strictEqual(first.sha, 'd4e5f6a1');
  assert.strictEqual(first.date, '2026-08-07 15:40:11 +0200');
});

test('historyOps collapses a 12-commit rebase to exactly one row', () => {
  const ops = historyOps(TWELVE_COMMIT_REBASE);
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].op, 'rebase');
});

test('historyOps reports the push from a remote-tracking reflog', () => {
  const ops = historyOps(REMOTE_REFLOG);
  assert.deepStrictEqual(ops.map((o) => o.op), ['push']);
});

test('historyOps on empty or absent input returns an empty array rather than throwing', () => {
  assert.deepStrictEqual(historyOps(''), []);
  assert.deepStrictEqual(historyOps(null), []);
  assert.deepStrictEqual(historyOps(undefined), []);
});
