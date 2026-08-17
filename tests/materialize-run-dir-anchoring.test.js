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
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');
const wtDetect = require('../bin/lib/hooks/worktree-detect');
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
    // #790 Finding 1: cwd/mainRoot now come through deps, mirroring
    // bin/release-claim.js's seam — the default here is the real thing
    // (chdir'd per test below), same as realDeps, so these tests still
    // exercise real gitRepo()/linkedWorktreeOf() fixtures end to end.
    cwd: () => process.cwd(),
    mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
    isAnchored: (resolvedPath, mainRoot) => wtDetect.isAnchoredUnderRoot(resolvedPath, mainRoot),
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

test('reject: --run-dir has no git repo ancestor at all — distinct message, not the worktree-shadow wording', () => {
  // #790 Finding 5: mainCheckoutRoot() returning null (no .git anywhere up
  // the ancestor chain) is a DIFFERENT failure than "exists, but resolves
  // outside a KNOWN main checkout" — a bare mkdtempSync dir with no git init
  // reproduces it without needing a git-repo fixture at all.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-materialize-norepo-'));
  const deps = fakeDeps();
  let stderrText = '';
  deps.stderr = (s) => { stderrText += s; };
  const abs = path.join(bare, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(bare, () => run(['1', '--run-dir', abs], deps));
  assert.strictEqual(code, 2);
  assert.match(stderrText, /could not determine the git repository root/i);
  assert.doesNotMatch(stderrText, /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0, 'must reject before ever checking gh availability');
});
