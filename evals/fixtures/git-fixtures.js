// Fixture setup helpers for eval scenarios. Extends the mkdtemp+git-init+seed-
// commit pattern already used by tests/helpers/git-fixtures.js at the repo
// root, scoped to evals/ so a scenario's fixture repo never touches the real
// working tree. seedLocalWorkRecord writes through the real local-files
// driver (plugin/bin/lib/issues/local-store.js) directly, so fixture records can
// never drift from the format claude-tweaks skills actually read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRecord, defaultFacets } from '../../plugin/bin/lib/issues/local-store.js';
import { TIERS } from '../../plugin/bin/lib/issues/record.js';

const TIER_FACET_KEYS = ['risk', 'size'];

export function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-eval-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'eval@claude-tweaks.local']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'claude-tweaks-eval']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

export function seedFiles(dir, files, message = 'seed fixture files') {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', message, '-q']);
}

export function applyPatch(dir, patchText, message = 'apply planted patch') {
  const patchPath = path.join(dir, '.eval-patch.diff');
  fs.writeFileSync(patchPath, patchText, 'utf8');
  execFileSync('git', ['-C', dir, 'apply', patchPath]);
  fs.unlinkSync(patchPath);
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', message, '-q']);
}

// Creates a feature branch diverging from an integration branch, with its own
// commit on top. `git branch -M base` first normalizes the initial branch
// name — git's default init branch varies by host config (main vs master),
// and every consumer of this helper needs a deterministic integration-branch
// name to resolve `git merge-base`/`git diff` against. The feature branch is
// then checked out and given one commit, so it stays strictly ahead of
// `base`: `git merge-base {base} HEAD` resolves to `base`'s tip and
// `git diff --numstat {base}..HEAD` is exactly the seeded change, without
// needing both sides to advance independently.
export function seedBranch(dir, { name, base = 'main', files = {}, message = 'seed branch commit' }) {
  execFileSync('git', ['-C', dir, 'branch', '-M', base]);
  execFileSync('git', ['-C', dir, 'checkout', '-q', '-b', name]);
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', message, '-q']);
}

// Gives a fixture repo an `origin` remote. Needed by any scenario whose skill
// branches on where the repo under test actually lives — the learning-routing
// self-reference check (`git remote get-url origin`, see
// skills/_shared/learning-routing.md) is the first such consumer: it collapses
// a D5 upstream verdict to a local record when origin IS claude-tweaks.
//
// This is its own seed step rather than a patch because the two existing ones
// structurally cannot reach a remote: local-record only writes under specs/,
// and applyPatch's `git apply` hard-refuses any diff touching .git/ ("error:
// invalid path '.git/config'", exit 128). A remote lives in .git/config, never
// in the worktree, so nothing is committed here and `git status` stays clean.
//
// No network is ever contacted — `git remote add` only writes config, and the
// eval sandbox blocks outbound traffic anyway (runner.js's
// managedSettings.sandbox sets network.allowedDomains to []). A fixture URL
// need not resolve to a real repository.
export function seedGitRemote(dir, url, name = 'origin') {
  execFileSync('git', ['-C', dir, 'remote', 'add', name, url]);
}

// Rejects a facet key/value shape a real record could never carry — a typo'd
// key or an invalid tier value would otherwise write silently (local-store's
// createRecord serializes only known keys, so an unknown one vanishes with no
// error, and a scenario that seeded it never actually tested what it thought
// it did).
function assertKnownFacets(facets) {
  const known = new Set(Object.keys(defaultFacets()));
  for (const key of Object.keys(facets)) {
    if (!known.has(key)) {
      throw new Error(`seedLocalWorkRecord: unknown facet key "${key}" — not part of the shared facet shape (defaultFacets())`);
    }
  }
  for (const key of TIER_FACET_KEYS) {
    const value = facets[key];
    if (value != null && !TIERS.includes(value)) {
      throw new Error(`seedLocalWorkRecord: facet "${key}" has invalid tier value "${value}" — must be one of ${TIERS.join('|')}`);
    }
  }
}

export function seedLocalWorkRecord(dir, { slug, title, body = '', facets = {} }) {
  assertKnownFacets(facets);
  const specsDir = path.join(dir, 'specs');
  const record = createRecord(specsDir, { slug, title, body, facets: { ...defaultFacets(), ...facets } });
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', `seed local work record: ${title}`, '-q']);
  return record;
}

// Manual recursive walk (not fs.readdirSync's `recursive` option, which needs
// Node 20.1+ — this repo targets Node 18+) -> flat {relPath: content} map.
//
// .git is skipped. Its contents are never wanted: the only consumer is
// seedFiles, which writes each entry back out and `git add`s it, and git
// refuses to track paths under .git anyway. Walking it is also racy — git's
// background maintenance creates and deletes lockfiles under .git/objects, so
// a readdirSync/readFileSync pair straddling one dies with ENOENT on a file
// that existed a moment earlier.
export function walkFiles(dir, baseDir = dir) {
  const result = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === '.git') {
      continue;
    } else if (entry.isDirectory()) {
      Object.assign(result, walkFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath);
      result[relPath] = fs.readFileSync(fullPath, 'utf8');
    }
  }
  return result;
}
