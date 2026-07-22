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
  assert.match(out.json.systemMessage, /marketplace/i);
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
});
