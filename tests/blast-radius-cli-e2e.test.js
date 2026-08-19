'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'plugin', 'bin', 'blast-radius.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Fixture: a repo with a main branch, a feature branch one behavior commit
// (plugin file) and one test commit ahead, plus a policy.yml naming a
// sensitive path.
function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blast-radius-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Test');
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'merge-sensitive-paths: secrets/*\n');
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'base');
  git(dir, 'checkout', '-b', 'feature');
  fs.writeFileSync(path.join(dir, 'impl.js'), 'x\ny\nz\n');
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tests', 'impl.test.js'), 'a\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'feature work');
  return dir;
}

test('e2e: success prints one JSON object with mergeBase, config, summary', () => {
  const dir = makeFixtureRepo();
  const res = spawnSync('node', [CLI, '--integration-branch', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.match(out.mergeBase, /^[0-9a-f]{40}$/);
  assert.strictEqual(out.summary.implFiles, 1);
  assert.strictEqual(out.summary.implLines, 3);
  assert.strictEqual(out.summary.testFiles, 1);
  assert.deepStrictEqual(out.config.mergeSensitivePaths, ['secrets/*']);
  assert.strictEqual(out.config.autoMergeMaxLines, 40);
});

test('e2e: unresolvable integration branch exits 1 with stderr and NO stdout', () => {
  const dir = makeFixtureRepo();
  const res = spawnSync('node', [CLI, '--integration-branch', 'no-such-branch'], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /blast-radius: could not resolve merge base/);
  assert.strictEqual(res.stdout, '', 'a resolution failure must never print a summary');
});

test('e2e: missing both base flags exits 1 with usage on stderr', () => {
  const dir = makeFixtureRepo();
  const res = spawnSync('node', [CLI], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /usage: blast-radius\.js/);
  assert.strictEqual(res.stdout, '');
});

test('e2e: --base pass-through uses the given commit', () => {
  const dir = makeFixtureRepo();
  const baseSha = git(dir, 'rev-parse', 'main').trim();
  const res = spawnSync('node', [CLI, '--base', baseSha], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stderr);
  assert.strictEqual(JSON.parse(res.stdout).mergeBase, baseSha);
});

// I-2 (#888 follow-up): a nonexistent --run dir must fail loud, not silently
// degrade to "no run-config overlay" — matching resolve-policy.js's convention.
test('e2e: nonexistent --run dir exits 1 with the bad-path message and NO stdout', () => {
  const dir = makeFixtureRepo();
  const badRunDir = path.join(dir, 'no-such-run-dir');
  const res = spawnSync(
    'node',
    [CLI, '--integration-branch', 'main', '--run', badRunDir],
    { cwd: dir, encoding: 'utf8' }
  );
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /blast-radius: --run dir does not exist or is not a directory: /);
  assert.strictEqual(res.stdout, '', 'a bad --run path must never print a summary');
});
