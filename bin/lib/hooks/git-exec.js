// bin/lib/hooks/git-exec.js — the one execFileSync('git', ...) spawn wrapper
// shared by every hooks/ module that needs to ask git a question (
// worktree-detect.js, pre-tool-use.js, post-tool-use.js). Previously
// hand-copied verbatim in each of those files; a future fix to the shared
// contract (e.g. widening the 3000ms timeout after a real timeout incident,
// or capturing stderr for debugging a hook failure) now only needs to land
// once instead of being hunted down in every copy.
'use strict';
const { execFileSync } = require('child_process');

// Runs `git -C <cwd> <args>`, returning trimmed stdout, or null on any
// failure (non-git dir, git not installed, timeout, non-zero exit, ...).
// Ambiguity resolves to null so every caller's own "cannot prove -> allow"
// fail-open logic sees a consistent falsy signal.
function execGit(args, cwd) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

module.exports = { execGit };
