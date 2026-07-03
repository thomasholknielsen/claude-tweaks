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
const bashInput = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

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
