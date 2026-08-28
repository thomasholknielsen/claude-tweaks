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
//
// #1210: "anchored under the main checkout" alone doesn't distinguish "no
// worktree involved, this is correct" from "cwd is itself inside a linked
// worktree, and a main-checkout-anchored --run-dir is the exact silent
// stray-write mismatch materialize.md's own worktree-first-ordering prose
// warns against." When cwd is inside a linked worktree AND --run-dir
// resolves to the main checkout instead of that worktree, the write target
// is now rewritten to the worktree-local equivalent (never a rejection —
// AC #1's "either...or") — see the #1210-tagged cases below.
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
    cwdWorktreeRoot: (cwd) => {
      const info = wtDetect.repoInfo(cwd);
      return info.isLinkedWorktree ? info.repoRoot : null;
    },
    mkdirp: () => { throw new Error('mkdirp should never be called when --run-dir is rejected'); },
    writeFile: () => { throw new Error('writeFile should never be called when --run-dir is rejected'); },
    stdout: () => {},
    stderr: (s) => { calls.stderr.push(s); },
    ...overrides,
  };
}

// #1138: an empty or whitespace-only --run-dir value must be rejected at
// parse time, before ghAvailable or any anchoring check runs — matching the
// existing "missing required --run-dir" treatment of a genuinely absent one.
test('#1138 reject: empty --run-dir value never reaches ghAvailable or the anchoring check', () => {
  const main = gitRepo();
  const deps = fakeDeps();
  const code = withCwd(main, () => run(['1', '--run-dir', ''], deps));
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /missing required --run-dir/);
  assert.strictEqual(deps.calls.ghAvailable, 0, 'must never reach the gh-availability check with a blank --run-dir');
});

test('#1138 reject: whitespace-only --run-dir value degrades the same as empty', () => {
  const main = gitRepo();
  const deps = fakeDeps();
  const code = withCwd(main, () => run(['1', '--run-dir', '   '], deps));
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /missing required --run-dir/);
  assert.strictEqual(deps.calls.ghAvailable, 0);
});

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

test('accept: --run-dir is absolute and anchored under the main checkout (cwd NOT a worktree)', () => {
  const main = gitRepo();
  const deps = fakeDeps();
  const abs = path.join(main, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(main, () => run(['1', '--run-dir', abs], deps));
  // Rejected downstream by the stubbed ghAvailable()=false, NOT by anchoring.
  assert.strictEqual(code, 2);
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.doesNotMatch(deps.calls.stderr.join(''), /worktree-local equivalent/i, 'no worktree involved — must not fire the #1210 rewrite note');
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a correctly anchored --run-dir must reach the gh-availability check');
});

// #1210: materialize.js accepted a main-checkout-anchored --run-dir
// unconditionally whenever it resolved to a real git root — including when
// cwd was itself inside a linked worktree, which is exactly the case
// materialize.md's own worktree-first-ordering prose warns against (a
// caller following the ordinary $PIPELINE_RUN_DIR convention got a silent,
// exit-0 "success" that actually wrote into the main checkout). These cases
// pin that the mismatch is now caught: either the write target is rewritten
// to the worktree-local equivalent (this suite drives the fix end to end
// through a real mkdirp/writeFile, unlike the stubbed-ghAvailable cases
// above), or a caller must never observe a file materialize under the main
// checkout.
test('#1210 accept+rewrite: cwd inside a linked worktree + --run-dir anchored to the main checkout fires the rewrite note before gh work', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  const abs = path.join(main, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  // Rejected downstream by the stubbed ghAvailable()=false, NOT by anchoring — the
  // #1210 guard rewrites opts.runDir and lets the run proceed, same as #959's
  // existing "accept" cases; it never itself returns non-zero.
  assert.strictEqual(code, 2);
  assert.doesNotMatch(deps.calls.stderr.join(''), /resolves outside the main checkout/i);
  assert.match(deps.calls.stderr.join(''), /resolves to the main checkout/i);
  assert.match(deps.calls.stderr.join(''), /worktree-local equivalent/i);
  assert.match(deps.calls.stderr.join(''), new RegExp(wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the note must name the worktree root');
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a rewritten --run-dir must still reach the gh-availability check, not stop as a rejection');
});

test('#1210 end-to-end: cwd inside a linked worktree + --run-dir anchored to the main checkout writes the spec file INSIDE the worktree, never the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const abs = path.join(main, '.claude-tweaks', 'pipelines', 'x');
  const stdout = [];
  const stderr = [];
  const deps = {
    ghAvailable: () => true,
    ghView: () => JSON.stringify({
      number: 1,
      title: 'Test record',
      body: [
        'Surface: backend',
        '',
        '## Current State',
        'Some current state text.',
        '',
        '## Deliverables',
        '- [ ] do a thing',
        '',
        '## Acceptance Criteria',
        '1. It works',
      ].join('\n'),
      labels: [{ name: 'ceremony:standard' }],
      url: 'https://example.invalid/1',
    }),
    remoteUrl: () => { throw new Error('remoteUrl should never be called when --repo is passed explicitly'); },
    gitRevListCount: () => { throw new Error('should not be called — no Verified-as-of stamp on this record'); },
    gitCommitDate: () => { throw new Error('should not be called — no Verified-as-of stamp on this record'); },
    cwd: () => process.cwd(),
    mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
    isAnchored: (resolvedPath, root) => wtDetect.isAnchoredUnderRoot(resolvedPath, root),
    isInsideLinkedWorktree: (resolvedPath) => wtDetect.repoInfo(resolvedPath).isLinkedWorktree,
    cwdWorktreeRoot: (cwd) => {
      const info = wtDetect.repoInfo(cwd);
      return info.isLinkedWorktree ? info.repoRoot : null;
    },
    mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
    writeFile: (file, content) => fs.writeFileSync(file, content),
    stdout: (s) => stdout.push(s),
    stderr: (s) => stderr.push(s),
  };
  const code = withCwd(wt, () => run(['1', '--run-dir', abs, '--repo', 'owner/repo'], deps));
  assert.strictEqual(code, 0, stderr.join(''));
  const envelope = JSON.parse(stdout.join(''));
  assert.ok(
    envelope.file.startsWith(wt + path.sep),
    `expected the written file to be under the worktree (${wt}), got ${envelope.file}`,
  );
  assert.ok(fs.existsSync(envelope.file), 'the reported file path must actually exist on disk');
  const mainShadowFile = path.join(main, '.claude-tweaks', 'pipelines', 'x', 'work', '1-spec.md');
  assert.ok(!fs.existsSync(mainShadowFile), 'must never have written the spec file into the main checkout');
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
