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

function repoRootFor(p) {
  const dir = nearestExistingDir(p);
  if (!dir) return null;
  const top = git(['rev-parse', '--show-toplevel'], dir);
  return top ? safeReal(top) : null;
}

function isLinkedWorktree(p) {
  const dir = nearestExistingDir(p);
  if (!dir) return false;
  const gitDir = git(['rev-parse', '--git-dir'], dir);
  const gitCommon = git(['rev-parse', '--git-common-dir'], dir);
  if (!gitDir || !gitCommon) return false; // not a git repo at all
  const superproject = git(['rev-parse', '--show-superproject-working-tree'], dir);
  if (superproject) return false; // submodule -> not an isolated worktree
  return safeReal(path.resolve(dir, gitDir)) !== safeReal(path.resolve(dir, gitCommon));
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

module.exports = { nearestExistingDir, repoRootFor, isLinkedWorktree, findPolicyFile };
