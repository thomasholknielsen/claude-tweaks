'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseWorktreeList } = require('../bin/lib/hooks/worktree-reap');

// Frozen 2026-08-07 from `git worktree list --porcelain` on macOS, git 2.x.
const PORCELAIN = [
  'worktree /repo',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /repo/.claude/worktrees/alive',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/worktree-alive',
  'locked claude session alive (pid 29881 start Fri Aug  7 14:40:15 2026)',
  '',
  'worktree /repo/.claude/worktrees/dead',
  'HEAD 3333333333333333333333333333333333333333',
  'branch refs/heads/worktree-dead',
  'locked claude session dead (pid 4242 start Fri Aug  7 09:00:00 2026)',
  '',
  'worktree /repo/.claude/worktrees/free',
  'HEAD 4444444444444444444444444444444444444444',
  'branch refs/heads/worktree-free',
  '',
  'worktree /repo/.claude/worktrees/opaque',
  'HEAD 5555555555555555555555555555555555555555',
  'branch refs/heads/worktree-opaque',
  'locked',
  '',
].join('\n');

test('parseWorktreeList: extracts path, branch and lock state for every entry', () => {
  const got = parseWorktreeList(PORCELAIN);
  assert.strictEqual(got.length, 5);
  assert.strictEqual(got[0].path, '/repo');
  assert.strictEqual(got[0].branch, 'main');
  assert.strictEqual(got[0].locked, false);
});

test('parseWorktreeList: recovers the owning pid from the lock reason', () => {
  const got = parseWorktreeList(PORCELAIN);
  const alive = got.find((w) => w.path.endsWith('/alive'));
  assert.strictEqual(alive.locked, true);
  assert.strictEqual(alive.pid, 29881);
});

test('parseWorktreeList: a bare `locked` with no reason yields locked with a null pid', () => {
  const got = parseWorktreeList(PORCELAIN);
  const opaque = got.find((w) => w.path.endsWith('/opaque'));
  assert.strictEqual(opaque.locked, true);
  assert.strictEqual(opaque.lockReason, null);
  assert.strictEqual(opaque.pid, null);
});

test('parseWorktreeList: an unlocked worktree has locked false and a null pid', () => {
  const got = parseWorktreeList(PORCELAIN);
  const free = got.find((w) => w.path.endsWith('/free'));
  assert.strictEqual(free.locked, false);
  assert.strictEqual(free.pid, null);
});

test('parseWorktreeList: a lock reason with no pid parses as locked, pid null', () => {
  const got = parseWorktreeList('worktree /a\nbranch refs/heads/b\nlocked being edited by hand\n\n');
  assert.strictEqual(got[0].locked, true);
  assert.strictEqual(got[0].lockReason, 'being edited by hand');
  assert.strictEqual(got[0].pid, null);
});

test('parseWorktreeList: empty input yields an empty array', () => {
  assert.deepStrictEqual(parseWorktreeList(''), []);
});
