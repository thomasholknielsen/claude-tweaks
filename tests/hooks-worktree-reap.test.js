'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseWorktreeList, isPidAlive, lockVerdict, isContentIdentical, reapWorktrees } = require('../bin/lib/hooks/worktree-reap');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

// gitRepo() runs a bare `git init`, so the initial branch is whatever the
// machine's init.defaultBranch says — `main` on some, `master` on others.
// Resolve it instead of hardcoding, or these tests pass on the author's
// machine and fail in CI for a reason unrelated to the code under test.
const defaultBranch = (repo) =>
  execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

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

test('isPidAlive: this process is alive', () => {
  assert.strictEqual(isPidAlive(process.pid), true);
});

test('isPidAlive: null and nonsense pids are not alive', () => {
  assert.strictEqual(isPidAlive(null), false);
  assert.strictEqual(isPidAlive(0), false);
  assert.strictEqual(isPidAlive(-1), false);
});

test('lockVerdict: unlocked is free', () => {
  assert.strictEqual(lockVerdict({ locked: false, pid: null }), 'free');
});

test('lockVerdict: locked with a live pid is in-use', () => {
  assert.strictEqual(lockVerdict({ locked: true, pid: process.pid }), 'in-use');
});

test('lockVerdict: locked with a dead pid is orphaned', () => {
  // 2^22 is above the default pid_max on both macOS and Linux, so no process
  // can hold it — a deterministic "definitely dead" pid.
  assert.strictEqual(lockVerdict({ locked: true, pid: 4194304 }), 'orphaned');
});

test('lockVerdict: locked with no recoverable pid is unknown, never orphaned', () => {
  assert.strictEqual(lockVerdict({ locked: true, pid: null }), 'unknown');
});

test('isContentIdentical: a branch with no diff against the integration branch is identical', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: main });
  execFileSync('git', ['checkout', '-q', base], { cwd: main });
  assert.strictEqual(isContentIdentical(main, 'feature', base), true);
});

test('isContentIdentical: a branch with a real change is not identical', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: main });
  fs.writeFileSync(path.join(main, 'new.txt'), 'x');
  execFileSync('git', ['add', 'new.txt'], { cwd: main });
  execFileSync('git', ['commit', '-q', '-m', 'add'], { cwd: main });
  execFileSync('git', ['checkout', '-q', base], { cwd: main });
  assert.strictEqual(isContentIdentical(main, 'feature', base), false);
});

test('isContentIdentical: a rebase-rewritten branch is still identical (the ancestry trap)', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: main });
  fs.writeFileSync(path.join(main, 'f.txt'), 'content');
  execFileSync('git', ['add', 'f.txt'], { cwd: main });
  // Commit SHAs are content-addressed at 1-second granularity, and
  // `cherry-pick` below inherits the original commit's AUTHOR date while
  // stamping a fresh COMMITTER date. If both commits happened to land in the
  // same wall-clock second (execFileSync calls are fast — a real, observed
  // failure, not theoretical), the cherry-picked commit would be
  // byte-identical to the original — same tree, parent, author+date,
  // committer+date, message — producing the SAME sha and turning this test's
  // own precondition (NOT an ancestor) into a random, load-independent
  // failure (#185 review, Important 2). Pinning explicit, distinct dates via
  // GIT_AUTHOR_DATE/GIT_COMMITTER_DATE removes the race outright — no sleep,
  // no reliance on the clock ticking over.
  execFileSync('git', ['commit', '-q', '-m', 'feature work'], {
    cwd: main,
    env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00', GIT_COMMITTER_DATE: '2020-01-01T00:00:00' },
  });
  // Simulate `gh pr merge --rebase`: the integration branch gains the same
  // content under a different sha, so the branch is NOT an ancestor of it.
  // cherry-pick copies the AUTHOR date from the source commit automatically;
  // only the COMMITTER date needs to be forced distinct here.
  execFileSync('git', ['checkout', '-q', base], { cwd: main });
  execFileSync('git', ['cherry-pick', 'feature'], {
    cwd: main,
    env: { ...process.env, GIT_COMMITTER_DATE: '2020-01-02T00:00:00' },
  });

  const ancestor = (() => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', 'feature', base], { cwd: main });
      return true;
    } catch { return false; }
  })();
  assert.strictEqual(ancestor, false, 'precondition: rebase-merge breaks ancestry');
  assert.strictEqual(isContentIdentical(main, 'feature', base), true);
});

