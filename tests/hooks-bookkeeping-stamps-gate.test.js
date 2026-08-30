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

// Every test's run dir basename AND every materialize commit's path segment.
// The sentinel is scoped to the run's own id (whole-branch review C1+C2), so a
// mismatch between these two would make a test assert the wrong thing.
const RUN_ID = '2026-08-22T061958-record-991';

// Commits at the CANONICAL materialize write location — `{run-dir}/work/{n}-spec.md`,
// where `{run-dir}` is `.claude-tweaks/pipelines/{run-id}` (flow/materialize.md;
// in worktree mode, the worktree-local mirror of that same relative path).
// `tailPath` is the run-dir-relative tail: `work/{n}-spec.md` for a single-record
// run, `spec-{slug}/work/{n}-spec.md` for the multi-record shape.
function commitMaterializedSpec(wt, tailPath, runId = RUN_ID) {
  const relPath = path.join('.claude-tweaks', 'pipelines', runId, tailPath);
  const abs = path.join(wt, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '---\nrecord: 1\n---\nbody\n');
  execFileSync('git', ['-C', wt, 'add', '-f', relPath]);
  execFileSync('git', ['-C', wt, 'commit', '-m', 'Materialize spec', '-q']);
}

// A throwaway stand-in for the MAIN checkout that a run dir is anchored to —
// deliberately not the fixture git repo, so a test that anchors the run dir
// outside the worktree it enforces in says so by passing `main` instead.
function projectDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
}

// appendEvent flattens `data` onto the event object (see context.js's
// appendEvent and tests/hooks-dispatcher.test.js's events[0].tool/path
// precedent) — there is no nested `.data` key, unlike the brief's literal
// text for the assertions below.
function readEvents(run) {
  return fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

function mkRunDir(project, worktree, sessionId, extra) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', RUN_ID);
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
  const { run } = mkRunDir(projectDir(), null, undefined);
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
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'multi-record spec-{slug}/work/{n}-spec.md form must also be recognized as a landed materialize commit');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('bookkeeping-stamps gate: materialize commit landed, run resolved, no worktree stamp -> deny', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'expected a deny result');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-worktree/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
  assert.ok(readEvents(run).some((e) => e.type === 'bookkeeping-stamp-deny' && e.stamp === 'record-worktree'));
});

test('bookkeeping-stamps gate: same deny fires for a Bash git-commit call, not just Edit/Write', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  fs.writeFileSync(path.join(wt, 'other.txt'), 'x'); // staged content for the commit below
  execFileSync('git', ['-C', wt, 'add', 'other.txt']);
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({ input: bashInput('git commit -m "unrelated fix"', wt), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'expected a deny result for a Bash git-commit call too');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-worktree/);
});

test('bookkeeping-stamps gate: materialize commit landed, run dir resolved but run-state.json never written (record-worktree never ran) -> deny, not allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = projectDir();
  const run = path.join(project, '.claude-tweaks', 'pipelines', RUN_ID);
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'decisions.md'), '# Auto-Decision Log\n');
  // Deliberately no run-state.json -- mirrors bin/hooks.js's real wiring
  // (`runState = runDir ? ctxLib.readRunState(runDir) : null`), where a
  // resolved-but-uninitialized run dir yields runState === null, not {}.
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: null, cwd: wt });
  assert.ok(out.json, 'expected a deny result -- a landed materialize commit with no run-state.json at all must not be treated as "no run resolved"');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-worktree/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
});

