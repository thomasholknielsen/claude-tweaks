// tests/hooks-pre-tool-use.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pre = require('../bin/lib/hooks/pre-tool-use');

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return fs.realpathSync(dir);
}
function mkRun(worktree) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1run-'));
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  const state = worktree ? { status: 'active', worktree } : { status: 'active' };
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { run, state };
}
// Multi-run helpers: several run dirs living under the SAME project, so
// listRunDirs(ctx.cwd) can see siblings — mirrors two parallel /flow
// terminals sharing one main checkout.
function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1proj-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines'), { recursive: true });
  return dir;
}
function mkRunAt(project, name, worktree) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(run, { recursive: true });
  const state = { status: 'active', worktree };
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { run, state };
}
const bashInput = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('commit in the assigned worktree is allowed', () => {
  const wt = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git commit -m "x"', wt), runDir: run, runState: state, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('commit in a different checkout is denied with corrective reason', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git commit -m "x"', other), runDir: run, runState: state, cwd: other });
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, new RegExp(wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(spec.permissionDecisionReason, /git -C/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-deny"/);
});

test('git -C into the assigned worktree from elsewhere is allowed', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput(`git -C ${wt} commit -m "x"`, other), runDir: run, runState: state, cwd: other });
  assert.deepStrictEqual(out, {});
});

test('push mismatch logs but never denies', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git push origin main', other), runDir: run, runState: state, cwd: other });
  assert.deepStrictEqual(out, {});
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-push-mismatch"/);
});

test('ambiguity allows: no worktree assigned, non-repo dir, non-Bash tool, no run dir', () => {
  const wt = gitRepo();
  const { run, state } = mkRun(null);
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', wt), runDir: run, runState: state, cwd: wt }), {});
  const assigned = mkRun(wt);
  const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-nonrepo-'));
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', nonRepo), runDir: assigned.run, runState: assigned.state, cwd: nonRepo }), {});
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'Edit', tool_input: {}, cwd: wt }, runDir: assigned.run, runState: assigned.state, cwd: wt }), {});
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', wt), runDir: null, runState: null, cwd: wt }), {});
});

test('two live runs: commit in the OLDER run\'s own worktree is allowed even when the resolved run is the NEWER one, and logs wd-ambiguous on the resolved run', () => {
  const project = tmpProject();
  const olderWt = gitRepo();
  const newerWt = gitRepo();
  mkRunAt(project, '2026-07-01T090000-spec-1', olderWt); // older, non-terminal, NOT the resolved run
  const newer = mkRunAt(project, '2026-07-02T090000-spec-2', newerWt); // resolved run

  const out = pre.run({
    input: bashInput(`git -C ${olderWt} commit -m "x"`, project),
    runDir: newer.run,
    runState: newer.state,
    cwd: project,
  });
  assert.deepStrictEqual(out, {});
  const events = fs.readFileSync(path.join(newer.run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-ambiguous"/);
  assert.match(events, new RegExp(esc(olderWt)));
});

test('two live runs: commit in a THIRD repo matching neither worktree is still denied, reason mentions both worktrees', () => {
  const project = tmpProject();
  const olderWt = gitRepo();
  const newerWt = gitRepo();
  const thirdRepo = gitRepo();
  mkRunAt(project, '2026-07-01T090000-spec-1', olderWt);
  const newer = mkRunAt(project, '2026-07-02T090000-spec-2', newerWt);

  const out = pre.run({
    input: bashInput(`git -C ${thirdRepo} commit -m "x"`, project),
    runDir: newer.run,
    runState: newer.state,
    cwd: project,
  });
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, new RegExp(esc(newerWt)));
  assert.match(spec.permissionDecisionReason, new RegExp(esc(olderWt)));
});

test('two live runs: a push mismatch matching another live worktree is not logged at all', () => {
  const project = tmpProject();
  const olderWt = gitRepo();
  const newerWt = gitRepo();
  mkRunAt(project, '2026-07-01T090000-spec-1', olderWt);
  const newer = mkRunAt(project, '2026-07-02T090000-spec-2', newerWt);

  const out = pre.run({
    input: bashInput(`git -C ${olderWt} push origin main`, project),
    runDir: newer.run,
    runState: newer.state,
    cwd: project,
  });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(newer.run, 'events.jsonl')));
});

test('deny reason substitutes CLAUDE_PLUGIN_ROOT when set, else keeps the literal placeholder', () => {
  const wt = gitRepo();
  const other = gitRepo();

  delete process.env.CLAUDE_PLUGIN_ROOT;
  const { run: run1, state: state1 } = mkRun(wt);
  const withoutEnv = pre.run({ input: bashInput('git commit -m "x"', other), runDir: run1, runState: state1, cwd: other });
  assert.match(withoutEnv.json.hookSpecificOutput.permissionDecisionReason, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hooks\.js/);

  process.env.CLAUDE_PLUGIN_ROOT = '/opt/claude-tweaks';
  try {
    const { run: run2, state: state2 } = mkRun(wt);
    const withEnv = pre.run({ input: bashInput('git commit -m "x"', other), runDir: run2, runState: state2, cwd: other });
    assert.match(withEnv.json.hookSpecificOutput.permissionDecisionReason, /\/opt\/claude-tweaks\/bin\/hooks\.js/);
  } finally {
    delete process.env.CLAUDE_PLUGIN_ROOT;
  }
});
