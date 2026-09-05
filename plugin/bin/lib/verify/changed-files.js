// plugin/bin/lib/verify/changed-files.js — the changed-file set the scope
// engine classifies (#1922), and the base it is measured from. Base
// resolution follows blast-radius-cli.js's posture: an explicit --base is
// verified as a commit, a stamp anchor is used only when it is an ancestor
// of HEAD, the integration branch prefers its origin/ remote-tracking ref,
// and an unresolvable base THROWS — never an empty set, which would clear
// every threshold and read as "nothing changed" ([IL-131]'s shape).
// Every git call goes through execImpl so tests inject a fake.
'use strict';

const { execFileSync } = require('child_process');

class ChangedFilesError extends Error {
  constructor(message) { super(message); this.name = 'ChangedFilesError'; }
}

function git(execImpl, args) {
  return String(execImpl('git', args, { encoding: 'utf8' }));
}

function tryGit(execImpl, args) {
  try { return git(execImpl, args); } catch { return null; }
}

function preferOriginRef(execImpl, integrationBranch) {
  if (integrationBranch.startsWith('origin/')) return integrationBranch;
  const candidate = `origin/${integrationBranch}`;
  return tryGit(execImpl, ['rev-parse', '--verify', '--quiet', `refs/remotes/${candidate}`]) === null
    ? integrationBranch : candidate;
}

function resolveBase({ stamp = null, integrationBranch = null, base = null, execImpl = execFileSync } = {}) {
  if (base) {
    const out = tryGit(execImpl, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]);
    if (out === null || out.trim() === '') throw new ChangedFilesError(`--base "${base}" does not resolve to a commit`);
    return out.trim();
  }
  const anchor = stamp && typeof stamp.sha === 'string'
    ? (typeof stamp.fullSha === 'string' ? stamp.fullSha : stamp.sha)
    : null;
  if (anchor && tryGit(execImpl, ['merge-base', '--is-ancestor', anchor, 'HEAD']) !== null) return anchor;
  let branch = integrationBranch;
  if (!branch) {
    const head = tryGit(execImpl, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    branch = head ? head.trim() : null;
  }
  if (!branch) throw new ChangedFilesError('could not resolve a base: no usable stamp anchor, no --integration-branch, and origin/HEAD is unset');
  const ref = preferOriginRef(execImpl, branch);
  const mb = tryGit(execImpl, ['merge-base', '--end-of-options', ref, 'HEAD']);
  if (mb === null || mb.trim() === '') {
    throw new ChangedFilesError(`could not resolve a base: no usable stamp anchor and no merge base of "${ref}" and HEAD`);
  }
  return mb.trim();
}

function norm(p) { return p.replace(/\\/g, '/'); }

function changedFiles({ base, execImpl = execFileSync }) {
  const set = new Set();
  const diff = git(execImpl, ['diff', '--name-status', '--end-of-options', `${base}..HEAD`]);
  for (const line of diff.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const status = cols[0];
    if (status.startsWith('R') || status.startsWith('C')) set.add(norm(cols[2]));
    else set.add(norm(cols[1]));
  }
  const status = git(execImpl, ['status', '--porcelain']);
  for (const line of status.split('\n')) {
    if (!line.trim()) continue;
    const entry = line.slice(3);
    const arrow = entry.indexOf(' -> ');
    set.add(norm(arrow === -1 ? entry : entry.slice(arrow + 4)));
  }
  return { base, files: [...set].sort() };
}

module.exports = { changedFiles, resolveBase, ChangedFilesError };
