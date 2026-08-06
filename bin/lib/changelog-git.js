'use strict';

// Reconstruct which plugin versions actually shipped, from git.
//
// "Shipped" means: a value the `version` field in .claude-plugin/plugin.json
// held at the tip of the release branch. The marketplace `source` is an
// unpinned git URL, so an install tracks that branch's HEAD — every distinct
// value the tip reported is a build someone could be running, and is therefore
// a build the changelog owes an entry.
//
// Walking `git log --first-parent -- <manifest>` instead would be wrong in a
// way that is easy to miss: it reports the bump commit sitting on a side
// branch, not the value the tip took when that branch merged. Those disagree
// whenever two sessions bump concurrently, which is this repo's normal working
// mode. Only the first-parent chain of the release branch answers "what did an
// install report", so that is what this walks.

const { execFileSync, spawnSync } = require('node:child_process');

const MANIFEST_PATH = '.claude-plugin/plugin.json';
const REF_PREFERENCE = ['origin/main', 'main', 'HEAD'];

function git(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// The release branch, by preference. origin/main is the published truth; main
// is the local stand-in; HEAD is the last resort so a detached or renamed
// checkout still reports something rather than nothing.
function resolveRef(repoRoot) {
  for (const ref of REF_PREFERENCE) {
    try {
      git(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return ref;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// Whether this checkout can answer the question at all. A shallow clone or a
// tarball install has no history to walk, and the honest response there is
// "unknown", never "no gaps" — a coverage check that silently passes on an
// empty history is worse than no check.
function historyAvailable(repoRoot) {
  const ref = resolveRef(repoRoot);
  if (!ref) return { ok: false, reason: 'no git ref (origin/main, main or HEAD) resolves' };
  try {
    const shallow = git(repoRoot, ['rev-parse', '--is-shallow-repository']).trim();
    if (shallow === 'true') return { ok: false, reason: 'shallow clone — history is truncated' };
  } catch {
    return { ok: false, reason: 'not a git repository' };
  }
  return { ok: true, ref };
}

// Every distinct version the tip reported, oldest first, with the commit range
// that carried it. Reads each commit's manifest blob through one
// `cat-file --batch` process rather than one `git show` per commit.
function shippedVersionRuns(repoRoot, ref) {
  const lines = git(repoRoot, ['rev-list', '--first-parent', '--format=%H\t%ad\t%s', '--date=short', ref])
    .trim()
    .split('\n')
    .filter((l) => l && !l.startsWith('commit '));
  const commits = lines.map((l) => {
    const [hash, date, ...rest] = l.split('\t');
    return { hash, date, subject: rest.join('\t') };
  });
  if (commits.length === 0) return [];

  const batch = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: commits.map((c) => `${c.hash}:${MANIFEST_PATH}`).join('\n') + '\n',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (batch.status !== 0) throw new Error(`git cat-file --batch failed: ${batch.stderr}`);

  // Batch stream framing: "<sha> <type> <size>\n<payload>\n", or "<spec> missing\n"
  // for a commit predating the manifest.
  const buf = batch.stdout;
  const versions = [];
  let off = 0;
  for (let i = 0; i < commits.length; i++) {
    const nl = buf.indexOf(0x0a, off);
    if (nl === -1) break;
    const header = buf.slice(off, nl).toString('utf8');
    off = nl + 1;
    if (header.endsWith(' missing')) {
      versions.push(null);
      continue;
    }
    const size = Number(header.split(' ')[2]);
    const payload = buf.slice(off, off + size).toString('utf8');
    off += size + 1;
    try {
      versions.push(JSON.parse(payload).version || null);
    } catch {
      versions.push(null);
    }
  }

  const ordered = commits.map((c, i) => ({ ...c, version: versions[i] })).reverse();
  const runs = [];
  for (const c of ordered) {
    if (!c.version) continue;
    const last = runs[runs.length - 1];
    if (last && last.version === c.version) {
      last.commits.push(c);
      continue;
    }
    runs.push({ version: c.version, date: c.date, commits: [c] });
  }
  return runs;
}

// Distinct shipped versions. A version that shipped, was rolled back, and
// shipped again (6.24.0 did, in July 2026) is one entry's worth of history,
// not two, so this dedupes while shippedVersionRuns above keeps both spans.
function shippedVersions(repoRoot, ref) {
  return [...new Set(shippedVersionRuns(repoRoot, ref).map((r) => r.version))];
}

module.exports = { historyAvailable, resolveRef, shippedVersionRuns, shippedVersions, MANIFEST_PATH };
