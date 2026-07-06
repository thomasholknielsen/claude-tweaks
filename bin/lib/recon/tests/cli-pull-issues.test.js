'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-pi-'));
}

function runPullIssues(issuesFile, extraArgs = []) {
  return spawnSync('node', [CLI, 'pull-issues', '--issues', issuesFile, ...extraArgs], { encoding: 'utf8' });
}

test('pull-issues: exits 2 when --min-severity is an unrecognized value', () => {
  const root = tmp();
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([]));
  const result = runPullIssues(issuesFile, ['--min-severity', 'hgih']);
  assert.strictEqual(result.status, 2, `expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('--min-severity'), `expected --min-severity mentioned in stderr: ${result.stderr}`);
});

test('pull-issues: a recognized --min-severity value still works normally', () => {
  const root = tmp();
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([]));
  const result = runPullIssues(issuesFile, ['--min-severity', 'high']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const briefs = JSON.parse(result.stdout);
  assert.deepStrictEqual(briefs, []);
});

test('pull-issues: "info" is a recognized severity for this command (wider scale than recon findings)', () => {
  const root = tmp();
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([]));
  const result = runPullIssues(issuesFile, ['--min-severity', 'info']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
});
