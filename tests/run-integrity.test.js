// tests/run-integrity.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkRunIntegrity, repoRootOf } = require('../plugin/bin/lib/hooks/run-integrity');
const { fixtureGit } = require('./helpers/git-fixtures');

function sh(cwd, ...args) {
  return fixtureGit(['-C', cwd, ...args]).toString();
}

// Fixture commit dates are pinned so the run-start corroboration check (#1463)
// is decided by fixture data, not by the machine clock. `fixtureRepo`'s history
// is dated AFTER its run dir's own 2026-08-01T090000 prefix (a genuinely
// shipped branch); `fixtureZeroCommitRepo`'s is dated BEFORE it (a branch that
// has never diverged).
function datedSh(cwd, iso, ...args) {
  return fixtureGit(['-C', cwd, ...args], {
    env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
  }).toString();
}
const AFTER_RUN_START = '2026-08-01T10:00:00Z';
const BEFORE_RUN_START = '2026-07-01T00:00:00Z';

// A main-checkout repo with an integration branch (named "trunk" — never "main",
// resolved via policy.yml's integration-branch key), one linked worktree on a
// feature branch with one commit, and one active run dir recording that worktree.
function fixtureRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ri-')));
  fixtureGit(['init', '-q', '-b', 'trunk', root]);
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  sh(root, 'add', 'a.txt');
  datedSh(root, AFTER_RUN_START, 'commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), 'integration-branch: trunk\n');
  const wt = path.join(root, '.claude', 'worktrees', 'feat');
  sh(root, 'worktree', 'add', '-q', '-b', 'feat-branch', wt);
  fs.writeFileSync(path.join(wt, 'b.txt'), 'feature\n');
  sh(wt, 'add', 'b.txt');
  datedSh(wt, AFTER_RUN_START, 'commit', '-q', '-m', 'feature work');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-01T090000-spec-9');
  fs.mkdirSync(runDir, { recursive: true });
  writeRunState(runDir, { status: 'active', worktree: wt });
  return { root, wt, runDir };
}

// The #1463 false-positive shape: a worktree branch created from the
// integration branch with ZERO commits of its own, so `merge-base
// --is-ancestor branch integration` is trivially true. All history predates
// the run directory's own 2026-08-01T090000 start time.
function fixtureZeroCommitRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ri-zc-')));
  fixtureGit(['init', '-q', '-b', 'trunk', root]);
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  sh(root, 'add', 'a.txt');
  datedSh(root, BEFORE_RUN_START, 'commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), 'integration-branch: trunk\n');
  const wt = path.join(root, '.claude', 'worktrees', 'fresh');
  sh(root, 'worktree', 'add', '-q', '-b', 'fresh-branch', wt);
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-01T090000-spec-9');
  fs.mkdirSync(runDir, { recursive: true });
  writeRunState(runDir, { status: 'active', worktree: wt });
  return { root, wt, runDir };
}

function writeRunState(runDir, state) {
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(state));
}

// Real landed event-line shapes from #371 (field order matters not; extra fields tolerated).
const EV_BUILD = '{"skill":"claude-tweaks:build","ts":"2026-08-01T09:05:00.000Z","type":"skill_invoked"}';
const EV_BUILD_FALLBACK = '{"skill":"claude-tweaks:build","attribution":"fallback","ts":"2026-08-01T09:05:00.000Z","type":"skill_invoked"}';
const EV_WRAPUP = '{"skill":"claude-tweaks:wrap-up","ts":"2026-08-01T09:50:00.000Z","type":"skill_invoked"}';
const EV_OTHER = '{"path":"/x","ts":"2026-08-01T09:00:00.000Z","type":"commit"}';

function writeEvents(runDir, lines) {
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), lines.join('\n') + '\n');
}

test('repoRootOf: resolves the repo root three levels up from {root}/.claude-tweaks/pipelines/{run-id} (pins the anchoring layout in _shared/pipeline-run-dir.md)', () => {
  const { root, runDir } = fixtureRepo();
  assert.strictEqual(repoRootOf(runDir), root);
  // A run dir NOT at the documented depth must not resolve to that same root —
  // pins the specific three-levels-up arithmetic, not just "some root nearby".
  const shallower = path.join(root, '.claude-tweaks', 'pipelines');
  assert.notStrictEqual(repoRootOf(shallower), root);
});

