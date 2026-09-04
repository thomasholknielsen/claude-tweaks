// tests/hooks-run-dir-resolve.test.js
//
// #692: bin/lib/hooks/run-dir-resolve.js — the pure resolver behind
// `node bin/hooks.js resolve-run-dir`. Implements _shared/pipeline-run-dir.md's
// resolution order (env var with adoption-time anchoring check -> newest
// matching dir -> standalone fallback) on top of worktree-detect.js's
// mainCheckoutRoot(), so a skill step can get the anchored $RUN_ROOT/run
// directory without ever composing it from a relative path inside whatever
// worktree happens to be cwd ([IL-127]).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { gitRepo, linkedWorktreeOf, harnessWorktreeOf } = require('./helpers/git-fixtures');
const { resolve, formatTimestamp } = require('../plugin/bin/lib/hooks/run-dir-resolve');

function mkRunDir(main, name) {
  const dir = path.join(main, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('main-checkout cwd, spec-slug matches an existing run: resolves that run\'s absolute path', () => {
  const main = gitRepo();
  const run = mkRunDir(main, '2026-01-01T000000-spec-42');
  const out = resolve({ cwd: main, env: {}, specSlug: 'spec-42' });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.path, run);
  assert.strictEqual(out.created, false);
});

test('linked-worktree cwd, no env var: still resolves a matching run under the MAIN checkout, not the worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const run = mkRunDir(main, '2026-01-01T000000-spec-99');
  const out = resolve({ cwd: wt, env: {}, specSlug: 'spec-99' });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.path, run);
});

test('env var pointing into a linked worktree is rejected, not adopted', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const trapped = mkRunDir(wt, '2026-01-01T000000-spec-7'); // lives in the WORKTREE, not main
  const out = resolve({ cwd: wt, env: { PIPELINE_RUN_DIR: trapped }, specSlug: 'spec-7' });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.path, null);
  assert.match(out.message, /shadow|linked worktree/i);
  assert.match(out.message, new RegExp(trapped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('env var pointing into a linked worktree NESTED inside the main checkout (.claude/worktrees/<name>) is rejected, not adopted by a path-prefix false positive', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main, 'nested-wt');
  const trapped = mkRunDir(wt, '2026-01-01T000000-spec-8'); // physically under `main` on disk, but inside the linked worktree's own checkout
  const out = resolve({ cwd: wt, env: { PIPELINE_RUN_DIR: trapped }, specSlug: 'spec-8' });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.path, null);
  assert.match(out.message, /shadow|linked worktree/i);
});

test('env var anchored under the main checkout is accepted, even when invoked from a worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const run = mkRunDir(main, '2026-01-01T000000-spec-5');
  const out = resolve({ cwd: wt, env: { PIPELINE_RUN_DIR: run }, specSlug: 'spec-5' });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.path, run);
});

test('env var pointing at a directory that does not exist on disk falls through silently to step 2', () => {
  const main = gitRepo();
  const run = mkRunDir(main, '2026-01-01T000000-spec-11');
  const missing = path.join(main, '.claude-tweaks', 'pipelines', 'does-not-exist');
  const out = resolve({ cwd: main, env: { PIPELINE_RUN_DIR: missing }, specSlug: 'spec-11' });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.path, run);
});

test('nothing resolves and --create is not passed: exits non-zero (ok:false), never creates a directory', () => {
  const main = gitRepo();
  const out = resolve({ cwd: main, env: {}, specSlug: 'spec-no-match' });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.created, false);
  const pipelinesDir = path.join(main, '.claude-tweaks', 'pipelines');
  assert.ok(!fs.existsSync(pipelinesDir), 'must never create .claude-tweaks/pipelines/ as a side effect of a failed resolution');
});

test('newest match wins when multiple directories match the spec-slug', () => {
  const main = gitRepo();
  mkRunDir(main, '2026-01-01T000000-spec-3');
  const newer = mkRunDir(main, '2026-06-01T000000-spec-3');
  const out = resolve({ cwd: main, env: {}, specSlug: 'spec-3' });
  assert.strictEqual(out.path, newer);
});

