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

test('record-worktree stamps the owning session from CLAUDE_CODE_SESSION_ID and preserves it on env-less re-record', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt-1'], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'sess-owner' } });
  let state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.sessionId, 'sess-owner');
  runHook(['record-worktree', '/tmp/wt-1'], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: '' } });
  state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.sessionId, 'sess-owner', 'env-less re-record must not clobber the stamp');
});

test('record-worktree without CLAUDE_CODE_SESSION_ID records no owner', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt-2'], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: '' } });
  const state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.ok(!('sessionId' in state), 'no env var -> no sessionId field');
});

test('close-run notes when closing a run recorded by another session, stays silent for the owner', () => {
  const foreignProject = tmpProject();
  runHook(['record-worktree', '/tmp/wt'], { cwd: foreignProject, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  const foreign = runHook(['close-run'], { cwd: foreignProject, env: { CLAUDE_CODE_SESSION_ID: 'bystander' } });
  assert.strictEqual(foreign.code, 0);
  assert.match(foreign.stdout, /recorded by another session/);

  const ownProject = tmpProject();
  runHook(['record-worktree', '/tmp/wt'], { cwd: ownProject, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  const own = runHook(['close-run'], { cwd: ownProject, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  assert.strictEqual(own.code, 0);
  assert.strictEqual(own.stdout, '');
});

test('e2e: foreign-session commit in the main checkout is allowed with a systemMessage, not denied', () => {
  const project = tmpProject();
  execFileSync('git', ['-C', project, 'init', '-q']);
  const worktree = gitRepo();
  runHook(['record-worktree', worktree], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });

  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: project, session_id: 'bystander' }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.ok(!result.stdout.includes('permissionDecision'), `expected allow, got: ${result.stdout}`);
  assert.match(result.stdout, /"systemMessage"/);
  assert.match(result.stdout, /allowing this commit/);
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
