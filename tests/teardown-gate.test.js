// tests/teardown-gate.test.js
// This suite grows through Tasks 1-4 of the teardown-gate plan (spec #373).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findRunByWorktreePath } = require('../bin/lib/hooks/context');
const { fixtureGit } = require('./helpers/git-fixtures');

function sh(cwd, ...args) {
  return fixtureGit(['-C', cwd, ...args]).toString();
}

// A main-checkout repo root with .claude-tweaks/pipelines inside it.
// findRunByWorktreePath's underlying iterRunDirsWithState anchors via the
// main checkout resolution (bin/lib/hooks/worktree-detect.js), so the fixture
// root must itself be a real git repo, same as tests/run-integrity.test.js.
function fixtureRoot() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-tdg-')));
  fixtureGit(['init', '-q', '-b', 'trunk', root]);
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  sh(root, 'add', 'a.txt');
  sh(root, 'commit', '-q', '-m', 'base');
  return root;
}

let runSeq = 0;
function makeRun(root, state) {
  const name = `2026-08-01T09000${runSeq}-spec-9`;
  runSeq += 1;
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(runDir, { recursive: true });
  if (state !== undefined) {
    fs.writeFileSync(path.join(runDir, 'run-state.json'), state);
  }
  return runDir;
}

test('exact-path match returns the run', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-exact');
  fs.mkdirSync(wt);
  const runDir = makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const result = findRunByWorktreePath(root, wt);
  assert.ok(result, 'expected a match');
  assert.strictEqual(result.runDir, runDir);
  assert.strictEqual(result.state.worktree, wt);
});

test('realpath match (symlinked target) returns the run', () => {
  const root = fixtureRoot();
  const real = path.join(root, 'wt-real');
  fs.mkdirSync(real);
  const link = path.join(root, 'wt-link');
  fs.symlinkSync(real, link);
  const runDir = makeRun(root, JSON.stringify({ status: 'active', worktree: real }));
  // Query via the symlink; recorded assignment is the canonical real path.
  const result = findRunByWorktreePath(root, link);
  assert.ok(result, 'expected a match via realpath canonicalization');
  assert.strictEqual(result.runDir, runDir);
});

test('unmatched path returns null', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-recorded');
  fs.mkdirSync(wt);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const other = path.join(root, 'wt-other');
  fs.mkdirSync(other);
  const result = findRunByWorktreePath(root, other);
  assert.strictEqual(result, null);
});

test('terminal (clean) run is not returned', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-clean');
  fs.mkdirSync(wt);
  makeRun(root, JSON.stringify({ status: 'clean', worktree: wt }));
  const result = findRunByWorktreePath(root, wt);
  assert.strictEqual(result, null);
});

test('corrupt run-state.json returns null for that run without throwing', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-corrupt');
  fs.mkdirSync(wt);
  makeRun(root, '{not valid json');
  assert.doesNotThrow(() => {
    const result = findRunByWorktreePath(root, wt);
    assert.strictEqual(result, null);
  });
});
