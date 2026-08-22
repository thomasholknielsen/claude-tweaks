// tests/hooks-bookkeeping-stamps-gate.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pre = require('../plugin/bin/lib/hooks/pre-tool-use');

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

function linkedWorktreeOf(main) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-wtparent-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${path.basename(parent)}`]);
  return fs.realpathSync(wt);
}

function commitMaterializedSpec(wt, relPath) {
  const abs = path.join(wt, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '---\nrecord: 1\n---\nbody\n');
  execFileSync('git', ['-C', wt, 'add', relPath]);
  execFileSync('git', ['-C', wt, 'commit', '-m', 'Materialize spec', '-q']);
}

function mkRunDir(project, worktree, sessionId, extra) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-22T061958-record-991');
  fs.mkdirSync(run, { recursive: true });
  const state = { status: 'active', ...(worktree ? { worktree } : {}), ...(sessionId !== undefined ? { sessionId } : {}), ...extra };
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { run, state };
}

const editInput = (filePath) => ({ tool_name: 'Edit', tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' } });
const bashInput = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

test('bookkeeping-stamps gate: no materialize commit yet -> allow (Common Step 1 still in progress)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const { run } = mkRunDir(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-')), null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: materialize commit landed, no run resolved -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: null, runState: null, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: multi-record materialize commit (spec-{slug}/work/{n}-spec.md) also counts as the materialize sentinel -> deny reachable', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('spec-991-995', 'work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'multi-record spec-{slug}/work/{n}-spec.md form must also be recognized as a landed materialize commit');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});
