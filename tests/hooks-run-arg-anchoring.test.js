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
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const HOOKS_JS = path.join(__dirname, '..', 'bin', 'hooks.js');

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
