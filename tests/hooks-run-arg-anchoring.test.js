// tests/hooks-run-arg-anchoring.test.js
//
// #790: bin/hooks.js's resolveRunArg validated an explicit --run <path> only
// via fs.statSync(...).isDirectory() — true for a worktree-relative directory
// just as readily as a main-checkout-anchored one. CLI-level coverage
// (spawns the real process, like tests/hooks-resolve-run-dir-cli.test.js)
// proving --run is now rejected when it resolves inside a linked worktree,
// whether passed as a relative or an absolute path, and still accepted when
// it genuinely resolves under the main checkout.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const HOOKS_JS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

function runRecordWorktree(args, cwd) {
  try {
    const stdout = execFileSync('node', [HOOKS_JS, 'record-worktree', ...args], {
      cwd, timeout: 15000,
    });
    return { code: 0, stdout: stdout.toString('utf8') };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString('utf8') : '',
    };
  }
}

function mkRunDir(base, relParts) {
  const dir = path.join(base, ...relParts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('reject: --run is a relative path that resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  mkRunDir(wt, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-790']);
  const out = runRecordWorktree(
    ['--run', path.join('.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-790'), wt],
    wt,
  );
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
});

test('reject: --run is an absolute path that resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-791']);
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
});

test('accept: --run is an absolute path correctly anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const anchored = mkRunDir(main, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-792']);
  // Invoked from inside the worktree (the real-world shape) — the anchoring
  // check must accept a --run value that genuinely resolves under $RUN_ROOT.
  const out = runRecordWorktree(['--run', anchored, wt], wt);
  assert.match(out.stdout, /worktree recorded/);
});

test('#280: accept — --run is a worktree-local INITIALIZED run dir with no main-checkout counterpart', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-280']);
  // The distinguishing signal: a marker file a real pipeline step wrote
  // (decisions.md, from the standalone-fallback/Manifesto init), not merely
  // a directory that exists.
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /worktree-local fallback \(#280\)/i);
  assert.match(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /not anchored|resolves outside the main checkout/i);
});

test('#280: reject — a worktree-local run dir that is a bare mkdir (uninitialized) still refuses, even with no main-checkout counterpart', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  // Same shape as the #790 "reject" tests above (bare mkdir, no marker
  // file) — confirms the #280 fallback does not loosen the ordinary case.
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-281']);
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /worktree-local fallback/i);
});

test('#280: reject — a worktree-local INITIALIZED run dir is NOT adopted when a same-named run dir already exists under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const runId = '2026-01-01T000000-spec-282';
  // The main-checkout copy is authoritative whenever one exists — the
  // worktree-local copy must never win over it, even if it happens to be
  // initialized too (e.g. a resumed session that later regained main-checkout
  // write access).
  mkRunDir(main, ['.claude-tweaks', 'pipelines', runId]);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', runId]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /worktree-local fallback/i);
});

