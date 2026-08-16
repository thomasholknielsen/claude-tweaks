'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isWorktreeAlwaysOn, readIntegrationBranch, readListKey } = require('../bin/lib/policy');

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

test('worktree-always: true -> true', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('worktree-always: false -> false', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: false\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('unrelated keys and near-miss lines -> false', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'issues.autonomous-eligibility: any\nworktree-something-else: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('tolerates extra whitespace around the value', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always:    true  \n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('the key can appear alongside other policy lines in either order', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'issues.autonomous-eligibility: label agent:eligible\nworktree-always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('a trailing inline # comment after true is ignored, not treated as policy-OFF', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: true  # enabled after the incident on 2026-07-10\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('a trailing inline # comment with no space before it is still ignored', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: true# comment\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('garbage trailing content that is not a # comment is still rejected', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: true and some other text\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('isWorktreeAlwaysOn: a trailing inline # comment is tolerated through the pre-#602 alias — worktree.always: true  # note still reads as ON', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true  # note\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('isWorktreeAlwaysOn: the new spelling worktree-always: true reads as ON', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('isWorktreeAlwaysOn: the pre-#602 spelling worktree.always: true still reads as ON through the RENAMED_KEYS alias — an un-migrated project never silently loses the gate', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('isWorktreeAlwaysOn: when both spellings are set the new line wins — worktree-always: false beats worktree.always: true (same precedence as the resolver)', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: false\nworktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
  const repo2 = tmpRepo();
  writePolicy(repo2, 'worktree.always: false\nworktree-always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo2), true, 'order in the file does not matter — the new NAME wins, not the last line');
});

test('isWorktreeAlwaysOn: an invalid new-name value beside a valid old-name line still lets the new NAME win — the gate reads OFF, matching the resolver (deliberate: presence of the new name ends the alias window for that file)', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree-always: yes\nworktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('readIntegrationBranch: key present -> returns the branch name', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'integration-branch: staging\n');
  assert.strictEqual(readIntegrationBranch(repo), 'staging');
});

test('readIntegrationBranch: key absent -> null', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true\n');
  assert.strictEqual(readIntegrationBranch(repo), null);
});

test('readIntegrationBranch: no policy file at all -> null', () => {
  assert.strictEqual(readIntegrationBranch(tmpRepo()), null);
});

test('readIntegrationBranch: key present with a trailing comment is tolerated', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'integration-branch: dev  # not main, see CLAUDE.md\n');
  assert.strictEqual(readIntegrationBranch(repo), 'dev');
});

test('readListKey: key present -> parsed, trimmed array', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'experiment-flag-patterns: foo, bar ,baz\n');
  assert.deepStrictEqual(readListKey(repo, 'experiment-flag-patterns'), ['foo', 'bar', 'baz']);
});

test('readListKey: key absent -> []', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true\n');
  assert.deepStrictEqual(readListKey(repo, 'experiment-flag-patterns'), []);
});

test('readListKey: key present but empty -> []', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'experiment-flag-patterns: \n');
  assert.deepStrictEqual(readListKey(repo, 'experiment-flag-patterns'), []);
});

test('readListKey: no policy file at all -> []', () => {
  assert.deepStrictEqual(readListKey(tmpRepo(), 'experiment-flag-patterns'), []);
});

test('readListKey: a single value with no commas -> a one-element array', () => {
  const repo = tmpRepo();
  const pattern = 'isEnabled\\w+';
  writePolicy(repo, `experiment-flag-patterns: ${pattern}\n`);
  assert.deepStrictEqual(readListKey(repo, 'experiment-flag-patterns'), [pattern]);
});

test('readListKey: trailing comment is stripped before splitting', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'experiment-flag-exclude: rollback,failsafe  # extends the shipped defaults\n');
  assert.deepStrictEqual(readListKey(repo, 'experiment-flag-exclude'), ['rollback', 'failsafe']);
});

test('readListKey: a dotted key name (e.g. harness-health.scoped-rule-budget-style) resolves without regex-metachar corruption', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'doc-convention.adr: plugin\nexperiment-flag-patterns: a,b\n');
  assert.deepStrictEqual(readListKey(repo, 'experiment-flag-patterns'), ['a', 'b']);
});
