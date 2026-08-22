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

test('bookkeeping-stamps gate: materialize commit landed, run resolved, no worktree stamp -> deny', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'expected a deny result');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-worktree/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  // appendEvent flattens `data` onto the event object (see context.js's
  // appendEvent and tests/hooks-dispatcher.test.js's events[0].tool/path
  // precedent) — there is no nested `.data` key, unlike the brief's literal
  // text for this assertion.
  assert.ok(events.some((e) => e.type === 'bookkeeping-stamp-deny' && e.stamp === 'record-worktree'));
});

test('bookkeeping-stamps gate: same deny fires for a Bash git-commit call, not just Edit/Write', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  fs.writeFileSync(path.join(wt, 'other.txt'), 'x'); // staged content for the commit below
  execFileSync('git', ['-C', wt, 'add', 'other.txt']);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: bashInput('git commit -m "unrelated fix"', wt), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'expected a deny result for a Bash git-commit call too');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-worktree/);
});

test('bookkeeping-stamps gate: materialize commit landed AND worktree stamp present -> allow (pr-first check runs but resolves local-merge, no origin remote on this fixture)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  // No origin remote on this fixture repo -> resolveIntegrationModel resolves
  // 'local-merge' (detectIntegrationModel's own fail-open first check), so the
  // PR-stamp branch (Task 3) never denies here even with runState.pr unset.
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: main checkout (not a linked worktree) -> allow regardless of stamps', () => {
  const main = gitRepo();
  commitMaterializedSpec(main, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: editInput(path.join(main, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped, resolveIntegrationModel stubbed to pr-first, no PR recorded -> deny', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.ok(out.json, 'expected a deny result once integration-model resolves pr-first with no PR recorded');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-pr|PR-early/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  // appendEvent flattens `data` onto the event object (see context.js's
  // appendEvent and this file's earlier record-worktree test's own comment
  // above) — there is no nested `.data` key, unlike the brief's literal text
  // for this assertion.
  assert.ok(events.some((e) => e.type === 'bookkeeping-stamp-deny' && e.stamp === 'record-pr'));
});

test('bookkeeping-stamps gate: worktree stamped, pr-first stubbed, degrade already logged in decisions.md -> allow (graceful degrade)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  fs.writeFileSync(
    path.join(run, 'decisions.md'),
    '## /build\n- AUTO 09:00:00 — PR-early run lifecycle: push of wt-branch to origin FAILED (network); run proceeds local-only, no PR opened. Reversibility: n/a.\n',
  );
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped, resolveIntegrationModel stubbed to local-merge, no PR recorded -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'local-merge' },
  );
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: through pre.run() with the real (unstubbed) resolveIntegrationModel — a fixture repo with no gh-backed remote resolves local-merge, PR branch never denies', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped AND pr recorded -> allow regardless of integration-model', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined, { pr: { number: 991, url: 'https://github.com/example/example/pull/991' } });
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt, pr: { number: 991, url: 'x' } }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {});
});

test('hasLoggedPrDegrade: recognizes the mandated PR-early run lifecycle FAILED log line', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, '/nonexistent', undefined);
  fs.writeFileSync(
    path.join(run, 'decisions.md'),
    '## /build\n- AUTO 14:32:14 — PR-early run lifecycle: push of feature-branch to origin FAILED (network); run proceeds local-only, no PR opened. Reversibility: n/a.\n',
  );
  assert.strictEqual(pre.hasLoggedPrDegrade(run), true);
});

test('hasLoggedPrDegrade: false when decisions.md has no matching line', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, '/nonexistent', undefined);
  fs.writeFileSync(path.join(run, 'decisions.md'), '## /build\n- AUTO 14:32:14 — unrelated entry.\n');
  assert.strictEqual(pre.hasLoggedPrDegrade(run), false);
});

test('hasLoggedPrDegrade: false when decisions.md does not exist', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, '/nonexistent', undefined);
  assert.strictEqual(pre.hasLoggedPrDegrade(run), false);
});
