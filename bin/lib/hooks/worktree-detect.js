// bin/lib/hooks/worktree-detect.js — mechanical check for "is this path
// already inside an isolated git worktree?" Ports the same
// GIT_DIR != GIT_COMMON + submodule-guard heuristic
// superpowers:using-git-worktrees Step 0 uses, so the hook and the skill
// never disagree about what counts as isolated.
'use strict';
const fs = require('fs');
const path = require('path');
const { runGit, isIndeterminate } = require('./git-exec');

// Returns null (not the original, unresolved path) on failure — matching
// pre-tool-use.js's own identically-named/-purposed safeReal(). This
// project's fail-open invariant ("a recorded worktree whose path no longer
// exists resolves to allow") depends on unresolvable paths being falsy;
// returning the raw path here would let repoInfo() below hand back a
// truthy-looking-but-unverified repoRoot/isLinkedWorktree if a directory is
// torn down between the `git rev-parse` call and this realpath call.
function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return null; }
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
// Returns { repoRoot, isLinkedWorktree, indeterminate }.
//
// `indeterminate` is the third state this function used to collapse into the
// second (#134). A null `repoRoot` previously meant BOTH "git answered, and the
// answer is: not a git repo" (permanent, knowable) and "git never answered"
// (transient — a timeout under load, a refused fork). Callers gating on
// `!repoRoot` therefore treated a load spike identically to a definitive
// negative, which is how the worktree.always gate came to stop enforcing while
// the machine was busy.
//
//   indeterminate: false -> repoRoot is trustworthy (a path, or null meaning
//                           git genuinely says this is not a repo)
//   indeterminate: true  -> repoRoot is null because the question went
//                           unanswered; it carries NO information either way
// opts is forwarded verbatim to runGit — tests use { timeoutMs } to force the
// indeterminate branch deterministically. Production callers omit it.
function repoInfo(p, opts = {}) {
  const dir = nearestExistingDir(p);
  // A path with no existing ancestor is a definitive negative, not a failure to
  // look: there is nothing on disk to be a repo.
  if (!dir) return { repoRoot: null, isLinkedWorktree: false, indeterminate: false };
  const { stdout: out, failure } = runGit(
    ['rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir', '--show-superproject-working-tree'],
    dir,
    opts,
  );
  if (failure) {
    // git-error == git ran and said "not a git repository": a real answer.
    // timeout/spawn/no-git == we never got one.
    return { repoRoot: null, isLinkedWorktree: false, indeterminate: isIndeterminate(failure) };
  }
  const [top, gitDir, gitCommon, superproject] = out.split('\n');
  // Exit 0 but missing lines: git answered something we cannot parse. Treat as
  // unanswered rather than as a negative — we have no basis for a negative.
  if (!top || !gitDir || !gitCommon) {
    return { repoRoot: null, isLinkedWorktree: false, indeterminate: true };
  }
  const isLinked = superproject
    ? false // submodule -> not an isolated worktree
    : safeReal(path.resolve(dir, gitDir)) !== safeReal(path.resolve(dir, gitCommon));
  const repoRoot = safeReal(top);
  // The second, independent route to a null repoRoot: git answered fine, but
  // realpath on its answer failed (the directory went away between the two
  // calls). Also a failure to determine, not a negative.
  if (!repoRoot) return { repoRoot: null, isLinkedWorktree: false, indeterminate: true };
  return { repoRoot, isLinkedWorktree: isLinked, indeterminate: false };
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

module.exports = { nearestExistingDir, repoInfo, findPolicyFile, safeReal };