test('bookkeeping-stamps gate: materialize commit landed AND worktree stamp present -> allow (pr-first check runs but resolves local-merge, no origin remote on this fixture)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined);
  // No origin remote on this fixture repo -> resolveIntegrationModel resolves
  // 'local-merge' (detectIntegrationModel's own fail-open first check), so the
  // PR-stamp branch (Task 3) never denies here even with runState.pr unset.
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: main checkout (not a linked worktree) -> allow regardless of stamps', () => {
  const main = gitRepo();
  commitMaterializedSpec(main, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({ input: editInput(path.join(main, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped, resolveIntegrationModel stubbed to pr-first, no PR recorded -> deny', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined);
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.ok(out.json, 'expected a deny result once integration-model resolves pr-first with no PR recorded');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-pr|PR-early/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
  assert.ok(readEvents(run).some((e) => e.type === 'bookkeeping-stamp-deny' && e.stamp === 'record-pr'));
});

test('bookkeeping-stamps gate (#989): worktree stamped, pr-first stubbed, a push establishing a not-yet-tracked branch -> allow (pr-early-run-lifecycle.md Step 2 itself, not yet deniable)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const branch = execFileSync('git', ['-C', wt, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  // No `origin` remote configured at all on this fixture, and this branch has
  // never been pushed -> `@{u}` fails -> hasNoUpstreamYet is true. Without
  // the #989 fix this exact call — the run's own first publish push, made
  // before any PR can exist to record — is denied by the same gate that is
  // supposed to make Step 6 non-skippable, a chicken-and-egg regression that
  // makes Step 6 structurally impossible to ever complete.
  const out = pre.run(
    { input: bashInput(`git push origin ${branch}`, wt), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {}, 'the initial publish push must not be denied — it is the prerequisite record-pr cannot exist without');
});

test('bookkeeping-stamps gate (#989): worktree stamped, pr-first stubbed, a push of an ALREADY-tracked branch with no PR recorded -> still deny', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  execFileSync('git', ['remote', 'add', 'origin', main], { cwd: wt });
  const branch = execFileSync('git', ['-C', wt, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  // Establish the upstream for real (a genuine first push succeeding, exactly
  // what the test above allows) — this is Step 2 having already run once for
  // this branch. `gh pr create` (Step 3) never followed it: no PR recorded,
  // no degrade logged. A second push here must not be silently exempted too —
  // that would reopen exactly the "keep pushing forever, never open the PR"
  // gap IL-131 exists to close, only shifted from Edit/commit onto push.
  execFileSync('git', ['-C', wt, 'push', '-u', 'origin', branch], { stdio: 'ignore' });
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.run(
    { input: bashInput(`git push origin ${branch}`, wt), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.ok(out.json, 'a push of an already-tracked branch with no PR recorded and no degrade logged must still deny');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-pr|PR-early/);
});

test('bookkeeping-stamps gate: worktree stamped, pr-first stubbed, degrade already logged in decisions.md -> allow (graceful degrade)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined);
  fs.writeFileSync(
    path.join(run, 'decisions.md'),
    '## /build\n- AUTO 09:00:00 — PR-early run lifecycle: push of wt-branch to origin FAILED (network); run proceeds local-only, no PR opened. Reversibility: n/a.\n',
  );
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped, resolveIntegrationModel stubbed to local-merge, no PR recorded -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined);
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'local-merge' },
  );
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: through pre.run() with the real (unstubbed) resolveIntegrationModel — a fixture repo with no gh-backed remote resolves local-merge, PR branch never denies', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped AND pr recorded -> allow regardless of integration-model', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined, { pr: { number: 991, url: 'https://github.com/example/example/pull/991' } });
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt, pr: { number: 991, url: 'x' } }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {});
});

