'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isWorktreeAlwaysOn } = require('../bin/lib/policy');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-policy-'));
}
function writePolicy(repo, content) {
  const dir = path.join(repo, '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.yml'), content);
}

test('missing policy file -> false', () => {
  assert.strictEqual(isWorktreeAlwaysOn(tmpRepo()), false);
});

test('worktree.always: true -> true', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('worktree.always: false -> false', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: false\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('unrelated keys and near-miss lines -> false', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'issues.autonomous-eligibility: any\nworktree.something-else: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('tolerates extra whitespace around the value', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always:    true  \n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('the key can appear alongside other policy lines in either order', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'issues.autonomous-eligibility: label agent:eligible\nworktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});
