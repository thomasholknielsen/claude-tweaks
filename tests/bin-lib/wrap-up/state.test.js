// bin/lib/wrap-up/tests/state.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { readState } = require('../../../plugin/bin/lib/wrap-up/state');

// Build a stub git runner from a map of joined-args -> output. Returning null
// models a failing git invocation, which is how the real runner reports one.
function stubRunner(responses) {
  return (args) => (Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null);
}

const ON_BRANCH_UNPUSHED = {
  'rev-parse --is-inside-work-tree': 'true',
  'branch --show-current': 'main',
  'rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/dev',
  'rev-list --left-right --count @{u}...HEAD': '0\t1',
  'rev-list --count a1b2c3d..HEAD': '1',
  'rev-parse --git-dir': '/repo/.git',
  'rev-parse --git-common-dir': '/repo/.git',
};

test('readState reports an unpushed branch, which is the fact the old report got wrong', () => {
  const s = readState({ cwd: '/repo', since: 'a1b2c3d', run: stubRunner(ON_BRANCH_UNPUSHED) });
  assert.strictEqual(s.branch, 'main');
  assert.strictEqual(s.upstream, 'origin/dev');
  assert.strictEqual(s.ahead, 1);
  assert.strictEqual(s.pushed, false);
  assert.strictEqual(s.commitsInScope, 1);
});

test('readState reports pushed when nothing is ahead of upstream', () => {
  const s = readState({
    cwd: '/repo',
    since: 'a1b2c3d',
    run: stubRunner({ ...ON_BRANCH_UNPUSHED, 'rev-list --left-right --count @{u}...HEAD': '0\t0' }),
  });
  assert.strictEqual(s.pushed, true);
});

test('readState marks a detached HEAD rather than reporting an empty branch name', () => {
  const s = readState({
    cwd: '/repo',
    since: 'a1b2c3d',
    run: stubRunner({ ...ON_BRANCH_UNPUSHED, 'branch --show-current': '', 'rev-parse --short HEAD': 'deadbee' }),
  });
  assert.strictEqual(s.branch, null);
  assert.strictEqual(s.detachedAt, 'deadbee');
});

test('readState reports pushed as null when an upstream resolves but the ahead/behind read fails', () => {
  const responses = { ...ON_BRANCH_UNPUSHED };
  delete responses['rev-list --left-right --count @{u}...HEAD'];
  const s = readState({ cwd: '/repo', since: 'a1b2c3d', run: stubRunner(responses) });
  assert.strictEqual(s.upstream, 'origin/dev');
  assert.strictEqual(s.ahead, null);
  assert.strictEqual(s.pushed, null);
});

test('readState reports no upstream as unpushed rather than as unknown', () => {
  const responses = { ...ON_BRANCH_UNPUSHED };
  delete responses['rev-parse --abbrev-ref --symbolic-full-name @{u}'];
  delete responses['rev-list --left-right --count @{u}...HEAD'];
  const s = readState({ cwd: '/repo', since: 'a1b2c3d', run: stubRunner(responses) });
  assert.strictEqual(s.upstream, null);
  assert.strictEqual(s.pushed, false);
  assert.strictEqual(s.ahead, null);
});

test('readState detects a linked worktree by git-dir differing from git-common-dir', () => {
  const s = readState({
    cwd: '/repo/.claude/worktrees/x',
    since: 'a1b2c3d',
    run: stubRunner({
      ...ON_BRANCH_UNPUSHED,
      'rev-parse --git-dir': '/repo/.git/worktrees/x',
      'rev-parse --git-common-dir': '/repo/.git',
    }),
  });
  assert.strictEqual(s.linkedWorktree, true);
});

test('readState outside a repository sets isRepo false and leaves fields null, never omitted', () => {
  const s = readState({ cwd: '/tmp', since: 'a1b2c3d', run: stubRunner({}) });
  assert.strictEqual(s.isRepo, false);
  assert.strictEqual(s.branch, null);
  assert.strictEqual(s.upstream, null);
  assert.strictEqual(s.commitsInScope, null);
  assert.ok('pushed' in s, 'pushed must be present even when unknown');
});