test('isContentIdentical: an unresolvable branch is not identical', () => {
  const main = gitRepo();
  assert.strictEqual(isContentIdentical(main, 'no-such-branch', defaultBranch(main)), false);
});

test('reapWorktrees: removes a merged, clean, unlocked linked worktree', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  const before = fs.existsSync(wt);
  assert.strictEqual(before, true);

  const res = reapWorktrees({ cwd: main, integration: base });
  // linkedWorktreeOf() already returns fs.realpathSync(wt), so `wt` is
  // already canonical here — re-resolving it via realpathSync would throw
  // ENOENT, since reapWorktrees() has already deleted the directory by now.
  assert.deepStrictEqual(res.reaped, [wt]);
  assert.strictEqual(fs.existsSync(wt), false);
});

test('reapWorktrees: never removes the main checkout', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const res = reapWorktrees({ cwd: main, integration: base });
  assert.ok(!res.reaped.includes(fs.realpathSync(main)));
});

test('reapWorktrees: skips a worktree holding unmerged commits', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  fs.writeFileSync(path.join(wt, 'x.txt'), 'x');
  execFileSync('git', ['add', 'x.txt'], { cwd: wt });
  execFileSync('git', ['commit', '-q', '-m', 'unmerged'], { cwd: wt });

  const res = reapWorktrees({ cwd: main, integration: base });
  assert.deepStrictEqual(res.reaped, []);
  assert.strictEqual(fs.existsSync(wt), true);
  assert.match(res.skipped.find((s) => s.path === fs.realpathSync(wt)).reason, /not merged/);
});

test('reapWorktrees: skips a worktree carrying untracked or ignored content', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  fs.writeFileSync(path.join(wt, 'scratch-notes.md'), 'decision pending');

  const res = reapWorktrees({ cwd: main, integration: base });
  assert.deepStrictEqual(res.reaped, []);
  assert.strictEqual(fs.existsSync(wt), true);
  assert.match(res.skipped.find((s) => s.path === fs.realpathSync(wt)).reason, /local content/);
});

test('reapWorktrees: never removes the worktree the caller is standing in', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  const res = reapWorktrees({ cwd: wt, integration: base });
  assert.deepStrictEqual(res.reaped, []);
  assert.strictEqual(fs.existsSync(wt), true);
});

// The five tests above all exercise freshly-created, never-locked worktrees,
// so lockVerdict() always evaluates to 'free' inside reapWorktrees() itself —
// lockVerdict is well covered in isolation against synthetic {locked, pid}
// fixtures (above), but nothing proved the *wiring* at the loop's own
// verdict-dispatch: a regression that inverted or dropped that condition
// would still pass every other test here. These two drive 'in-use' and
// 'orphaned' through reapWorktrees() itself, via a real `git worktree lock`.

test('reapWorktrees: a worktree locked by a live session is skipped, never removed', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  // process.pid is guaranteed alive for the duration of this test.
  execFileSync(
    'git',
    ['worktree', 'lock', '--reason', `claude session test (pid ${process.pid} start Fri Aug  7 14:40:15 2026)`, wt],
    { cwd: main },
  );

  const res = reapWorktrees({ cwd: main, integration: base });
  assert.deepStrictEqual(res.reaped, []);
  assert.strictEqual(fs.existsSync(wt), true);
  assert.match(res.skipped.find((s) => s.path === fs.realpathSync(wt)).reason, /in use/);
});

test('reapWorktrees: a worktree locked by a dead pid is unlocked and reaped', () => {
  const main = gitRepo();
  const base = defaultBranch(main);
  const wt = linkedWorktreeOf(main);
  // 2^22 is above the default pid_max on both macOS and Linux — the same
  // deterministic "definitely dead" pid the lockVerdict tests above use.
  execFileSync(
    'git',
    ['worktree', 'lock', '--reason', 'claude session test (pid 4194304 start Fri Aug  7 09:00:00 2026)', wt],
    { cwd: main },
  );

  const res = reapWorktrees({ cwd: main, integration: base });
  // Reaching `reaped` at all proves the `git worktree unlock` step ran first —
  // `git worktree remove` refuses outright on a still-locked worktree.
  assert.deepStrictEqual(res.reaped, [wt]);
  assert.strictEqual(fs.existsSync(wt), false);
});