test('AC1: merged (ancestor) + active + non-wrap-up skill_invoked -> shipped-unclosed', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch'); // fast-forward or merge — either way ancestor
  writeEvents(runDir, [EV_OTHER, EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.branch, 'feat-branch');
  assert.strictEqual(r.evidence.merged, 'ancestor');
  assert.strictEqual(r.evidence.ledgerActive, true);
  assert.strictEqual(r.evidence.wrapupInvoked, false);
});

test('AC2: squash-merged (ancestry false, cherry all applied) -> shipped-unclosed via cherry', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--squash', 'feat-branch');
  sh(root, 'commit', '-q', '-m', 'squash: feature work');
  writeEvents(runDir, [EV_BUILD_FALLBACK]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.merged, 'cherry');
});

test('AC3a: branch unmerged -> in-progress', () => {
  const { runDir } = fixtureRepo();
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.merged, false);
});

test('AC3b: worktree + branch deleted, no other signal -> in-progress (deletion is never evidence)', () => {
  const { root, wt, runDir } = fixtureRepo();
  sh(root, 'worktree', 'remove', '--force', wt);
  sh(root, 'branch', '-q', '-D', 'feat-branch');
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.branch, null);
});

test('#1463: zero-commit worktree branch (trivially an ancestor) -> in-progress, even with a non-wrap-up ledger event', () => {
  const { runDir } = fixtureZeroCommitRepo();
  writeEvents(runDir, [EV_OTHER, EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  // mergedEvidence() itself is unchanged — it still reports 'ancestor'; the
  // corroboration gate is what downgrades the verdict.
  assert.strictEqual(r.evidence.merged, 'ancestor');
  assert.strictEqual(r.evidence.branch, 'fresh-branch');
});

test('#1463 discrimination: same fixture, one commit dated after the run start -> shipped-unclosed', () => {
  // Orthogonal control for the test above: the ONLY difference is a commit at
  // or after the run dir's own timestamp. Without the corroboration gate both
  // cases return shipped-unclosed; without a working gate this case would be
  // the one that regressed.
  const { root, wt, runDir } = fixtureZeroCommitRepo();
  fs.writeFileSync(path.join(wt, 'b.txt'), 'feature\n');
  sh(wt, 'add', 'b.txt');
  datedSh(wt, AFTER_RUN_START, 'commit', '-q', '-m', 'feature work');
  sh(root, 'merge', '-q', '--no-edit', 'fresh-branch');
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.merged, 'ancestor');
});

test('#1463 fail-open: a run dir name with no parseable timestamp prefix -> in-progress', () => {
  // The corroboration reference is the run dir NAME; when it cannot be parsed
  // the check must resolve toward in-progress, matching every other fail-open
  // field in this module.
  const { root, wt } = fixtureZeroCommitRepo();
  const oddRunDir = path.join(root, '.claude-tweaks', 'pipelines', 'not-a-timestamp-spec-9');
  fs.mkdirSync(oddRunDir, { recursive: true });
  writeRunState(oddRunDir, { status: 'active', worktree: wt });
  writeEvents(oddRunDir, [EV_BUILD]);
  const r = checkRunIntegrity(oddRunDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.merged, 'ancestor');
});

test('branch derivation a: recorded path is a plain dir inside the repo (never a worktree) -> in-progress, branch null', () => {
  // Regression for the fail-open hole where a direct `git branch --show-current`
  // probe against a non-worktree path let git search UPWARD and resolve the
  // MAIN CHECKOUT's own current branch instead of failing.
  const { root, runDir } = fixtureRepo();
  const plainDir = path.join(root, 'not-a-worktree');
  fs.mkdirSync(plainDir);
  writeRunState(runDir, { status: 'active', worktree: plainDir });
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.branch, null);
});

test('branch derivation b: recorded path is the main checkout root -> in-progress, branch null', () => {
  const { root, runDir } = fixtureRepo();
  writeRunState(runDir, { status: 'active', worktree: root });
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.branch, null);
});

test('branch derivation c: worktree dir whose own .git file was deleted (dangling, still registered/prunable) -> in-progress, branch null', () => {
  const { root, wt, runDir } = fixtureRepo();
  fs.unlinkSync(path.join(wt, '.git'));
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.branch, null);
});

test('AC4a: merged but wrap-up event present -> in-progress', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeEvents(runDir, [EV_BUILD, EV_WRAPUP]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.wrapupInvoked, true);
});

