import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { freshRepo, seedFiles, applyPatch, seedLocalWorkRecord, seedGitRemote, walkFiles } from '../fixtures/git-fixtures.js';

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

// Guards the regression a spec-217 rename actually produced: a scenario seeded
// the dead key `facets.effort`, which local-store's createRecord silently
// dropped, collapsing a scored-vs-unscored test distinction with nothing
// failing. An unknown key must now throw instead of vanishing.
test('seedLocalWorkRecord: throws on an unknown facet key instead of silently dropping it', () => {
  const dir = freshRepo();
  assert.throws(
    () => seedLocalWorkRecord(dir, { slug: 'bad', title: 'Bad', facets: { effort: 'small' } }),
    /unknown facet key "effort"/,
  );
});

test('seedLocalWorkRecord: throws on an invalid tier value for risk/size', () => {
  const dir = freshRepo();
  assert.throws(
    () => seedLocalWorkRecord(dir, { slug: 'bad', title: 'Bad', facets: { risk: 'small' } }),
    /invalid tier value "small"/,
  );
  assert.throws(
    () => seedLocalWorkRecord(dir, { slug: 'bad2', title: 'Bad2', facets: { size: 'huge' } }),
    /invalid tier value "huge"/,
  );
});

test('seedLocalWorkRecord: still accepts every valid tier value for risk and size', () => {
  const dir = freshRepo();
  for (const tier of ['low', 'medium', 'high']) {
    const record = seedLocalWorkRecord(dir, {
      slug: `ok-${tier}`,
      title: `OK ${tier}`,
      facets: { risk: tier, size: tier },
    });
    assert.strictEqual(record.facets.risk, tier);
    assert.strictEqual(record.facets.size, tier);
  }
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
