// tests/resolve-profile-run-dir-anchoring.test.js
//
// #1065: bin/resolve-profile.js's --run-dir had zero anchoring validation —
// the anchored-or-outside half of the [IL-127] CLI-argument-boundary guard
// (tests/materialize-run-dir-anchoring.test.js covers the strict half).
// The CLI has no deps seam, so these tests spawn the real binary with cwd
// set per fixture and assert on exit code, stderr, and tally side effects.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const CLI = path.join(__dirname, '..', 'plugin', 'bin', 'resolve-profile.js');

function runCli(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_CODE_SESSION_ID: '' },
      timeout: 30000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

test('accept: main-anchored --run-dir from linked-worktree cwd (production shape)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', 'r1');
  fs.mkdirSync(runDir, { recursive: true });
  const res = runCli(['standard', '--run-dir', runDir], wt);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(JSON.parse(res.stdout).model, 'still resolves a model');
});

test('accept: --run-dir outside any checkout (journey shape) — tally readable/appendable there', () => {
  const main = gitRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-journey-'));
  const res = runCli(['frontier', '--run-dir', outside], main);
  assert.strictEqual(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  if (out.model === 'fable') {
    assert.ok(fs.existsSync(path.join(outside, 'frontier-tally.log')), 'tally written outside as before');
  }
});

test('reject: bare relative --run-dir from linked-worktree cwd — exit 1, no tally anywhere', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const res = runCli(['frontier', '--run-dir', path.join('.claude-tweaks', 'pipelines', 'r1')], wt);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
  assert.match(res.stderr, /--run-dir /);
  assert.ok(!fs.existsSync(path.join(wt, '.claude-tweaks', 'pipelines', 'r1', 'frontier-tally.log')), 'reject fires before any tally I/O');
});

test('reject: absolute --run-dir inside a linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const res = runCli(['standard', '--run-dir', path.join(wt, '.claude-tweaks', 'pipelines', 'r1')], main);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
});

test('reject: --run-dir inside a genuinely unrelated second repo (AC 10)', () => {
  const main = gitRepo();
  const other = gitRepo();
  const res = runCli(['standard', '--run-dir', path.join(other, 'run')], main);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /resolves outside the main checkout/);
});

test('reject: no-repo-root cwd with --run-dir inside some checkout — distinct message (AC 6, fixture per AC 12)', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-norepo-'));
  const repo = gitRepo();
  const res = runCli(['standard', '--run-dir', path.join(repo, 'run')], bare);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /could not determine the git repository root/);
  assert.doesNotMatch(res.stderr, /resolves outside the main checkout/);
});

test('accept: symlinked tmpdir spelling classifies by real location (AC 11)', () => {
  const main = gitRepo();
  const realOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-sym-'));
  const aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-symparent-'));
  const alias = path.join(aliasParent, 'alias');
  fs.symlinkSync(realOutside, alias);
  const res = runCli(['standard', '--run-dir', path.join(alias, 'r')], main);
  assert.strictEqual(res.status, 0, res.stderr);
});
