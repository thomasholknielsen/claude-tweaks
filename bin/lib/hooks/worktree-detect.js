// bin/lib/hooks/worktree-detect.js — mechanical check for "is this path
// already inside an isolated git worktree?" Ports the same
// GIT_DIR != GIT_COMMON + submodule-guard heuristic
// superpowers:using-git-worktrees Step 0 uses, so the hook and the skill
// never disagree about what counts as isolated.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args, cwd) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return p; }
}

function nearestExistingDir(p) {
  let dir = path.resolve(p);
  try {
    if (fs.statSync(dir).isFile()) dir = path.dirname(dir);
  } catch {
    /* dir may not exist yet; fall through to the walk-up loop */
  }
  while (dir && !fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

// Single git subprocess spawn querying toplevel + git-dir + git-common-dir +
// superproject in one invocation instead of four separate spawns — every
// caller of this module needs both the repo root and the linked-worktree
// check, back to back, for the same path (pre-tool-use.js's
// worktree-required gate on every Edit/Write/NotebookEdit/commit,
// session-start.js's advisory nudge). `git rev-parse` accepts multiple query
// flags in one invocation; each prints one line, in order, except
// --show-superproject-working-tree which prints nothing at all when the
// path isn't a submodule — always requested last here so its absence never
// shifts the other three lines' positions.
function repoInfo(p) {
  const dir = nearestExistingDir(p);
  if (!dir) return { repoRoot: null, isLinkedWorktree: false };
  const out = git(
    ['rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir', '--show-superproject-working-tree'],
    dir,
  );
  if (!out) return { repoRoot: null, isLinkedWorktree: false }; // not a git repo at all
  const [top, gitDir, gitCommon, superproject] = out.split('\n');
  if (!top || !gitDir || !gitCommon) return { repoRoot: null, isLinkedWorktree: false };
  const isLinked = superproject
    ? false // submodule -> not an isolated worktree
    : safeReal(path.resolve(dir, gitDir)) !== safeReal(path.resolve(dir, gitCommon));
  return { repoRoot: safeReal(top), isLinkedWorktree: isLinked };
}

// fs-only walk-up looking for a .claude-tweaks/policy.yml, so callers can
// check "is there even a policy file to care about" WITHOUT forking git.
// Returns the directory containing the policy file, or null if none is
// found anywhere up the ancestor chain.
function findPolicyFile(p) {
  let dir = nearestExistingDir(p);
  while (dir) {
    if (fs.existsSync(path.join(dir, '.claude-tweaks', 'policy.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

module.exports = { nearestExistingDir, repoInfo, findPolicyFile };