// hasLoggedPrDegrade has no ctx of its own (just a runDir), so it is exercised
// here exclusively through its one observable effect on checkBookkeepingStampsGate's
// pr-first branch, reached via pre.run() rather than by calling the helper
// directly (record #1268). Three cases:
//   - matching FAILED line -> allow: 'bookkeeping-stamps gate: worktree stamped,
//     pr-first stubbed, degrade already logged in decisions.md -> allow (graceful
//     degrade)' above already covers this exactly (hasLoggedPrDegrade's true case).
//   - decisions.md exists but has no matching line -> deny: this test.
//   - decisions.md does not exist at all -> deny: 'bookkeeping-stamps gate:
//     worktree stamped, resolveIntegrationModel stubbed to pr-first, no PR
//     recorded -> deny' above already covers this (no decisions.md is ever
//     written in that fixture) — hasLoggedPrDegrade's other false case.
test('bookkeeping-stamps gate: decisions.md exists but has no matching PR-early degrade line -> still deny (hasLoggedPrDegrade false case)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined);
  fs.writeFileSync(path.join(run, 'decisions.md'), '## /build\n- AUTO 14:32:14 — unrelated entry.\n');
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.ok(out.json, 'expected a deny result — decisions.md exists but has no PR-early degrade line');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-pr|PR-early/);
});

test('regression (IL-131 recurrence, records #118/#893): a build agent that materializes then edits code directly — no record-worktree, no record-pr — is denied on its very first code edit, not silently allowed through', () => {
  // Reproduces the exact trigger: build judged "already satisfied by prior
  // work," skipped straight from the materialize commit to editing
  // implementation code, never calling record-worktree or record-pr.
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '893-spec.md'));
  const { run } = mkRunDir(projectDir(), null, undefined); // record-worktree never ran

  // The first tool call after materialize: an Edit to some already-satisfied
  // file, exactly the "nothing further to implement" shortcut IL-131 describes.
  const out = pre.run({
    input: editInput(path.join(wt, 'plugin', 'skills', 'build', 'SKILL.md')),
    runDir: run,
    runState: { status: 'active' },
    cwd: wt,
  });

  assert.ok(out.json, 'expected the sweep-past-both-stamps case to be caught, not silently allowed');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-worktree/);

  // Simulate remediation: run record-worktree, retry the same edit.
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'active', worktree: wt }));
  const retry = pre.run({
    input: editInput(path.join(wt, 'plugin', 'skills', 'build', 'SKILL.md')),
    runDir: run,
    runState: { status: 'active', worktree: wt },
    cwd: wt,
  });
  // No origin remote on this fixture -> local-merge, so the PR-stamp branch
  // never applies here; the edit is now allowed once the worktree stamp lands.
  assert.deepStrictEqual(retry, {});
});

// --- C1+C2: the materialize sentinel is scoped to THIS run's own id ---

test('bookkeeping-stamps gate (C2 discrimination): a DIFFERENT run-id\'s materialize commit does NOT satisfy this run\'s sentinel', () => {
  // Two runs each get their own worktree in production, but a sibling run's
  // committed spec can be reachable in the same history (a merge, a shared
  // base). The pathspec must be scoped to ctx.runDir's own basename, not to
  // "any {run-id}/work/*-spec.md anywhere" — otherwise the gate arms itself
  // off another run's bookkeeping and denies universally.
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '777-spec.md'), '2026-08-01T000000-record-777');
  const { run } = mkRunDir(projectDir(), null, undefined); // basename is RUN_ID, not the committed run
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.deepStrictEqual(out, {}, 'another run\'s materialize commit must not arm this run\'s gate');
});

test('bookkeeping-stamps gate (C1/C2 discrimination): a legacy top-level work/{n}-spec.md commit does NOT satisfy the sentinel', () => {
  // ~100 of these exist in this repo's own history from before run-dir
  // anchoring. A repo-root-relative `work` pathspec would match every one of
  // them and arm the gate permanently on every branch.
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const legacy = path.join(wt, 'work', '499-spec.md');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, 'legacy\n');
  execFileSync('git', ['-C', wt, 'add', '-f', path.join('work', '499-spec.md')]);
  execFileSync('git', ['-C', wt, 'commit', '-m', 'legacy top-level spec', '-q']);
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.deepStrictEqual(out, {}, 'a pre-anchoring top-level work/ spec must not arm the gate');
});

