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
//
// #959: a --run-dir resolving INSIDE a linked worktree is no longer an
// unconditional rejection — this CLI only ever writes to the documented
// worktree-local exception (work/{n}-spec.md), so the check now accepts
// "anchored under the main checkout" OR "inside a linked worktree", and
// rejects only a --run-dir that is neither (e.g. a foreign checkout, or
// nowhere near any git repo).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');
const wtDetect = require('../plugin/bin/lib/hooks/worktree-detect');
const { run } = require('../plugin/bin/materialize');

function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(prev); }
}

function fakeDeps(overrides = {}) {
  const calls = { ghAvailable: 0, stderr: [] };
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
    isInsideLinkedWorktree: (resolvedPath) => wtDetect.repoInfo(resolvedPath).isLinkedWorktree,
    mkdirp: () => { throw new Error('mkdirp should never be called when --run-dir is rejected'); },
    writeFile: () => { throw new Error('writeFile should never be called when --run-dir is rejected'); },
    stdout: () => {},
    stderr: (s) => { calls.stderr.push(s); },
    ...overrides,
  };
}

test('#959 accept: --run-dir is a bare-relative path resolving inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  const code = withCwd(wt, () => run(['1', '--run-dir', path.join('.claude-tweaks', 'pipelines', 'x')], deps));
  // Rejected downstream by the stubbed ghAvailable()=false, NOT by anchoring.
  assert.strictEqual(code, 2);
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a worktree-relative --run-dir must now reach the gh-availability check');
});

test('#959 accept: --run-dir is absolute and resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  const abs = path.join(wt, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  assert.strictEqual(code, 2);
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a worktree-relative --run-dir must now reach the gh-availability check');
});

test('#959 reject: --run-dir resolves inside a DIFFERENT git checkout (foreign repo, not the main checkout or its own worktree)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const foreign = gitRepo();
  const deps = fakeDeps();
  const abs = path.join(foreign, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0, 'a foreign checkout must still be rejected, not just "not the main checkout"');
});

test('accept: --run-dir is absolute and anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  const abs = path.join(main, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  // Rejected downstream by the stubbed ghAvailable()=false, NOT by anchoring.
  assert.strictEqual(code, 2);
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a correctly anchored --run-dir must reach the gh-availability check');
});

test('reject: --run-dir has no git repo ancestor at all — distinct message, not the worktree-shadow wording', () => {
  // #790 Finding 5: mainCheckoutRoot() returning null (no .git anywhere up
  // the ancestor chain) is a DIFFERENT failure than "exists, but resolves
  // outside a KNOWN main checkout" — a bare mkdtempSync dir with no git init
  // reproduces it without needing a git-repo fixture at all.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-materialize-norepo-'));
  const deps = fakeDeps();
  const abs = path.join(bare, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(bare, () => run(['1', '--run-dir', abs], deps));
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /could not determine the git repository root/i);
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0, 'must reject before ever checking gh availability');
});
