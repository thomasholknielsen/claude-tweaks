// tests/teardown-gate.test.js
// This suite grows through Tasks 1-4 of the teardown-gate plan (spec #373).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { findRunByWorktreePath, readRunState } = require('../bin/lib/hooks/context');
const { fixtureGit } = require('./helpers/git-fixtures');

const HOOKS = path.join(__dirname, '..', 'bin', 'hooks.js');

function sh(cwd, ...args) {
  return fixtureGit(['-C', cwd, ...args]).toString();
}

// Spawns the real dispatcher (`node bin/hooks.js <args>`), same pattern as
// tests/hooks-dispatcher.test.js. Task 3's tests are dispatcher-level, not
// unit-level, so they exercise the exact stdin-parse -> ctx-build -> module.run
// -> stdout-write path a real hook invocation goes through.
// `PIPELINE_RUN_DIR: ''` neutralizes any ambient run-dir env var so
// resolveRun's env-attribution branch never wins over the fixture's own
// fallback scan.
function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, PIPELINE_RUN_DIR: '', ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

// A linked worktree of `root` (itself created via fixtureRoot()), placed
// OUTSIDE the main checkout — the shape raw `git worktree add` produces, and
// what wtDetect.mainCheckoutRoot's admin-dir walk-back is exercised against
// when the gate resolves a run from inside the worktree itself (ExitWorktree's
// real cwd).
let wtSeq = 0;
function addWorktree(root) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-tdg-wt-'));
  const wt = path.join(parent, 'wt');
  sh(root, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${wtSeq++}`);
  return fs.realpathSync(wt);
}

// A main-checkout repo root with .claude-tweaks/pipelines inside it.
// findRunByWorktreePath's underlying iterRunDirsWithState anchors via the
// main checkout resolution (bin/lib/hooks/worktree-detect.js), so the fixture
// root must itself be a real git repo, same as tests/run-integrity.test.js.
function fixtureRoot() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-tdg-')));
  fixtureGit(['init', '-q', '-b', 'trunk', root]);
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  sh(root, 'add', 'a.txt');
  sh(root, 'commit', '-q', '-m', 'base');
  return root;
}

let runSeq = 0;
function makeRun(root, state) {
  const name = `2026-08-01T09000${runSeq}-spec-9`;
  runSeq += 1;
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(runDir, { recursive: true });
  if (state !== undefined) {
    fs.writeFileSync(path.join(runDir, 'run-state.json'), state);
  }
  return runDir;
}

test('exact-path match returns the run', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-exact');
  fs.mkdirSync(wt);
  const runDir = makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const result = findRunByWorktreePath(root, wt);
  assert.ok(result, 'expected a match');
  assert.strictEqual(result.runDir, runDir);
  assert.strictEqual(result.state.worktree, wt);
});

test('realpath match (symlinked target) returns the run', () => {
  const root = fixtureRoot();
  const real = path.join(root, 'wt-real');
  fs.mkdirSync(real);
  const link = path.join(root, 'wt-link');
  fs.symlinkSync(real, link);
  const runDir = makeRun(root, JSON.stringify({ status: 'active', worktree: real }));
  // Query via the symlink; recorded assignment is the canonical real path.
  const result = findRunByWorktreePath(root, link);
  assert.ok(result, 'expected a match via realpath canonicalization');
  assert.strictEqual(result.runDir, runDir);
});

test('unmatched path returns null', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-recorded');
  fs.mkdirSync(wt);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const other = path.join(root, 'wt-other');
  fs.mkdirSync(other);
  const result = findRunByWorktreePath(root, other);
  assert.strictEqual(result, null);
});

test('terminal (clean) run is not returned', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-clean');
  fs.mkdirSync(wt);
  makeRun(root, JSON.stringify({ status: 'clean', worktree: wt }));
  const result = findRunByWorktreePath(root, wt);
  assert.strictEqual(result, null);
});

test('corrupt run-state.json returns null for that run without throwing', () => {
  const root = fixtureRoot();
  const wt = path.join(root, 'wt-corrupt');
  fs.mkdirSync(wt);
  makeRun(root, '{not valid json');
  assert.doesNotThrow(() => {
    const result = findRunByWorktreePath(root, wt);
    assert.strictEqual(result, null);
  });
});

// --- Task 3: the deny/allow matrix at the dispatcher level ------------------

// AC1: ExitWorktree on a worktree assigned to a non-terminal run -> deny.
test('AC1: ExitWorktree on a worktree assigned to an active run is denied', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  const runDir = makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const payload = JSON.stringify({
    tool_name: 'ExitWorktree', tool_input: { action: 'keep' }, cwd: wt, session_id: 'caller-1',
  });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: wt });
  assert.strictEqual(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes(runDir),
    'deny reason must name the run dir path');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('cleanup-procedures.md'),
    'deny reason must point at the documented cleanup sequence');
});

// AC2: same payload, after the run was closed -> allow.
test('AC2: after close-run, the identical ExitWorktree payload is allowed', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  const runDir = makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const closed = runHook(['close-run', '--run', runDir], { cwd: root });
  assert.strictEqual(closed.code, 0);
  assert.strictEqual(readRunState(runDir).status, 'clean');
  const payload = JSON.stringify({
    tool_name: 'ExitWorktree', tool_input: { action: 'keep' }, cwd: wt, session_id: 'caller-1',
  });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: wt });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.stdout.trim(), '', 'a clean run must not be enforced');
});

// AC3: the narrow `git worktree remove [--force] <path>` Bash shape.
test('AC3: Bash `git worktree remove <abs-path>` on an active run\'s worktree is denied', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: `git worktree remove ${wt}` }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('AC3: Bash `git worktree remove <relative-path>` resolving to the same worktree is denied', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  // The call cwd must stay INSIDE root's main-checkout tree — findRunByWorktreePath
  // anchors its run scan off ctx.cwd via mainCheckoutRoot, so a cwd with no
  // ancestor .git (e.g. a bare unrelated tmpdir) would resolve zero runs
  // regardless of whether the relative path itself resolves correctly.
  const callCwd = path.join(root, 'sub');
  fs.mkdirSync(callCwd);
  const rel = path.relative(callCwd, wt);
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: `git worktree remove ${rel}` }, cwd: callCwd });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: callCwd });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny',
    `relative path ${rel} from ${callCwd} must resolve to ${wt} and be denied`);
});

test('AC3: Bash `git worktree remove --force <abs-path>` on an active run\'s worktree is denied', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: `git worktree remove --force ${wt}` }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('AC3: `git worktree list` is allowed', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git worktree list' }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  assert.strictEqual(r.stdout.trim(), '');
});

test('AC3: `git worktree prune` is allowed', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git worktree prune' }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  assert.strictEqual(r.stdout.trim(), '');
});

// AC4: fail-open cases.
test('AC4: an unresolvable teardown target (no positional path) is allowed', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  // `--force` alone leaves zero positionals after filtering -> teardownTargets
  // deliberately produces no target for this segment (unconfident -> allow),
  // even though an active run exists for `wt`.
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git worktree remove --force' }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  assert.strictEqual(r.stdout.trim(), '');
});

test('AC4: a target matching no recorded assignment is allowed', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt })); // assigned to a DIFFERENT path
  const other = addWorktree(root);
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: `git worktree remove ${other}` }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  assert.strictEqual(r.stdout.trim(), '');
});

test('AC4: a recorded worktree path already deleted from disk is allowed', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  sh(root, 'worktree', 'remove', '--force', wt); // actually tear it down; run-state.json is untouched
  assert.strictEqual(fs.existsSync(wt), false, 'sanity check: the worktree path must be gone from disk');
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: `git worktree remove ${wt}` }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  assert.strictEqual(r.stdout.trim(), '');
});

// AC5: ownership.
test('AC5: a foreign-owned run warns instead of denying, and logs wd-foreign-teardown', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root); // empty run dir (no run-state.json yet) for record-worktree to claim
  const recorded = runHook(['record-worktree', wt], { cwd: root, env: { CLAUDE_CODE_SESSION_ID: 'owner-1' } });
  assert.strictEqual(recorded.code, 0);
  assert.match(recorded.stdout, /worktree recorded/);
  const runDir = findRunByWorktreePath(root, wt).runDir;
  const payload = JSON.stringify({
    tool_name: 'ExitWorktree', tool_input: { action: 'keep' }, cwd: wt, session_id: 'bystander-2',
  });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: wt });
  assert.strictEqual(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput, undefined, 'foreign-owned teardown must not deny');
  assert.ok(out.systemMessage, 'foreign-owned teardown must warn');
  const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').trim().split('\n');
  const last = JSON.parse(events[events.length - 1]);
  assert.strictEqual(last.type, 'wd-foreign-teardown');
  assert.strictEqual(last.path, wt);
});

test('AC5: an unowned run with a payload carrying no session_id is denied', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt })); // no sessionId recorded
  const payload = JSON.stringify({ tool_name: 'ExitWorktree', tool_input: { action: 'keep' }, cwd: wt });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: wt });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
});

// Garbage stdin: the dispatcher-wide invariant, re-asserted for the
// ExitWorktree-shaped truncated payload this task's gate specifically parses.
test('garbage: truncated ExitWorktree stdin exits 0 with no stdout noise', () => {
  const r = runHook(['pre-tool-use'], { input: '{"tool_name":"ExitWorktree"' });
  assert.strictEqual(r.code, 0);
  if (r.stdout.trim()) assert.doesNotThrow(() => JSON.parse(r.stdout));
});