test('bookkeeping-stamps gate: a non-work file committed inside this run\'s own run dir does NOT satisfy the sentinel', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const decisions = path.join(wt, '.claude-tweaks', 'pipelines', RUN_ID, 'decisions.md');
  fs.mkdirSync(path.dirname(decisions), { recursive: true });
  fs.writeFileSync(decisions, '## /build\n');
  execFileSync('git', ['-C', wt, 'add', '-f', path.join('.claude-tweaks', 'pipelines', RUN_ID, 'decisions.md')]);
  execFileSync('git', ['-C', wt, 'commit', '-m', 'log', '-q']);
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.deepStrictEqual(out, {}, 'only work/{n}-spec.md (or spec-*/work/*) is the materialize sentinel');
});

// --- I1: ownership scoping (the deny's own remediation would corrupt a sibling run) ---

test('bookkeeping-stamps gate (I1): a provably foreign-owned run warns instead of denying', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), null, 'owner-session');
  const out = pre.run({
    input: { ...editInput(path.join(wt, 'src', 'x.js')), session_id: 'caller-session' },
    runDir: run,
    runState: { status: 'active', sessionId: 'owner-session' },
    cwd: wt,
  });
  assert.ok(!out.json || !out.json.hookSpecificOutput, 'a foreign-owned run must not be denied');
  assert.match(out.json.systemMessage, /different session/);
  assert.ok(readEvents(run).some((e) => e.type === 'wd-foreign-session' && e.stamp === 'record-worktree'));
});

test('bookkeeping-stamps gate (I1): identity missing on either side still denies (unprovable is not foreign)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), null, 'owner-session');
  const out = pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')), // no session_id on the caller side
    runDir: run,
    runState: { status: 'active', sessionId: 'owner-session' },
    cwd: wt,
  });
  assert.ok(out.json, 'expected a deny');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('bookkeeping-stamps gate (I1): the pr-first branch warns instead of denying for a foreign-owned run', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, 'owner-session');
  const out = pre.run(
    {
      input: { ...editInput(path.join(wt, 'src', 'x.js')), session_id: 'caller-session' },
      runDir: run,
      runState: { status: 'active', worktree: wt, sessionId: 'owner-session' },
      cwd: wt,
    },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  // Through pre.run(), a collected allow-but-warn note surfaces as
  // json.systemMessage (run()'s own header comment) rather than a separately
  // returned warnings array — there is no permissionDecision, since the call
  // is allowed, but the warning text is still attached.
  assert.ok(!out.json || !out.json.hookSpecificOutput, 'a foreign-owned run must not be denied for a missing PR stamp');
  assert.match(out.json.systemMessage, /different session/);
});

// --- #1259: ctx.ownedRun strengthens the record-worktree branch specifically ---
//
// On the record-worktree branch, ctx.runState.worktree is provably unset —
// and sessionId is stamped together with worktree (record-worktree and
// post-tool-use.js's ad-hoc stamping both write them as a pair) — so
// ctx.runState.sessionId is almost always ALSO unset here, meaning
// isForeignSessionCall's owner-vs-caller comparison can essentially never
// fire on this branch (owner is empty). ctx.ownedRun (bin/hooks.js's own
// session-scoped resolveRun call, independent of this gate's session-agnostic
// ctx.runDir resolution) supplies the signal this branch has been missing: a
// live sibling session, mid-build in its OWN worktree with its OWN
// already-recorded run, calling into a DIFFERENT (unstamped) run this gate
// resolved via the newest-non-terminal fallback.

test('bookkeeping-stamps gate (#1259): a caller whose OWN resolved run differs from the run this gate would deny against warns instead of denying, even with no sessionId stamped on either side', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined); // unstamped: no worktree, no sessionId
  const ownRun = path.join(project, '.claude-tweaks', 'pipelines', 'sibling-own-run');
  fs.mkdirSync(ownRun, { recursive: true });
  const out = pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')),
    runDir: run,
    runState: { status: 'active' },
    ownedRun: { dir: ownRun, attribution: 'session' },
    cwd: wt,
  });
  assert.ok(!out.json || !out.json.hookSpecificOutput, 'a caller with its own distinct owned run must not be denied');
  assert.match(out.json.systemMessage, /different session/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.type === 'wd-foreign-session' && e.stamp === 'record-worktree'));
});

