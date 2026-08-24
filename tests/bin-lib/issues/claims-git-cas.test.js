'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyGitError, readClaimBlobGit, writeClaimBlobGit, CLAIMS_BRANCH,
} = require('../../../plugin/bin/lib/issues/claims-git-cas');

test('classifyGitError: missing path in a git show', () => {
  const err = new Error("fatal: path 'claims/issue-42.json' does not exist in '1234abcd'");
  assert.deepEqual(classifyGitError(err), { kind: 'missing-path' });
});

test('classifyGitError: force-with-lease rejection is contested', () => {
  const err = new Error('! [rejected]        HEAD -> claims-registry (stale info)');
  err.stderr = '! [rejected]        HEAD -> claims-registry (stale info)\nerror: failed to push some refs';
  assert.deepEqual(classifyGitError(err), { kind: 'contested' });
});

test('classifyGitError: fetch-first rejection is contested', () => {
  const err = new Error('fatal: push failed');
  err.stderr = '! [rejected]        claims-registry -> claims-registry (fetch first)';
  assert.deepEqual(classifyGitError(err), { kind: 'contested' });
});

test('classifyGitError: secondary rate limit is distinct from contested', () => {
  const err = new Error('remote: You have exceeded a secondary rate limit');
  err.stderr = 'remote: You have exceeded a secondary rate limit. Please wait a few minutes before you try again.';
  assert.deepEqual(classifyGitError(err), { kind: 'secondary-rate-limit' });
});

test('classifyGitError: Retry-After signature also reads as secondary rate limit', () => {
  const err = new Error('remote: Retry-After: 60');
  err.stderr = 'remote: Retry-After: 60\nremote: You have triggered an abuse detection mechanism.';
  assert.deepEqual(classifyGitError(err), { kind: 'secondary-rate-limit' });
});

test('classifyGitError: everything else is a plain transport failure', () => {
  const err = new Error('fatal: unable to access: Could not resolve host');
  assert.deepEqual(classifyGitError(err), { kind: 'transport-failure' });
});

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function realRunner(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: opts.cwd, input: opts.input, env: opts.env });
}

function makeBareOriginAndClone() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claims-git-cas-'));
  const originDir = path.join(root, 'origin.git');
  const cloneDir = path.join(root, 'clone');
  execFileSync('git', ['init', '--bare', '-q', '-b', 'main', originDir]);
  execFileSync('git', ['clone', '-q', originDir, cloneDir]);
  execFileSync('git', ['-C', cloneDir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', cloneDir, 'config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(cloneDir, 'README.md'), 'seed\n');
  execFileSync('git', ['-C', cloneDir, 'add', 'README.md']);
  execFileSync('git', ['-C', cloneDir, 'commit', '-q', '-m', 'seed']);
  execFileSync('git', ['-C', cloneDir, 'push', '-q', 'origin', 'main']);
  execFileSync('git', ['-C', cloneDir, 'push', '-q', 'origin', `main:${CLAIMS_BRANCH}`]);
  return { root, cloneDir };
}

test('readClaimBlobGit: absent path on a fresh registry branch', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const result = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  assert.equal(result.absent, true);
  assert.equal(result.content, null);
  assert.equal(typeof result.tipSha, 'string');
  assert.equal(result.tipSha.length, 40);
});

test('writeClaimBlobGit then readClaimBlobGit round-trips the blob', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const read1 = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  const write = writeClaimBlobGit({
    issueNumber: 42, content: '{"runId":"r1"}', message: 'Claim #42',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  assert.equal(write.ok, true);
  const read2 = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  assert.equal(read2.absent, false);
  assert.equal(read2.content, '{"runId":"r1"}');
  assert.notEqual(read2.tipSha, read1.tipSha);
});

test('writeClaimBlobGit: a second write on a stale expectedTipSha is contested', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const read1 = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  writeClaimBlobGit({
    issueNumber: 42, content: '{"runId":"r1"}', message: 'Claim #42 by r1',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  // Second writer still holds the STALE tip from read1 — its lease no longer matches.
  const write2 = writeClaimBlobGit({
    issueNumber: 42, content: '{"runId":"r2"}', message: 'Claim #42 by r2',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  assert.equal(write2.ok, false);
  assert.equal(write2.conflict, true);
});

test('writeClaimBlobGit: unrelated existing files in the tree survive a write', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const read1 = readClaimBlobGit({ issueNumber: 1, remote: 'origin', runner });
  writeClaimBlobGit({
    issueNumber: 1, content: '{"runId":"r1"}', message: 'Claim #1',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  const read2 = readClaimBlobGit({ issueNumber: 1, remote: 'origin', runner });
  writeClaimBlobGit({
    issueNumber: 2, content: '{"runId":"r2"}', message: 'Claim #2',
    expectedTipSha: read2.tipSha, remote: 'origin', runner,
  });
  const readme = realRunner(['show', `origin/${CLAIMS_BRANCH}:README.md`], { cwd: cloneDir });
  assert.equal(readme, 'seed\n');
  const issue1 = readClaimBlobGit({ issueNumber: 1, remote: 'origin', runner });
  assert.equal(issue1.content, '{"runId":"r1"}');
});
