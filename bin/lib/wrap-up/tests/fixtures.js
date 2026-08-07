'use strict';

// Frozen `git reflog --date=iso` output. Deliberately covers: a fast-forward
// merge (routine) vs. a real merge commit (report-worthy); a multi-entry rebase
// that must collapse to ONE row via its (finish) entry; reset, cherry-pick,
// revert, amend; checkout/pull/commit as routine; and remote-tracking entries
// where `update by push` is report-worthy but `fetch` is not.
const HEAD_REFLOG = [
  'e4405303 HEAD@{2026-08-07 15:46:42 +0200}: merge origin/main: Fast-forward',
  'd4e5f6a1 HEAD@{2026-08-07 15:40:11 +0200}: rebase (finish): returning to refs/heads/feature-x',
  'c3d4e5f6 HEAD@{2026-08-07 15:40:10 +0200}: rebase (pick): Add the third thing',
  'b2c3d4e5 HEAD@{2026-08-07 15:40:09 +0200}: rebase (pick): Add the second thing',
  'a1b2c3d4 HEAD@{2026-08-07 15:40:08 +0200}: rebase (start): checkout origin/dev',
  '90a1b2c3 HEAD@{2026-08-07 14:02:00 +0200}: reset: moving to HEAD~1',
  '8f90a1b2 HEAD@{2026-08-07 13:31:00 +0200}: cherry-pick: Bring over the fix',
  '7e8f90a1 HEAD@{2026-08-07 13:02:00 +0200}: revert: Revert "Add the bad thing"',
  '6d7e8f90 HEAD@{2026-08-07 12:15:00 +0200}: commit (amend): Fix the message',
  '5c6d7e8f HEAD@{2026-08-07 11:47:00 +0200}: merge feature-y: Merge made by the \'ort\' strategy.',
  '4b5c6d7e HEAD@{2026-08-07 11:02:00 +0200}: checkout: moving from main to feature-x',
  '3a4b5c6d HEAD@{2026-08-07 10:30:00 +0200}: pull: Fast-forward',
  '2938a4b5 HEAD@{2026-08-07 10:01:00 +0200}: commit: Add the first thing',
].join('\n');

const REMOTE_REFLOG = [
  'd429e514 refs/remotes/origin/main@{2026-08-07 18:08:54 +0200}: fetch origin main: fast-forward',
  '7346175d refs/remotes/origin/main@{2026-08-07 17:33:10 +0200}: update by push',
  'a6de5ec5 refs/remotes/origin/main@{2026-08-07 17:16:48 +0200}: fetch origin --quiet: fast-forward',
].join('\n');

// A rebase that replayed 12 commits — asserts collapse yields exactly one row.
const TWELVE_COMMIT_REBASE = [
  'ffff0000 HEAD@{2026-08-07 16:00:12 +0200}: rebase (finish): returning to refs/heads/big',
  ...Array.from({ length: 12 }, (_, i) =>
    `eeee00${String(i).padStart(2, '0')} HEAD@{2026-08-07 16:00:${String(11 - i).padStart(2, '0')} +0200}: rebase (pick): Commit ${i + 1}`),
  'dddd0000 HEAD@{2026-08-07 15:59:59 +0200}: rebase (start): checkout origin/main',
].join('\n');

module.exports = { HEAD_REFLOG, REMOTE_REFLOG, TWELVE_COMMIT_REBASE };