test('bookkeeping-stamps gate (#1259): ownedRun matching ctx.runDir (the ordinary single-session case) still denies', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')),
    runDir: run,
    runState: { status: 'active' },
    ownedRun: { dir: run, attribution: 'session' }, // same run — this IS the caller's own work
    cwd: wt,
  });
  assert.ok(out.json, 'expected a deny — the caller owns exactly this run, nothing foreign about it');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('bookkeeping-stamps gate (#1259): a distinct ownedRun does NOT loosen the PR-stamp branch — that guard is unchanged', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined); // worktree already stamped -> PR-stamp branch
  const ownRun = path.join(project, '.claude-tweaks', 'pipelines', 'sibling-own-run');
  fs.mkdirSync(ownRun, { recursive: true });
  const out = pre.run(
    {
      input: editInput(path.join(wt, 'src', 'x.js')),
      runDir: run,
      runState: { status: 'active', worktree: wt },
      ownedRun: { dir: ownRun, attribution: 'session' },
      cwd: wt,
    },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.ok(out.json, 'expected a deny — the PR-stamp branch must not consult ownedRun');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-pr|PR-early/);
});

// --- I2: path and foreign-repo exemptions ---

test('bookkeeping-stamps gate (I2.1): an Edit to the run dir\'s own decisions.md is exempt — the deny\'s escape hatch must not be deniable', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  // Run dirs are anchored to the MAIN checkout, so decisions.md sits outside
  // the worktree being enforced — the exemption has to resolve the target's
  // own repo root, not assume the worktree's.
  const { run } = mkRunDir(main, null, undefined);
  const exempt = pre.run({ input: editInput(path.join(run, 'decisions.md')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.deepStrictEqual(exempt, {}, 'a write into .claude-tweaks/pipelines/ must not be denied by this gate');
  // Control: the same scenario with an ordinary code file still denies, so the
  // exemption above is the reason for the allow, not a broken fixture.
  const denied = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(denied.json && denied.json.hookSpecificOutput, 'control: a non-exempt target must still be denied');
  assert.strictEqual(denied.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('bookkeeping-stamps gate (I2.1): the PR-stamp deny message names bin/log-decision.js as the runnable escape hatch', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), wt, undefined);
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /bin\/log-decision\.js/);
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /--run "/);
});

test('bookkeeping-stamps gate (I2.2): a Bash git commit targeting an unrelated repository is not this run\'s business -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const foreign = gitRepo();
  fs.writeFileSync(path.join(foreign, 'a.txt'), 'x');
  execFileSync('git', ['-C', foreign, 'add', 'a.txt']);
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({
    input: bashInput(`git -C ${foreign} commit -m "unrelated"`, wt),
    runDir: run,
    runState: { status: 'active' },
    cwd: wt,
  });
  assert.deepStrictEqual(out, {}, 'a commit into a foreign repo must not be denied by this run\'s bookkeeping gate');
});

test('bookkeeping-stamps gate (I2.2): one in-project git target is enough to keep the gate armed', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const foreign = gitRepo();
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({
    input: bashInput(`git -C ${foreign} commit -m "unrelated" && git commit -m "ours"`, wt),
    runDir: run,
    runState: { status: 'active' },
    cwd: wt,
  });
  assert.ok(out.json, 'expected a deny — one target is this run\'s own worktree');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});

// --- I3: integration-model comes from the run's own pin, not a fresh detection ---

