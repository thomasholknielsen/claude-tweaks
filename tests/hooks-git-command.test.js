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

test('a cd on its own line, preceded by an unrelated statement joined only by a newline, still updates the effective cwd', () => {
  assert.deepStrictEqual(
    gitTargets('VAR="unrelated"\ncd /wt/spec-1 && git add f.js && git commit -m "x"', '/repo'),
    [{ action: 'commit', dir: '/wt/spec-1' }],
  );
});

test('a shell-variable cd on its own line, preceded by an unrelated statement, is unresolvable — no target (never falls back to the stale cwd)', () => {
  assert.deepStrictEqual(
    gitTargets('MKT="/wt/spec-1"\ncd "$MKT" && git commit -m "x"', '/repo'),
    [],
  );
});

test('a newline inside a quoted commit message does not fabricate a segment boundary', () => {
  assert.deepStrictEqual(
    gitTargets('git commit -m "line one\nline two" && git push', '/repo'),
    [
      { action: 'commit', dir: '/repo' },
      { action: 'push', dir: '/repo' },
    ],
  );
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

test('separators inside quotes do not fabricate targets (double quotes)', () => {
  assert.deepStrictEqual(
    gitTargets('git commit -m "text && git -C /malicious push && more text"', '/repo'),
    [{ action: 'commit', dir: '/repo' }],
  );
});

test('separators inside quotes do not fabricate targets (single quotes, ; and |)', () => {
  assert.deepStrictEqual(
    gitTargets("git commit -m 'text ; git -C /malicious push | more text'", '/repo'),
    [{ action: 'commit', dir: '/repo' }],
  );
});

test('unresolvable cd forms poison the effective cwd — a following git commit yields no target', () => {
  assert.deepStrictEqual(gitTargets('cd && git commit -m "x"', '/repo'), []);
  assert.deepStrictEqual(gitTargets('cd - && git commit -m "x"', '/repo'), []);
  assert.deepStrictEqual(gitTargets('cd ~ && git commit -m "x"', '/repo'), []);
  assert.deepStrictEqual(gitTargets('cd "$HOME/x" && git commit -m "x"', '/repo'), []);
});

test('poisoned cwd + git -C <absolute plain path> is still provable', () => {
  assert.deepStrictEqual(
    gitTargets('cd && git -C /abs/path commit -m "x"', '/repo'),
    [{ action: 'commit', dir: '/abs/path' }],
  );
});

test('poisoned cwd then cd to an absolute plain path restores provability', () => {
  assert.deepStrictEqual(
    gitTargets('cd && cd /abs/known && git commit -m "x"', '/repo'),
    [{ action: 'commit', dir: '/abs/known' }],
  );
});

test('repeated -C flags stack cumulatively like real git', () => {
  assert.deepStrictEqual(gitTargets('git -C /a -C b commit -m "x"', '/repo'), [{ action: 'commit', dir: '/a/b' }]);
  assert.deepStrictEqual(gitTargets('git -C /a -C /c commit -m "x"', '/repo'), [{ action: 'commit', dir: '/c' }]);
});

test('-C value containing $ or ~ yields no target regardless of cwd state', () => {
  assert.deepStrictEqual(gitTargets('git -C "$HOME/x" commit -m "x"', '/repo'), []);
  assert.deepStrictEqual(gitTargets('git -C ~/x commit -m "x"', '/repo'), []);
});

test('while cwd is unknown, a relative cd keeps it unknown', () => {
  assert.deepStrictEqual(gitTargets('cd && cd sub && git commit -m "x"', '/repo'), []);
});

test('a cd argument with a backtick poisons the cwd', () => {
  assert.deepStrictEqual(gitTargets('cd `pwd` && git commit -m "x"', '/repo'), []);
});

test('a relative -C value while cwd is unknown yields no target', () => {
  assert.deepStrictEqual(gitTargets('cd && git -C sub commit -m "x"', '/repo'), []);
});

test('an escaped quote inside a double-quoted string does not close it (with -C)', () => {
  assert.deepStrictEqual(
    gitTargets('git commit -m "abc\\" && git -C /evil push "', '/repo'),
    [{ action: 'commit', dir: '/repo' }],
  );
});

test('an escaped quote inside a double-quoted string does not close it (no -C, cwd not fabricated)', () => {
  assert.deepStrictEqual(
    gitTargets('git commit -m "abc\\" && git push "', '/repo'),
    [{ action: 'commit', dir: '/repo' }],
  );
});

test('a doubled backslash before the closing quote is a literal backslash — the quote DOES close, so a following separator is a real command', () => {
  assert.deepStrictEqual(
    gitTargets('git commit -m "a\\\\" && git push', '/repo'),
    [
      { action: 'commit', dir: '/repo' },
      { action: 'push', dir: '/repo' },
    ],
  );
});

test('a cd argument containing an escaped quote is unresolvable and poisons cwd', () => {
  assert.deepStrictEqual(gitTargets('cd "pa\\"th" && git commit', '/repo'), []);
});

test('a -C value containing an escaped quote is unresolvable — no target', () => {
  assert.deepStrictEqual(gitTargets('git -C "we\\"ird" commit', '/repo'), []);
});

test('positive control: an unquoted separator after a simple quoted string still yields both targets', () => {
  assert.deepStrictEqual(gitTargets('git commit -m "x" && git push', '/repo'), [
    { action: 'commit', dir: '/repo' },
    { action: 'push', dir: '/repo' },
  ]);
});
