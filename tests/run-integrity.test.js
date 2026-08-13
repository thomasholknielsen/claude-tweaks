// tests/run-integrity.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkRunIntegrity } = require('../bin/lib/hooks/run-integrity');

function sh(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A main-checkout repo with an integration branch (named "trunk" — never "main",
// resolved via policy.yml's integration-branch key), one linked worktree on a
// feature branch with one commit, and one active run dir recording that worktree.
function fixtureRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ri-')));
  execFileSync('git', ['init', '-q', '-b', 'trunk', root]);
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  sh(root, 'add', 'a.txt');
  sh(root, 'commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), 'integration-branch: trunk\n');
  const wt = path.join(root, '.claude', 'worktrees', 'feat');
  sh(root, 'worktree', 'add', '-q', '-b', 'feat-branch', wt);
  fs.writeFileSync(path.join(wt, 'b.txt'), 'feature\n');
  sh(wt, 'add', 'b.txt');
  sh(wt, 'commit', '-q', '-m', 'feature work');
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
