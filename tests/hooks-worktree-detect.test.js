'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { nearestExistingDir, repoInfo, findPolicyFile } = require('../bin/lib/hooks/worktree-detect');

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

test('repoInfo: main checkout returns its toplevel and isLinkedWorktree: false', () => {
  const dir = gitRepo();
  assert.deepStrictEqual(repoInfo(dir), { repoRoot: dir, isLinkedWorktree: false });
});

test('repoInfo: a linked worktree returns its own toplevel and isLinkedWorktree: true', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.deepStrictEqual(repoInfo(wt), { repoRoot: wt, isLinkedWorktree: true });
});

test('repoInfo: non-git directory returns repoRoot: null, isLinkedWorktree: false', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-nongit3-'));
  assert.deepStrictEqual(repoInfo(dir), { repoRoot: null, isLinkedWorktree: false });
});

test('repoInfo: a submodule is treated as not isolated', () => {
  const outer = gitRepo();
  const inner = gitRepo();
  execFileSync('git', ['-C', outer, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner, 'sub']);
  const subPath = path.join(outer, 'sub');
  const info = repoInfo(subPath);
  assert.strictEqual(info.isLinkedWorktree, false);
  assert.strictEqual(info.repoRoot, path.join(outer, 'sub'));
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
