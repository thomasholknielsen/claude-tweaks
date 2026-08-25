// tests/hooks-worktree-local-fallback-disclosure.test.js
//
// Review finding (whole-branch review, e90376a4..HEAD): resolveRunArg()'s
// #280 worktree-local-fallback disclosure (see
// tests/hooks-run-arg-anchoring.test.js's own #280 cases for record-worktree)
// was wired at only 1 of 7 call sites. CLI-level coverage that the other 6
// (record-pr, spec-status, close-run, teardown-run, archive-run,
// check-resume-freshness) now print the same disclosure line when --run
// resolves via the worktree-local fallback.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const HOOKS_JS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

function runHooks(cmd, args, cwd) {
  try {
    // #1270: neutralize any ambient PIPELINE_RUN_DIR (present in every
    // /flow-dispatched shell) so this spawn can't silently resolve against a
    // real run dir it never named — every case here already passes --run
    // explicitly, but this guard is the same defense-in-depth convention
    // #1130 established for every other bin/hooks.js test spawn helper.
    const stdout = execFileSync('node', [HOOKS_JS, cmd, ...args], {
      cwd, timeout: 15000, env: { ...process.env, PIPELINE_RUN_DIR: '' },
    });
    return { code: 0, stdout: stdout.toString('utf8') };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString('utf8') : '',
    };
  }
}

// A worktree-local run dir that's INITIALIZED (has a marker file) and has no
// main-checkout counterpart — the exact condition resolveRunArg's #280
// fallback adopts, per hooks-run-arg-anchoring.test.js.
function trappedInitializedRunDir(wt, runId) {
  const dir = path.join(wt, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'decisions.md'), '');
  return dir;
}

const CASES = [
  { cmd: 'record-pr', extraArgs: (trapped) => ['--run', trapped, '5', 'https://example.com/pr/5'] },
  { cmd: 'spec-status', extraArgs: (trapped) => ['--run', trapped] },
  { cmd: 'close-run', extraArgs: (trapped) => ['--run', trapped] },
  { cmd: 'teardown-run', extraArgs: (trapped) => ['--run', trapped] },
  { cmd: 'archive-run', extraArgs: (trapped) => ['--run', trapped] },
  { cmd: 'check-resume-freshness', extraArgs: (trapped) => ['--run', trapped] },
];

for (const { cmd, extraArgs } of CASES) {
  test(`#280: ${cmd} discloses the worktree-local fallback`, () => {
    const main = gitRepo();
    const wt = linkedWorktreeOf(main);
    const trapped = trappedInitializedRunDir(wt, `2026-01-01T000000-${cmd}-280`);
    const out = runHooks(cmd, extraArgs(trapped), wt);
    assert.match(out.stdout, /worktree-local fallback \(#280\)/i);
  });
}
