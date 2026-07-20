'use strict';
// Shared git-repo test fixtures.
//
// tests/hooks-worktree-detect.test.js's `gitRepo()`/`linkedWorktreeOf()` were
// byte-for-byte copies of the same helpers in tests/hooks-pre-tool-use.test.js
// (differing only in the mkdtemp prefix), and the two had already silently
// drifted — this file's `gitRepo()` does an initial empty commit,
// hooks-pre-tool-use.test.js's does not, forcing a second `gitRepoWithCommit()`
// wrapper there to get the same behavior. Centralizing here means a future
// change to how these fixtures are built (e.g. a `git worktree add` flag
// change) only needs to land once.
//
// Only tests/hooks-worktree-detect.test.js consumes this today. The
// duplication described in the review finding also recurs in
// tests/hooks-pre-tool-use.test.js, tests/hooks-dispatcher.test.js,
// tests/hooks-session-start.test.js, and tests/policy.test.js, but migrating
// those is out of scope here — no task in this plan claims them for this
// finding, and this task's own scope is tests/hooks-worktree-detect.test.js.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// A git repo initialized with one empty commit, so it always has a HEAD.
function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

// A linked worktree of `main` (itself created via gitRepo()).
function linkedWorktreeOf(main) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-parent-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${path.basename(parent)}`]);
  return fs.realpathSync(wt);
}

module.exports = { gitRepo, linkedWorktreeOf };