test('standalone fallback with --create mints a directory with decisions.md and staged/, matching the reference snippet', () => {
  const main = gitRepo();
  const out = resolve({
    cwd: main, env: {}, standalone: 'tidy', create: true,
    now: new Date('2026-03-04T05:06:07Z'),
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.created, true);
  assert.strictEqual(path.basename(out.path), '2026-03-04T050607-tidy-standalone');
  assert.ok(fs.statSync(out.path).isDirectory());
  assert.ok(fs.statSync(path.join(out.path, 'staged')).isDirectory());
  assert.ok(fs.existsSync(path.join(out.path, 'decisions.md')));
});

// #848: record #764's run dir was minted as `20260817T173343-spec-764` — no
// dashes — invisible to context.js's RUN_ID_RE-filtered enumeration.
// formatTimestamp is the one implementation every one of the three mint
// sites (flow/claim-targets.md Step 2.8, flow/manifesto.md, dispatch/SKILL.md
// Step 4) now reaches through `resolve-run-dir --create`, so pinning its
// output shape here — rather than only the mint sites' own prose citation —
// mechanically guarantees AC1 at the one place the format is actually
// produced, regardless of what any given skill's prose says.
test('formatTimestamp always produces a dash-containing YYYY-MM-DDTHHMMSS timestamp (#848)', () => {
  assert.strictEqual(formatTimestamp(new Date('2026-03-04T05:06:07Z')), '2026-03-04T050607');
  // Single-digit month/day/hour/minute/second all zero-pad — the exact seam
  // a hand-typed `date -u +%Y%m%dT%H%M%S` (dashes dropped) could otherwise
  // diverge from without a caller noticing.
  assert.strictEqual(formatTimestamp(new Date('2026-01-02T03:04:05Z')), '2026-01-02T030405');
  assert.match(formatTimestamp(new Date('2026-08-17T17:33:43Z')), /^\d{4}-\d{2}-\d{2}T\d{6}$/);
});

test('plain spec-slug fallback with --create mkdir-only mints a bare run directory (the /flow and /dispatch mint shape) — no decisions.md/staged', () => {
  const main = gitRepo();
  const out = resolve({
    cwd: main, env: {}, specSlug: 'spec-88', create: true,
    now: new Date('2026-03-04T05:06:07Z'),
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.created, true);
  assert.strictEqual(path.basename(out.path), '2026-03-04T050607-spec-88');
  assert.ok(fs.statSync(out.path).isDirectory());
  assert.ok(!fs.existsSync(path.join(out.path, 'decisions.md')), 'the mkdir-only mint shape must not pre-populate decisions.md');
});

test('--create with neither --standalone nor --spec-slug fails loud (nothing to name the new directory)', () => {
  const main = gitRepo();
  const out = resolve({ cwd: main, env: {}, create: true });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.created, false);
});

test('--create with --standalone and --mode confirm (not auto) refuses to create', () => {
  const main = gitRepo();
  const out = resolve({ cwd: main, env: {}, standalone: 'tidy', mode: 'confirm', create: true });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.created, false);
  const pipelinesDir = path.join(main, '.claude-tweaks', 'pipelines');
  assert.ok(!fs.existsSync(pipelinesDir));
});

test('--create with --standalone and no --mode at all proceeds unconditionally (wrap-up\'s own exception — every mode, not just auto)', () => {
  const main = gitRepo();
  const out = resolve({ cwd: main, env: {}, standalone: 'record-42', create: true });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.created, true);
});

test('--root-only prints the anchored main checkout root, ignoring every other flag', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const out = resolve({ cwd: wt, env: {}, rootOnly: true });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.path, main);
  assert.strictEqual(out.created, false);
});

test('not a git repo at all: fails loud rather than silently resolving to something', () => {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-rdr-norepo-'));
  const out = resolve({ cwd: dir, env: {} });
  assert.strictEqual(out.ok, false);
  assert.match(out.message, /git repo|not a git/i);
});
