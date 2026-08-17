// tests/materialize-run-dir-anchoring.test.js
//
// #790: bin/materialize.js's --run-dir had zero validation before
// deps.mkdirp(workDir)/deps.writeFile(outFile, ...) — the same [IL-127] gap
// as bin/hooks.js and bin/wrap-up-engine.js. run(argv, deps) is directly
// callable (deps-injected, per its own header comment: "All I/O through deps
// so tests never touch gh, git, or the filesystem") — these tests exercise
// it in-process against real gitRepo()/linkedWorktreeOf() fixtures, chdir'd
// per test, with deps stubbed to prove the anchoring check runs BEFORE any
// gh/network call: a rejection must never reach deps.ghAvailable.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');
const { run } = require('../bin/materialize');

function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(prev); }
}

function fakeDeps(overrides = {}) {
  const calls = { ghAvailable: 0 };
  return {
    calls,
    ghAvailable: () => { calls.ghAvailable += 1; return false; }, // stop right after, if reached
    ghView: () => { throw new Error('ghView should never be called in these tests'); },
    remoteUrl: () => { throw new Error('remoteUrl should never be called in these tests'); },
    mkdirp: () => { throw new Error('mkdirp should never be called when --run-dir is rejected'); },
    writeFile: () => { throw new Error('writeFile should never be called when --run-dir is rejected'); },
    stdout: () => {},
    stderr: () => {},
    ...overrides,
  };
}

test('reject: --run-dir is a bare-relative path resolving inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  let stderrText = '';
  deps.stderr = (s) => { stderrText += s; };
  const code = withCwd(wt, () => run(['1', '--run-dir', path.join('.claude-tweaks', 'pipelines', 'x')], deps));
  assert.strictEqual(code, 2);
  assert.match(stderrText, /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0, 'must reject before ever checking gh availability');
});

test('reject: --run-dir is absolute but resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  let stderrText = '';
  deps.stderr = (s) => { stderrText += s; };
  const abs = path.join(wt, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  assert.strictEqual(code, 2);
  assert.match(stderrText, /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0);
});

test('accept: --run-dir is absolute and anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  let stderrText = '';
  deps.stderr = (s) => { stderrText += s; };
  const abs = path.join(main, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  // Rejected downstream by the stubbed ghAvailable()=false, NOT by anchoring.
  assert.strictEqual(code, 2);
  assert.doesNotMatch(stderrText, /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a correctly anchored --run-dir must reach the gh-availability check');
});
