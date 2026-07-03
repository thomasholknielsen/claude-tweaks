// tests/hooks-git-command.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { gitTargets } = require('../bin/lib/hooks/git-command');

test('plain commit resolves to cwd', () => {
  assert.deepStrictEqual(gitTargets('git commit -m "x"', '/repo'), [{ action: 'commit', dir: '/repo' }]);
});

test('git -C targets the given dir, resolved against cwd', () => {
  assert.deepStrictEqual(gitTargets('git -C /wt/spec-1 commit -m "x"', '/repo'), [{ action: 'commit', dir: '/wt/spec-1' }]);
  assert.deepStrictEqual(gitTargets('git -C ../other commit -m "x"', '/repo/sub'), [{ action: 'commit', dir: '/repo/other' }]);
});

test('cd chains update the effective cwd', () => {
  assert.deepStrictEqual(gitTargets('cd /wt/spec-1 && git add f.js && git commit -m "x"', '/repo'), [
    { action: 'commit', dir: '/wt/spec-1' },
  ]);
});

test('push is reported; other subcommands are not', () => {
  assert.deepStrictEqual(gitTargets('git push origin main', '/repo'), [{ action: 'push', dir: '/repo' }]);
  assert.deepStrictEqual(gitTargets('git status && git log --oneline -3', '/repo'), []);
});

test('multiple targets across separators', () => {
  assert.deepStrictEqual(gitTargets('git commit -m "a"; git push', '/repo'), [
    { action: 'commit', dir: '/repo' },
    { action: 'push', dir: '/repo' },
  ]);
});

test('value-taking global flags do not swallow the subcommand', () => {
  assert.deepStrictEqual(gitTargets('git -c user.name=x commit -m "y"', '/repo'), [{ action: 'commit', dir: '/repo' }]);
  assert.deepStrictEqual(gitTargets('git --git-dir /g --work-tree /w commit -m "y"', '/repo'), []); // explicit git-dir: cannot prove target — no claim
});

test('quoted paths are unquoted', () => {
  assert.deepStrictEqual(gitTargets('git -C "/wt/my spec" commit -m "x"', '/repo'), [{ action: 'commit', dir: '/wt/my spec' }]);
});

test('non-git and empty commands yield nothing, never throw', () => {
  assert.deepStrictEqual(gitTargets('npm test', '/repo'), []);
  assert.deepStrictEqual(gitTargets('', '/repo'), []);
  assert.deepStrictEqual(gitTargets(undefined, '/repo'), []);
});
