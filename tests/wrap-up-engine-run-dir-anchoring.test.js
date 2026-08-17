// tests/wrap-up-engine-run-dir-anchoring.test.js
//
// #790: bin/wrap-up-engine.js's --run-dir had no validation at all before
// `plan`'s fs.mkdirSync(args.runDir, { recursive: true }) — a bare relative
// value, or an absolute value resolving inside a linked worktree, silently
// created the run's audit trail as a worktree-relative shadow copy
// ([IL-127]'s shape). Unlike bin/hooks.js's resolveRunArg (which only ever
// operates on an ALREADY-EXISTING run dir), --run-dir here often names a
// directory that doesn't exist yet — so these tests deliberately never
// pre-create the target, proving the check does not depend on existence.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const ENGINE_JS = path.join(__dirname, '..', 'bin', 'wrap-up-engine.js');

function runPlan(args, cwd) {
  try {
    const stdout = execFileSync('node', [ENGINE_JS, 'plan', ...args], { cwd, timeout: 15000 });
    return { code: 0, stdout: stdout.toString('utf8'), stderr: '' };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString('utf8') : '',
      stderr: e.stderr ? e.stderr.toString('utf8') : '',
    };
  }
}

test('reject: --run-dir is a bare-relative path (never created)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const rel = path.join('.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-790');
  const out = runPlan(['--run-dir', rel, '--base', 'HEAD'], wt);
  assert.strictEqual(out.code, 2);
  assert.match(out.stderr, /resolves outside the main checkout/i);
  assert.ok(!fs.existsSync(path.join(wt, rel)), 'the shadow directory must never be created');
});

test('reject: --run-dir is absolute but resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const abs = path.join(wt, '.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-791');
  const out = runPlan(['--run-dir', abs, '--base', 'HEAD'], wt);
  assert.strictEqual(out.code, 2);
  assert.match(out.stderr, /resolves outside the main checkout/i);
  assert.ok(!fs.existsSync(abs), 'the shadow directory must never be created');
});

test('accept: --run-dir is absolute and anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const abs = path.join(main, '.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-792');
  const out = runPlan(['--run-dir', abs, '--base', 'HEAD'], wt);
  // Whatever happens downstream (gatherFacts against a minimal fixture repo),
  // the anchoring gate itself must not be what rejects it.
  assert.doesNotMatch(out.stderr, /resolves outside the main checkout/i);
});

test('reject: --run-dir resolves under a directory with no git repo ancestor at all — distinct message, not the worktree-shadow wording', () => {
  // #790 Finding 5: mainCheckoutRoot() returning null (no .git anywhere up
  // the ancestor chain) is a DIFFERENT failure than "exists, but resolves
  // outside a KNOWN main checkout" — a bare mkdtempSync dir with no git init
  // reproduces it without needing a git-repo fixture at all.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wrapup-norepo-'));
  const abs = path.join(bare, '.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-793');
  const out = runPlan(['--run-dir', abs, '--base', 'HEAD'], bare);
  assert.strictEqual(out.code, 2);
  assert.match(out.stderr, /could not determine the git repository root/i);
  assert.doesNotMatch(out.stderr, /resolves outside the main checkout/i);
  assert.ok(!fs.existsSync(abs), 'the shadow directory must never be created');
});
