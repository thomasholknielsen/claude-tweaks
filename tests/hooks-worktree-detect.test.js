'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { nearestExistingDir, repoRootFor, isLinkedWorktree, findPolicyFile } = require('../bin/lib/hooks/worktree-detect');

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

function linkedWorktreeOf(main) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-parent-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${path.basename(parent)}`]);
  return fs.realpathSync(wt);
}

test('nearestExistingDir: existing directory returns itself', () => {
  const dir = gitRepo();
  assert.strictEqual(nearestExistingDir(dir), dir);
});

test('nearestExistingDir: existing file returns its parent directory', () => {
  const dir = gitRepo();
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'x');
  assert.strictEqual(nearestExistingDir(file), dir);
});

test('nearestExistingDir: not-yet-existing nested path walks up to the nearest existing ancestor', () => {
  const dir = gitRepo();
  const target = path.join(dir, 'new', 'nested', 'file.txt');
  assert.strictEqual(nearestExistingDir(target), dir);
});

test('nearestExistingDir: falls back to a filesystem root when no other ancestor exists', () => {
  const result = nearestExistingDir('/this/path/should/not/exist/anywhere/xyz');
  assert.strictEqual(result, path.parse(result).root);
});

test('repoRootFor: resolves the git toplevel for a path inside the repo', () => {
  const dir = gitRepo();
  assert.strictEqual(repoRootFor(path.join(dir, 'a.txt')), dir);
});

test('repoRootFor: non-git directory returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-nongit-'));
  assert.strictEqual(repoRootFor(dir), null);
});

test('isLinkedWorktree: main checkout is not isolated', () => {
  const dir = gitRepo();
  assert.strictEqual(isLinkedWorktree(dir), false);
});

test('isLinkedWorktree: a linked worktree is isolated', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(isLinkedWorktree(wt), true);
});

test('isLinkedWorktree: non-git directory is not isolated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-nongit2-'));
  assert.strictEqual(isLinkedWorktree(dir), false);
});

test('isLinkedWorktree: a submodule is treated as not isolated', () => {
  const outer = gitRepo();
  const inner = gitRepo();
  execFileSync('git', ['-C', outer, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner, 'sub']);
  const subPath = path.join(outer, 'sub');
  assert.strictEqual(isLinkedWorktree(subPath), false);
});

test('findPolicyFile: no policy file anywhere in the ancestor chain returns null', () => {
  const dir = gitRepo();
  assert.strictEqual(findPolicyFile(path.join(dir, 'a.txt')), null);
});

test('findPolicyFile: policy file present at the target\'s own directory returns that directory', () => {
  const dir = gitRepo();
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'worktree.always: true\n');
  assert.strictEqual(findPolicyFile(path.join(dir, 'a.txt')), dir);
});

test('findPolicyFile: policy file present several directories up returns that ancestor directory', () => {
  const dir = gitRepo();
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'worktree.always: true\n');
  const nested = path.join(dir, 'a', 'b', 'c');
  fs.mkdirSync(nested, { recursive: true });
  const target = path.join(nested, 'file.txt');
  assert.strictEqual(findPolicyFile(target), dir);
  assert.notStrictEqual(findPolicyFile(target), nested);
});
