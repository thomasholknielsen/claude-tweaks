// plugin/bin/lib/verify/changed-files.js — the changed-file set the scope
// engine classifies (#1922), and the base it is measured from. Base
// resolution follows blast-radius-cli.js's posture: an explicit --base is
// verified as a commit, a stamp anchor is used only when it is an ancestor
// of HEAD (and then canonicalized via rev-parse rather than trusted
// verbatim), the integration branch prefers its origin/ remote-tracking ref
// (preferOriginRef is imported from blast-radius-cli.js rather than
// duplicated), and an unresolvable base THROWS — never an empty set, which
// would clear every threshold and read as "nothing changed" ([IL-131]'s
// shape). Both git reads use `-z` so a C-quotable path (non-ASCII, containing
// a tab or newline) round-trips intact — git's default quoting would
// otherwise corrupt it. Every git call goes through execImpl so tests inject
// a fake.
'use strict';

const { execFileSync } = require('child_process');
const { preferOriginRef } = require('../blast-radius-cli.js');

class ChangedFilesError extends Error {
  constructor(message) { super(message); this.name = 'ChangedFilesError'; }
}

function git(execImpl, args) {
  return String(execImpl('git', args, { encoding: 'utf8' }));
}

function tryGit(execImpl, args) {
  try { return git(execImpl, args); } catch { return null; }
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
  if (anchor && tryGit(execImpl, ['merge-base', '--is-ancestor', anchor, 'HEAD']) !== null) {
    const canonical = tryGit(execImpl, ['rev-parse', '--verify', '--end-of-options', `${anchor}^{commit}`]);
    if (canonical === null || canonical.trim() === '') {
      throw new ChangedFilesError(`stamp anchor "${anchor}" is an ancestor of HEAD but does not resolve to a commit`);
    }
    return canonical.trim();
  }
  if (!integrationBranch) {
    throw new ChangedFilesError('could not resolve a base: no usable stamp anchor and no --integration-branch or --base given');
  }
  const ref = preferOriginRef((args) => git(execImpl, args), integrationBranch);
  const mb = tryGit(execImpl, ['merge-base', '--end-of-options', ref, 'HEAD']);
  if (mb === null || mb.trim() === '') {
    throw new ChangedFilesError(`could not resolve a base: no usable stamp anchor and no merge base of "${ref}" and HEAD`);
  }
  return mb.trim();
}

// `git diff --name-status -z`: a flat NUL-delimited stream — "STATUS\0path\0"
// per ordinary record, or "STATUS\0old\0new\0" for a rename/copy (status
// starts with R or C). No quoting is applied to paths in -z mode, unlike the
// default output which C-quotes non-ASCII bytes.
function parseDiffNameStatusZ(raw) {
  const tokens = raw.split('\0');
  const files = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i];
    if (status === '') { i += 1; continue; }
    if (status[0] === 'R' || status[0] === 'C') {
      files.push(tokens[i + 2]);
      i += 3;
    } else {
      files.push(tokens[i + 1]);
      i += 2;
    }
  }
  return files;
}

// `git status --porcelain -z`: each record is "XY path\0" — the space
// between the two-letter status and the path survives (only the trailing
// newline/rename-arrow separator is replaced by NUL) — except a rename or
// copy (R/C anywhere in XY), which is "XY new\0old\0": the NEW path comes
// first in -z mode, reversed from the "old -> new" order of the default
// (non-z) porcelain format.
function parseStatusPorcelainZ(raw) {
  const tokens = raw.split('\0');
  const files = [];
  let i = 0;
  while (i < tokens.length) {
    const entry = tokens[i];
    if (entry === '') { i += 1; continue; }
    const xy = entry.slice(0, 2);
    files.push(entry.slice(3));
    i += (xy.includes('R') || xy.includes('C')) ? 2 : 1;
  }
  return files;
}

function changedFiles({ base, execImpl = execFileSync }) {
  const set = new Set();
  const diff = git(execImpl, ['diff', '--name-status', '-z', '--end-of-options', `${base}..HEAD`]);
  for (const f of parseDiffNameStatusZ(diff)) set.add(f);
  // --untracked-files=all: an untracked directory reports each file inside
  // it individually rather than collapsing to the directory name.
  const status = git(execImpl, ['status', '--porcelain', '-z', '--untracked-files=all']);
  for (const f of parseStatusPorcelainZ(status)) set.add(f);
  return { base, files: [...set].sort() };
}

module.exports = { changedFiles, resolveBase, ChangedFilesError };