test('bookkeeping-stamps gate (I3): the run\'s config.yml pin is read — pinned pr-first denies even with no forge detectable', () => {
  // The fixture repo has no origin remote, so fresh forge detection can only
  // ever return local-merge. A deny here proves the {runDir}/config.yml
  // overlay is actually consulted.
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(main, wt, undefined);
  fs.writeFileSync(path.join(run, 'config.yml'), 'integration-model: pr-first\n');
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.ok(out.json, 'expected a deny once the run pins pr-first');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /pr-first/);
});

test('bookkeeping-stamps gate (I3): the run\'s pin beats policy.yml — pinned local-merge is never denied for a missing PR', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  fs.mkdirSync(path.join(main, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(main, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
  const { run } = mkRunDir(main, wt, undefined);
  fs.writeFileSync(path.join(run, 'config.yml'), 'integration-model: local-merge\n');
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.deepStrictEqual(out, {}, 'a run pinned local-merge must never be denied for a PR it will never have');
});

test('bookkeeping-stamps gate (I3): with no run pin, policy.yml still wins over fresh detection', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  fs.mkdirSync(path.join(main, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(main, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
  const { run } = mkRunDir(main, wt, undefined); // no config.yml
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.ok(out.json, 'expected a deny — policy.yml pins pr-first and nothing overrides it');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});

// --- I5: both stamps present short-circuits before any git/gh spawn ---

// Routed through pre.run() (record #1268), which means every call here pays
// for the OTHER gates runInner runs ahead of checkBookkeepingStampsGate
// (checkPipelineShadowGuard in particular resolves repoInfo unconditionally,
// spawning git once regardless of what this gate would do) — so "zero total
// spawns" is no longer the right assertion once bypassing the dispatcher is
// off the table. What's still provable, and still the actual guarantee this
// gate makes, is that checkBookkeepingStampsGate's own short-circuit
// (runState.worktree && runState.pr) adds NO spawns beyond pre.run()'s own
// baseline dispatch overhead — measured with no run resolved at all, so
// checkBookkeepingStampsGate's `if (!ctx.runDir || !ctx.runState) return {};`
// fires first and every spawn counted is provably from the OTHER gates. The
// control case (worktree stamped, PR stamp missing) forces this gate to
// actually spawn (hasMaterializeCommit + resolveRunPinnedIntegrationModel),
// proving the comparison is live rather than trivially zero everywhere.
test('bookkeeping-stamps gate (I5): both stamps present adds no repo-inspection spawns beyond pre.run()\'s own baseline dispatch', () => {
  const cp = require('child_process');
  const original = cp.execFileSync;
  function withSpawnCount(fn) {
    let calls = 0;
    cp.execFileSync = function (...args) {
      if (args[0] === 'git' || args[0] === 'gh') calls += 1;
      return original.apply(this, args);
    };
    let out;
    try { out = fn(); } finally { cp.execFileSync = original; }
    return { out, calls };
  }

  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));

  const baseline = withSpawnCount(() => pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: null, runState: null, cwd: wt }));
  assert.deepStrictEqual(baseline.out, {});

  const { run } = mkRunDir(project, wt, undefined, { pr: { number: 1 } });
  const shortCircuit = withSpawnCount(() => pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')),
    runDir: run,
    runState: { status: 'active', worktree: wt, pr: { number: 1 } },
    cwd: wt,
  }));
  assert.deepStrictEqual(shortCircuit.out, {});
  assert.strictEqual(
    shortCircuit.calls, baseline.calls,
    'both stamps present must add zero repo-inspection spawns beyond pre.run()\'s own baseline dispatch',
  );

  // Control: worktree stamped but PR missing forces real inspection
  // (hasMaterializeCommit + resolveRunPinnedIntegrationModel) — strictly more
  // spawns than baseline, proving baseline isn't already saturated.
  const { run: controlRun } = mkRunDir(project, wt, undefined);
  const control = withSpawnCount(() => pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')),
    runDir: controlRun,
    runState: { status: 'active', worktree: wt },
    cwd: wt,
  }));
  assert.ok(
    control.calls > baseline.calls,
    `expected the missing-PR-stamp control to spawn more than the baseline (${baseline.calls}), got ${control.calls}`,
  );
});

