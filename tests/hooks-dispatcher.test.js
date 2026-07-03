// tests/hooks-dispatcher.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'bin', 'hooks.js');

function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-disp-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1'), { recursive: true });
  return dir;
}

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-disp-repo-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return fs.realpathSync(dir);
}

test('invariant: every event exits 0 on garbage stdin, no stdout noise', () => {
  for (const ev of ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop']) {
    const r = runHook([ev], { input: '%%%not json%%%' });
    assert.strictEqual(r.code, 0, `${ev} must exit 0 on garbage stdin`);
    if (r.stdout.trim()) assert.doesNotThrow(() => JSON.parse(r.stdout), `${ev} stdout must be empty or valid JSON`);
  }
});

test('invariant: unknown event and missing event exit 0', () => {
  assert.strictEqual(runHook(['no-such-event'], { input: '{}' }).code, 0);
  assert.strictEqual(runHook([], { input: '{}' }).code, 0);
});

test('record-worktree writes run-state, prints a confirmation line, and close-run marks clean', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const recorded = runHook(['record-worktree', '/tmp/wt-1'], { cwd: project });
  assert.strictEqual(recorded.code, 0);
  assert.match(recorded.stdout, /claude-tweaks: worktree recorded for 2026-07-01T090000-spec-1/);
  let state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.worktree, path.resolve('/tmp/wt-1'));
  assert.strictEqual(state.status, 'active');
  assert.strictEqual(runHook(['close-run'], { cwd: project }).code, 0);
  state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.status, 'clean');
});

test('record-worktree without a run dir exits 0 and prints a not-recorded notice', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  const result = runHook(['record-worktree', '/tmp/wt'], { cwd: bare });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /claude-tweaks: no pipeline run dir found — worktree not recorded/);
});

test('close-run lifts E1 enforcement: pre-tool-use allows a commit outside the old worktree', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const worktree = gitRepo();
  const otherRepo = gitRepo();

  assert.strictEqual(runHook(['record-worktree', worktree], { cwd: project }).code, 0);
  assert.strictEqual(runHook(['close-run'], { cwd: project }).code, 0);

  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: otherRepo }),
    env: { PIPELINE_RUN_DIR: run },
  });
  assert.strictEqual(result.code, 0);
  assert.ok(
    !result.stdout.includes('permissionDecision'),
    `expected close-run to lift E1 enforcement (no permissionDecision), got: ${result.stdout}`
  );
});
