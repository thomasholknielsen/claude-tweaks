// bin/lib/wrap-up/state.js — read the repository facts the wrap-up State block
// asserts, so they are measured rather than recalled.
//
// Every field is present on the returned object even when unknown (null). A
// field that disappears when it cannot be determined reads as an absent fact
// rather than an unknown one — which is how a report once claimed work had
// landed when it had only been committed locally.
'use strict';

const { execFileSync } = require('node:child_process');

function defaultRunner(cwd) {
  return (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function readState({ cwd, since, run } = {}) {
  const git = run || defaultRunner(cwd);
  const base = {
    isRepo: false, branch: null, detachedAt: null, upstream: null,
    ahead: null, behind: null, pushed: false, commitsInScope: null, linkedWorktree: false,
  };
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') return base;

  const branchRaw = git(['branch', '--show-current']);
  const branch = branchRaw ? branchRaw : null;
  const detachedAt = branch ? null : git(['rev-parse', '--short', 'HEAD']);

  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  let ahead = null;
  let behind = null;
  if (upstream) {
    // `--left-right --count @{u}...HEAD`: left is upstream-only (behind),
    // right is local-only (ahead).
    const counts = git(['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    if (counts) {
      const [b, a] = counts.split(/\s+/);
      behind = toInt(b);
      ahead = toInt(a);
    }
  }

  const commitsInScope = since ? toInt(git(['rev-list', '--count', `${since}..HEAD`])) : null;
  const gitDir = git(['rev-parse', '--git-dir']);
  const commonDir = git(['rev-parse', '--git-common-dir']);

  return {
    isRepo: true,
    branch,
    detachedAt: detachedAt || null,
    upstream: upstream || null,
    ahead,
    behind,
    // Pushed requires a known upstream AND nothing ahead of it. Absent an
    // upstream there is nowhere for the work to have gone, so it is unpushed —
    // not unknown. But WITH an upstream, a failed ahead/behind read must stay
    // null rather than collapse to a definite false — an unmeasured push state
    // is exactly the unknown this module exists to keep representable.
    pushed: upstream ? (ahead === null ? null : ahead === 0) : false,
    commitsInScope,
    linkedWorktree: Boolean(gitDir && commonDir && gitDir !== commonDir),
  };
}

module.exports = { readState };
