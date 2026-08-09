import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { freshRepo, seedFiles, applyPatch, seedLocalWorkRecord, seedGitRemote, seedBranch, walkFiles } from '../fixtures/git-fixtures.js';

test('freshRepo: creates an isolated repo with a HEAD commit', () => {
  const dir = freshRepo();
  const log = execFileSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.match(log, /init/);
});

test('seedFiles: writes and commits files', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/index.js': "module.exports = {};\n" });
  assert.ok(fs.existsSync(path.join(dir, 'src/index.js')));
  const log = execFileSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.match(log, /seed fixture files/);
});

test('applyPatch: applies a unified diff and commits it', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/a.js': 'line one\nline two\n' });
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'line one\nline TWO\n', 'utf8');
  const patch = execFileSync('git', ['-C', dir, 'diff'], { encoding: 'utf8' });
  execFileSync('git', ['-C', dir, 'checkout', '--', 'src/a.js']);
  applyPatch(dir, patch);
  const content = fs.readFileSync(path.join(dir, 'src/a.js'), 'utf8');
  assert.strictEqual(content, 'line one\nline TWO\n');
});

test('seedLocalWorkRecord: writes a record readable by local-store', () => {
  const dir = freshRepo();
  const record = seedLocalWorkRecord(dir, {
    slug: 'test-record',
    title: 'Test Record',
    facets: { stage: 'ready', risk: 'low' },
  });
  assert.strictEqual(record.title, 'Test Record');
  assert.strictEqual(record.facets.stage, 'ready');
  assert.ok(fs.existsSync(record.path));
});

// The fixture gap #157 filed: a fresh fixture has no remote, so any skill
// branching on `git remote get-url origin` (the learning-routing self-reference
// check) could not be exercised at all.
test('seedGitRemote: gives a fixture repo an origin that `git remote get-url` resolves', () => {
  const dir = freshRepo();
  assert.throws(
    () => execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: 'pipe' }),
    'a fresh fixture must start with no remote — otherwise this test cannot show the seeding did anything',
  );

  seedGitRemote(dir, 'https://github.com/thomasholknielsen/claude-tweaks.git');

  const url = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  assert.strictEqual(url, 'https://github.com/thomasholknielsen/claude-tweaks.git');
});

test('seedGitRemote: writes only .git/config, leaving the worktree clean and uncommitted', () => {
  const dir = freshRepo();
  const before = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  seedGitRemote(dir, 'https://example.invalid/some/repo.git');

  const status = execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' });
  assert.strictEqual(status, '', 'a remote lives in .git/config, so it must not dirty the worktree');
  const after = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.strictEqual(after, before, 'seeding a remote must not create a commit');
});

// seedBranch is what makes merge-check's fixture repo evaluable at all:
// merge-check Step 1 opens with `git merge-base {integration-branch} HEAD`,
// so a linear history (freshRepo + seedFiles only) yields it no diff to
// judge.
test('seedBranch: checks out a feature branch strictly ahead of the normalized base', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'README.md': 'base content\n' });

  seedBranch(dir, { name: 'feature', base: 'main', files: { 'feature.txt': 'new file\n' } });

  const current = execFileSync('git', ['-C', dir, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
  assert.strictEqual(current, 'feature');

  const mergeBase = execFileSync('git', ['-C', dir, 'merge-base', 'main', 'HEAD'], { encoding: 'utf8' }).trim();
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.ok(mergeBase, 'merge-base must resolve to a real commit');
  assert.notStrictEqual(mergeBase, head, 'the feature branch must be ahead of the base, not identical to it');

  const numstat = execFileSync('git', ['-C', dir, 'diff', '--numstat', 'main..HEAD'], { encoding: 'utf8' }).trim();
  const changedFiles = numstat.split('\n').map((line) => line.split('\t')[2]);
  assert.deepStrictEqual(changedFiles, ['feature.txt'], 'the diff must name exactly the seeded files');

  const mainReadme = execFileSync('git', ['-C', dir, 'show', 'main:README.md'], { encoding: 'utf8' });
  assert.strictEqual(mainReadme, 'base content\n', 'main must still exist and hold the base content');
});

test('walkFiles: recursively reads a directory into a flat {relPath: content} map', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': 'top', 'nested/b.txt': 'deep' });
  const files = walkFiles(path.join(dir));
  assert.strictEqual(files['a.txt'], 'top');
  assert.strictEqual(files['nested/b.txt'], 'deep');
  // .git is skipped: its contents are never seedable, and walking it races
  // git's background maintenance lockfiles into an intermittent ENOENT.
  assert.deepStrictEqual(Object.keys(files).filter((f) => f.startsWith('.git/')), []);
});
