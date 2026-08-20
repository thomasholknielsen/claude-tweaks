'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveReadCommit } = require('../../../plugin/bin/lib/health-core/read-commit');

test('resolveReadCommit returns the trimmed sha from the injected exec', () => {
  const execImpl = (cmd, args) => {
    assert.strictEqual(cmd, 'git');
    assert.deepStrictEqual(args, ['-C', '/some/root', 'rev-parse', 'HEAD']);
    return 'abc1234\n';
  };
  assert.strictEqual(resolveReadCommit('/some/root', execImpl), 'abc1234');
});

test('resolveReadCommit returns null when the exec throws (no git, not a repo)', () => {
  const execImpl = () => { throw new Error('not a git repository'); };
  assert.strictEqual(resolveReadCommit('/some/root', execImpl), null);
});

test('resolveReadCommit returns null on empty output rather than an empty string', () => {
  const execImpl = () => '   \n';
  assert.strictEqual(resolveReadCommit('/some/root', execImpl), null);
});

test('resolveReadCommit defaults execImpl to child_process.execFileSync when not injected', () => {
  // Proves the real default path resolves a real sha in this checkout (not
  // an isolated node:test worker with no cwd repo) — the injectable seam
  // itself is what every other test above already exercises.
  const sha = resolveReadCommit(process.cwd());
  assert.match(sha, /^[0-9a-f]{40}$/);
});
