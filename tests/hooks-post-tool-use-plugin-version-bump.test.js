// tests/hooks-post-tool-use-plugin-version-bump.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../bin/lib/hooks/post-tool-use');

function gitEnv(dateOverride) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  if (dateOverride) {
    env.GIT_AUTHOR_DATE = dateOverride;
    env.GIT_COMMITTER_DATE = dateOverride;
  }
  return env;
}

// Creates a fresh repo with an initial commit, then a second commit that
// writes `.claude-plugin/plugin.json` with the given raw content (a string,
// so malformed-JSON cases can be exercised directly). Returns the repo dir.
function gitRepoWithManifestCommit(manifestContent, dateOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'initial'], { env: gitEnv() });
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), manifestContent);
  execFileSync('git', ['-C', dir, 'add', '.claude-plugin/plugin.json'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'Bump to 9.9.9'], { env: gitEnv(dateOverride) });
  return fs.realpathSync(dir);
}

function gitRepoWithUnrelatedCommit(dateOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'a normal commit'], { env: gitEnv(dateOverride) });
  return fs.realpathSync(dir);
}

function runPostToolUse(repo) {
  return post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir: null,
    runState: null,
    cwd: repo,
  });
}

test('warns when a commit touches .claude-plugin/plugin.json for this project (name: claude-tweaks)', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const out = runPostToolUse(repo);
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  // Both release follow-ups, asserted separately. A single /marketplace/ match
  // passed for months while the message said nothing about the changelog.
  assert.match(out.json.systemMessage, /marketplace/i);
  assert.match(out.json.systemMessage, /CHANGELOG/i);
  assert.match(out.json.systemMessage, /shipped-versions\.tsv/i);
});

// Same repo shape, but the release's same-commit obligations can be satisfied
// selectively — the nudge is only useful if it stops naming what is already done.
function gitRepoWithRelease({ version = '9.9.9', changelog = null, record = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-rel-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'initial'], { env: gitEnv() });
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claude-tweaks', version }));
  if (changelog !== null) fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
  if (record !== null) {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'shipped-versions.tsv'), record);
  }
  execFileSync('git', ['-C', dir, 'add', '-A'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Bump to ${version}`], { env: gitEnv() });
  return fs.realpathSync(dir);
}

test('stops naming the CHANGELOG once the same commit carries the entry', () => {
  const repo = gitRepoWithRelease({ changelog: '# Changelog\n\n## v9.9.9 — did the thing\n\nbody\n' });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.doesNotMatch(msg, /CHANGELOG/i, `still asked for the changelog: ${msg}`);
  assert.match(msg, /shipped-versions\.tsv/i, 'the record is still outstanding and must still be named');
});

test('stops naming the record once the same commit carries the line', () => {
  const repo = gitRepoWithRelease({ record: '# header\n9.9.9\t2026-08-06\trelease\n' });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.doesNotMatch(msg, /shipped-versions\.tsv/i, `still asked for the record: ${msg}`);
  assert.match(msg, /CHANGELOG/i, 'the changelog is still outstanding and must still be named');
});

test('a near-miss version in either file does not count as satisfying it', () => {
  // "9.9.99" contains "9.9.9" as a prefix. A substring test would read both as done.
  const repo = gitRepoWithRelease({
    changelog: '# Changelog\n\n## v9.9.99 — a different release\n',
    record: '# header\n9.9.99\t2026-08-06\trelease\n',
  });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.match(msg, /CHANGELOG/i);
  assert.match(msg, /shipped-versions\.tsv/i);
});

test('the marketplace mirror is always named — it lives in another repo and cannot be checked', () => {
  const repo = gitRepoWithRelease({
    changelog: '# Changelog\n\n## v9.9.9 — did the thing\n',
    record: '# header\n9.9.9\t2026-08-06\trelease\n',
  });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.match(msg, /marketplace/i);
  assert.doesNotMatch(msg, /CHANGELOG/i);
  assert.doesNotMatch(msg, /shipped-versions\.tsv/i);
});

test('does not warn when plugin.json belongs to a different project', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'some-other-plugin', version: '1.0.0' }));
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not warn when the commit does not touch plugin.json at all', () => {
  const repo = gitRepoWithUnrelatedCommit();
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not warn when the Bash command is not a git commit', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo },
    runDir: null, runState: null, cwd: repo,
  });
  assert.deepStrictEqual(out, {});
});

test('does not evaluate a stale HEAD left over from a git commit that never landed', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }), '2020-01-01T00:00:00');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not crash on malformed JSON in plugin.json at that commit, and does not warn', () => {
  const repo = gitRepoWithManifestCommit('{ this is not valid json');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('fires even when a runDir IS set (independent of the breadcrumb/other checks)', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-run-'));
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir, runState: { status: 'active' }, cwd: repo,
  });
  assert.match(out.json.systemMessage, /marketplace/i);
  assert.match(out.json.systemMessage, /CHANGELOG/i);
});