test('reject: --run resolves under a directory with no git repo ancestor at all — distinct message, not the worktree-shadow wording', () => {
  // #790 Finding 5: mainCheckoutRoot() returning null (no .git anywhere up
  // the ancestor chain) is a DIFFERENT failure than "exists, but resolves
  // outside a KNOWN main checkout" — a bare mkdtempSync dir with no git init
  // reproduces it without needing a git-repo fixture at all.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-hooks-norepo-'));
  const runDirPath = mkRunDir(bare, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-793']);
  const out = runRecordWorktree(['--run', runDirPath, bare], bare);
  assert.match(out.stdout, /could not determine the git repository root/i);
  assert.doesNotMatch(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
});

// Shared by the #1183 tests below: every "reject" case must show the
// anchoring-rejection message and must NOT report either a successful record
// or a #280 fallback adoption; every "accept via fallback" case must report
// both the fallback disclosure and a successful record. Naming the assertion
// intent here keeps each test's own setup (its distinct fixture shape) the
// only thing left to read at the call site.
function assertShadowRejected(out) {
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
  assert.doesNotMatch(out.stdout, /worktree-local fallback/i);
}

function assertFallbackAdopted(out) {
  assert.match(out.stdout, /worktree-local fallback \(#280\)/i);
  assert.match(out.stdout, /worktree recorded/);
}

test('#1183: reject — an arbitrary non-repo directory with a stray config.yml is not adopted via the #280 fallback', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const stray = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-stray-'));
  fs.writeFileSync(path.join(stray, 'config.yml'), '');
  const out = runRecordWorktree(['--run', stray, wt], wt);
  assertShadowRejected(out);
});

test('#1183: reject — an unrelated git repo (not a worktree of this repo) with a config.yml is not adopted via the #280 fallback', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const otherRepo = gitRepo();
  fs.writeFileSync(path.join(otherRepo, 'config.yml'), '');
  const out = runRecordWorktree(['--run', otherRepo, wt], wt);
  assertShadowRejected(out);
});

test('#1183: reject — a worktree shadow of a nested pipelines/{parent}/spec-N run dir is refused when the anchored copy exists at the correct nested path', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const parentRunId = '2026-01-01T000000-spec-multi';
  const specSub = 'spec-967';
  // The anchored twin only needs to exist as a directory — matches the
  // existing twin-guard tests' isDirectory-only bar (no marker files needed).
  mkRunDir(main, ['.claude-tweaks', 'pipelines', parentRunId, specSub]);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', parentRunId, specSub]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assertShadowRejected(out);
});

test('#1183: accept — a worktree shadow of a nested pipelines/{parent}/spec-N run dir adopts via the #280 fallback when no anchored copy exists at all', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const parentRunId = '2026-01-01T000000-spec-multi2';
  const specSub = 'spec-968';
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', parentRunId, specSub]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assertFallbackAdopted(out);
});

test('#1183: reject — a worktree shadow of an archived pipelines/archive/{id} run dir is refused when the anchored copy exists', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const archivedRunId = '2026-01-01T000000-spec-archived';
  mkRunDir(main, ['.claude-tweaks', 'pipelines', 'archive', archivedRunId]);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', 'archive', archivedRunId]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assertShadowRejected(out);
});

test('#1183 fix-wave: accept — a worktree-local INITIALIZED run dir reached through a symlinked path component still adopts via the #280 fallback', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-1183sym']);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  // A symlink standing in for a path component (macOS /tmp -> /private/tmp is
  // the common real-world case) — repoInfo(resolved).repoRoot is realpath'd
  // internally (safeReal), but the un-realpath'd `resolved` used in the old
  // relative-path comparison was not, so a path reached through a symlink
  // like this one produced a spurious `..`-prefixed relative path and was
  // wrongly rejected. Passing the SAME run dir through a symlinked alias
  // here, with no main-checkout twin at all, must still be adopted.
  const wtLink = path.join(path.dirname(wt), 'wt-symlink');
  fs.symlinkSync(wt, wtLink, 'dir');
  const viaSymlink = path.join(wtLink, '.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-1183sym');
  const out = runRecordWorktree(['--run', viaSymlink, wt], wt);
  assertFallbackAdopted(out);
});

test('#1183 fix-wave: reject — a worktree-local archive/{id} shadow is refused when a LIVE (non-archived) run dir exists under the same id at the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const runId = '2026-01-01T000000-spec-archlive';
  // The main-checkout copy is LIVE (not archived) under the same run-id —
  // checking only the archive/{id} path at the main checkout would miss
  // this and wrongly adopt the worktree-local archive shadow as if no
  // authoritative copy existed anywhere.
  mkRunDir(main, ['.claude-tweaks', 'pipelines', runId]);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', 'archive', runId]);
  fs.writeFileSync(path.join(trapped, 'decisions.md'), '');
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assertShadowRejected(out);
});
