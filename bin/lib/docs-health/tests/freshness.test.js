'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseFilesField, checkTrackedFreshness } = require('../freshness');

function makeTmpGitRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-freshness-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  return root;
}

function commitFile(root, relPath, contents) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  execFileSync('git', ['add', relPath], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', `commit ${relPath}`], { cwd: root });
}

function commitTimestampMs(root, relPath) {
  const out = execFileSync('git', ['-C', root, 'log', '-1', '--format=%ct', '--', relPath], { encoding: 'utf8' }).trim();
  return parseInt(out, 10) * 1000;
}

test('parseFilesField returns declared paths', () => {
  const content = '---\nfiles:\n  - src/a.ts\n  - src/b.ts\n---\n\n# Doc\n';
  assert.deepStrictEqual(parseFilesField(content), ['src/a.ts', 'src/b.ts']);
});

test('parseFilesField returns [] when no files: key present', () => {
  const content = '---\ndepth-hint: reference\n---\n\n# Doc\n';
  assert.deepStrictEqual(parseFilesField(content), []);
});

test('parseFilesField returns [] when no frontmatter at all', () => {
  assert.deepStrictEqual(parseFilesField('# Doc\n\nNo frontmatter here.\n'), []);
});

test('flags a tracked file that changed after sinceTimestamp', () => {
  const root = makeTmpGitRoot();
  commitFile(root, 'src/tracked.ts', 'export const x = 1;\n');
  const changedAt = commitTimestampMs(root, 'src/tracked.ts');
  const content = '---\nfiles:\n  - src/tracked.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, changedAt - 1000);
  assert.strictEqual(result.stale.length, 1);
  assert.strictEqual(result.stale[0].path, 'src/tracked.ts');
  assert.deepStrictEqual(result.missing, []);
});

test('does not flag a tracked file that changed before sinceTimestamp', () => {
  const root = makeTmpGitRoot();
  commitFile(root, 'src/tracked.ts', 'export const x = 1;\n');
  const changedAt = commitTimestampMs(root, 'src/tracked.ts');
  const content = '---\nfiles:\n  - src/tracked.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, changedAt + 1000);
  assert.deepStrictEqual(result.stale, []);
});

test('flags a missing tracked path', () => {
  const root = makeTmpGitRoot();
  const content = '---\nfiles:\n  - src/does-not-exist.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, Date.now());
  assert.deepStrictEqual(result.missing, ['src/does-not-exist.ts']);
  assert.deepStrictEqual(result.stale, []);
});

test('does not flag anything when sinceTimestamp is null (never audited)', () => {
  const root = makeTmpGitRoot();
  commitFile(root, 'src/tracked.ts', 'export const x = 1;\n');
  const content = '---\nfiles:\n  - src/tracked.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, null);
  assert.deepStrictEqual(result.stale, []);
});

test('returns empty result when doc has no files: field', () => {
  const root = makeTmpGitRoot();
  const content = '# Doc\n\nNo frontmatter.\n';
  const result = checkTrackedFreshness(content, root, Date.now());
  assert.deepStrictEqual(result, { stale: [], missing: [] });
});