test('AC4b: merged but zero skill_invoked events of any kind -> in-progress (pre-ledger run)', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeEvents(runDir, [EV_OTHER]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.ledgerActive, false);
});

test('AC5: each fail-open input -> in-progress, no throw', () => {
  // absent run-state.json
  const f1 = fixtureRepo();
  fs.unlinkSync(path.join(f1.runDir, 'run-state.json'));
  assert.strictEqual(checkRunIntegrity(f1.runDir).state, 'in-progress');
  // wrong shapes
  for (const bad of ['{}', '[]', '{"status":"weird","worktree":"/x"}', JSON.stringify({ status: 'active', worktree: '' })]) {
    const f = fixtureRepo();
    fs.writeFileSync(path.join(f.runDir, 'run-state.json'), bad);
    assert.strictEqual(checkRunIntegrity(f.runDir).state, 'in-progress');
  }
  // recorded path gone
  const f2 = fixtureRepo();
  writeRunState(f2.runDir, { status: 'active', worktree: path.join(f2.root, 'nope') });
  assert.strictEqual(checkRunIntegrity(f2.runDir).state, 'in-progress');
  // detached HEAD in the worktree
  const f3 = fixtureRepo();
  sh(f3.wt, 'checkout', '-q', '--detach');
  writeEvents(f3.runDir, [EV_BUILD]);
  assert.strictEqual(checkRunIntegrity(f3.runDir).state, 'in-progress');
  // git failure: run dir tree that is not a repo at all
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ri-bare-'));
  const fakeRun = path.join(bare, '.claude-tweaks', 'pipelines', '2026-08-01T090000-spec-9');
  fs.mkdirSync(fakeRun, { recursive: true });
  writeRunState(fakeRun, { status: 'active', worktree: bare });
  assert.strictEqual(checkRunIntegrity(fakeRun).state, 'in-progress');
  // missing events.jsonl (merged branch, but no log at all)
  const f4 = fixtureRepo();
  sh(f4.root, 'merge', '-q', '--no-edit', 'feat-branch');
  assert.strictEqual(checkRunIntegrity(f4.runDir).state, 'in-progress');
});

test('interrupted status is in the non-terminal set (verdict can fire on it)', () => {
  const { root, wt, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeRunState(runDir, { status: 'interrupted', worktree: wt });
  writeEvents(runDir, [EV_BUILD]);
  assert.strictEqual(checkRunIntegrity(runDir).state, 'shipped-unclosed');
});

test('clean status is a VALID run-state shape but NOT in the non-terminal set -> in-progress even with a merged branch and active ledger', () => {
  // Pins the two-part gate (valid shape AND non-terminal status) as distinct
  // checks: 'clean' passes readValidatedRunState's RUN_STATE_STATUSES check,
  // so only the separate NON_TERMINAL check stops this from misreading a
  // properly closed run as shipped-unclosed. Deleting that check would still
  // pass every other test in this file.
  const { root, wt, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeRunState(runDir, { status: 'clean', worktree: wt });
  writeEvents(runDir, [EV_BUILD]);
  assert.strictEqual(checkRunIntegrity(runDir).state, 'in-progress');
});

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');
function runSessionStart(cwd) {
  try {
    const stdout = execFileSync('node', [HOOKS, 'session-start'], {
      input: JSON.stringify({ cwd }), cwd, encoding: 'utf8',
      env: { ...process.env, PIPELINE_RUN_DIR: '' },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

test('SessionStart: shipped-unclosed run line names both remediations (AC1 message half)', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeEvents(runDir, [EV_BUILD]);
  const r = runSessionStart(root);
  assert.strictEqual(r.code, 0);
  const ctxOut = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctxOut, /appears shipped/);
  assert.match(ctxOut, /\/claude-tweaks:wrap-up/);
  assert.match(ctxOut, /close-run --run "/);
});

test('SessionStart: genuinely in-progress run line is byte-identical to the pre-change format (AC6 half)', () => {
  const { runDir, root } = fixtureRepo(); // unmerged branch -> in-progress
  writeEvents(runDir, [EV_BUILD]);
  const r = runSessionStart(root);
  assert.strictEqual(r.code, 0);
  const ctxOut = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  const base = path.basename(runDir);
  assert.ok(ctxOut.includes(`- ${base} (status: active)`), `expected the unchanged line, got: ${ctxOut}`);
  assert.ok(!ctxOut.includes('appears shipped'), 'in-progress run must not carry the new text');
});