// --- #1258: I5's fast path extended to the local-merge / degrade-logged
// steady state, via a persisted `runState.prExempt` verdict ---

// Shared spawn-counting helper (mirrors the I5 test's own local closure
// above — kept duplicated rather than hoisted, matching this file's existing
// per-test convention).
function withSpawnCount(fn) {
  const cp = require('child_process');
  const original = cp.execFileSync;
  let calls = 0;
  cp.execFileSync = function (...args) {
    if (args[0] === 'git' || args[0] === 'gh') calls += 1;
    return original.apply(this, args);
  };
  let out;
  try { out = fn(); } finally { cp.execFileSync = original; }
  return { out, calls };
}

test('bookkeeping-stamps gate (#1258): local-merge steady state — first resolution persists prExempt, a later call short-circuits like a fully-stamped pr-first run', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));

  const baseline = withSpawnCount(() => pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: null, runState: null, cwd: wt }));
  assert.deepStrictEqual(baseline.out, {});

  // First covered call after the worktree stamp: no origin remote on this
  // fixture -> real (unstubbed) resolveIntegrationModel resolves
  // 'local-merge' -> allow, and this is the call that must persist
  // `prExempt: true` onto run-state.json. Expected to spawn more than
  // baseline, same as the I5 test's own "missing-PR-stamp control" above —
  // proving this call is not already trivially at the fast path.
  const { run } = mkRunDir(project, wt, undefined);
  const first = withSpawnCount(() => pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')),
    runDir: run,
    runState: { status: 'active', worktree: wt },
    cwd: wt,
  }));
  assert.deepStrictEqual(first.out, {});
  assert.ok(
    first.calls > baseline.calls,
    `expected the first local-merge resolution to spawn more than baseline (${baseline.calls}), got ${first.calls}`,
  );
  const persisted = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(persisted.prExempt, true, 'first resolution must persist prExempt onto run-state.json');

  // Steady state: a later call reads the persisted prExempt (as production
  // code would, via ctx.runState freshly loaded from run-state.json on each
  // fresh hook process) and must add zero spawns beyond pre.run()'s own
  // baseline dispatch — the exact guarantee the AC requires: no worse than a
  // fully-stamped pr-first run's steady state.
  const steadyState = withSpawnCount(() => pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')),
    runDir: run,
    runState: { status: 'active', worktree: wt, prExempt: true },
    cwd: wt,
  }));
  assert.deepStrictEqual(steadyState.out, {});
  assert.strictEqual(
    steadyState.calls, baseline.calls,
    'a local-merge run\'s steady state (worktree stamped, prExempt persisted) must add zero repo-inspection ' +
    'spawns beyond pre.run()\'s own baseline dispatch',
  );
});

test('bookkeeping-stamps gate (#1258): pr-first with degrade already logged also persists prExempt', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  fs.writeFileSync(
    path.join(run, 'decisions.md'),
    '## /build\n- AUTO 09:00:00 — PR-early run lifecycle: push of wt-branch to origin FAILED (network); run proceeds local-only, no PR opened. Reversibility: n/a.\n',
  );
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {});
  const persisted = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(persisted.prExempt, true, 'a graceful-degrade allow must also persist prExempt — the degrade line is permanent (append-only)');
});

test('bookkeeping-stamps gate (#1258): a caught model-resolution exception never persists prExempt — a transient failure is not a provable verdict', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.run(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    { resolveIntegrationModel: () => { throw new Error('transient gh failure'); } },
  );
  // Fail-open: an unresolvable model is not provably pr-first, so this call allows.
  assert.deepStrictEqual(out, {});
  const persisted = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(
    persisted.prExempt, undefined,
    'a caught resolution exception must never persist prExempt — a later call might resolve pr-first and need to enforce',
  );
});
