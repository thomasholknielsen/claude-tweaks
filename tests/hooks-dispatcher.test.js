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

test('record-worktree --run pins the target run dir, ignoring a newer stale non-terminal run that would otherwise win the fallback', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-disp-'));
  const staleDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-15T090000-record-19');
  const ownDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  // staleDir sorts newer than ownDir and is non-terminal (interrupted, never
  // closed) — resolveRunDir's fallback (listRunDirs[0], newest non-terminal
  // by name) would pick staleDir over ownDir with no --run override. This is
  // exactly #19/#36's cross-contamination shape: a later, unrelated call
  // resolving to an older run's directory because it was never marked clean.
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, 'run-state.json'), JSON.stringify({ status: 'interrupted' }));
  fs.mkdirSync(ownDir, { recursive: true });

  const noFlag = runHook(['record-worktree', '/tmp/wt-fallback'], { cwd: project });
  assert.strictEqual(noFlag.code, 0);
  assert.match(noFlag.stdout, /worktree recorded for 2026-07-15T090000-record-19/,
    'sanity check: without --run, the fallback really does pick the newer stale run, not ownDir');
  assert.strictEqual(fs.existsSync(path.join(ownDir, 'run-state.json')), false);
  // The no-flag call above IS the vulnerability being demonstrated — it just
  // corrupted staleDir's state exactly like #19/#36. Snapshot that corrupted
  // state so the next assertion can prove the FIX (an explicitly-targeted
  // --run call) doesn't compound it by touching staleDir a second time.
  const staleStateAfterFallback = JSON.parse(fs.readFileSync(path.join(staleDir, 'run-state.json'), 'utf8'));

  const withFlag = runHook(['record-worktree', '--run', ownDir, '/tmp/wt-correct'], { cwd: project });
  assert.strictEqual(withFlag.code, 0);
  assert.match(withFlag.stdout, /worktree recorded for 2026-07-01T090000-spec-1/);
  const ownState = JSON.parse(fs.readFileSync(path.join(ownDir, 'run-state.json'), 'utf8'));
  assert.strictEqual(ownState.worktree, path.resolve('/tmp/wt-correct'));
  assert.strictEqual(ownState.status, 'active');
  const staleStateAfterExplicitCall = JSON.parse(fs.readFileSync(path.join(staleDir, 'run-state.json'), 'utf8'));
  assert.deepStrictEqual(staleStateAfterExplicitCall, staleStateAfterFallback,
    'an explicitly-targeted --run call must not touch a different run dir at all');
});

test('record-worktree accepts --run before or after the worktree positional', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const result = runHook(['record-worktree', '/tmp/wt-2', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  const state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.worktree, path.resolve('/tmp/wt-2'));
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

test('hooks.json registers PreToolUse matchers for Edit, Write, and NotebookEdit', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  const matchers = config.hooks.PreToolUse.map((entry) => entry.matcher);
  assert.ok(matchers.includes('Edit'), 'expected an Edit matcher');
  assert.ok(matchers.includes('Write'), 'expected a Write matcher');
  assert.ok(matchers.includes('NotebookEdit'), 'expected a NotebookEdit matcher');
});

test('e2e: pre-tool-use CLI denies an Edit when worktree.always policy is set in the main checkout', () => {
  const project = gitRepo();
  fs.mkdirSync(path.join(project, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude-tweaks', 'policy.yml'), 'worktree.always: true\n');
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'a.txt') } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
});

test('e2e: pre-tool-use CLI allows an Edit when worktree.always policy is not set', () => {
  const project = gitRepo();
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'a.txt') } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stdout, '');
});
