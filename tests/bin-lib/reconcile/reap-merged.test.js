'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { reapMerged } = require('../../../plugin/bin/lib/reconcile/reap-merged');
const { writeRunState } = require('../../../plugin/bin/lib/hooks/context');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// resolvePrState (pr-state.js) shells to `gh pr list` and is not injectable
// (reap-merged.js `const { resolvePrState } = require('./pr-state')` binds
// the function value at module load — reassigning the pr-state.js export
// afterward doesn't reach it, same caveat prune-remote.test.js/
// pr-state.test.js already document) — intercept at the process-spawn
// boundary via a `gh` wrapper placed first on PATH.
function installGhWrapper(prsJson) {
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-merged-ghwrap-'));
  const wrapperPath = path.join(wrapperDir, 'gh');
  fs.writeFileSync(wrapperPath, `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify(prsJson)}\nEOF\n`);
  fs.chmodSync(wrapperPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${wrapperDir}${path.delimiter}${originalPath}`;
  return { restore: () => { process.env.PATH = originalPath; } };
}

// Main checkout + a linked worktree under the harness domain (.claude/worktrees/,
// the only domain reapMerged ever considers), plus a pipeline run dir whose
// run-state.json names that worktree — the join reapMerged's own audit-trail
// write (review finding) needs to find the owning run.
function buildReapableFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-merged-root-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git(root, 'add', 'a.txt');
  git(root, 'commit', '-q', '-m', 'init');

  const wtPath = path.join(root, '.claude', 'worktrees', 'issue-1');
  git(root, 'worktree', 'add', '-q', '-b', 'worktree-issue-1', wtPath);

  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-01-01T000000-test-run');
  fs.mkdirSync(runDir, { recursive: true });
  writeRunState(runDir, { worktree: wtPath, status: 'active' });

  return { root, wtPath, runDir };
}

test('reapMerged: a merged-PR worktree is removed and logs a worktree-reaped event to its owning run', () => {
  const { root, wtPath, runDir } = buildReapableFixture();
  const wrapper = installGhWrapper([{ number: 42, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }]);
  let result;
  try {
    result = reapMerged({ cwd: root });
  } finally {
    wrapper.restore();
  }
  assert.equal(result.reaped.length, 1, `expected exactly one reaped worktree, got: ${JSON.stringify(result)}`);
  assert.equal(fs.existsSync(wtPath), false);

  const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const reapedEvent = events.find((e) => e.type === 'worktree-reaped');
  assert.ok(reapedEvent, `expected a worktree-reaped event, got: ${JSON.stringify(events)}`);
  assert.equal(reapedEvent.prNumber, 42);
});

test('reapMerged: a closed-unmerged PR is skipped (never reaped) and logs worktree-reap-skipped, not worktree-reaped', () => {
  const { root, wtPath, runDir } = buildReapableFixture();
  const wrapper = installGhWrapper([{ number: 7, state: 'CLOSED', mergedAt: null, updatedAt: '2026-01-01T00:00:00Z' }]);
  let result;
  try {
    result = reapMerged({ cwd: root });
  } finally {
    wrapper.restore();
  }
  assert.equal(result.reaped.length, 0);
  assert.equal(fs.existsSync(wtPath), true);

  const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(events.some((e) => e.type === 'worktree-reaped'), false);
  const skipEvent = events.find((e) => e.type === 'worktree-reap-skipped');
  assert.ok(skipEvent, `expected a worktree-reap-skipped event, got: ${JSON.stringify(events)}`);
  assert.equal(skipEvent.reason, 'pr-closed-unmerged');
});

// QUIET_SKIP_REASONS ('in-use' among them) must stay quiet in events.jsonl
// too — the same noise-reduction convention the SessionStart banner already
// applies (worktree-reap.js), so a live session's own worktree doesn't get a
// fresh log line every ~7-minute background pass for the length of a session.
test('reapMerged: an in-use (locked) worktree is skipped silently — no events.jsonl entry at all', () => {
  const { root, wtPath, runDir } = buildReapableFixture();
  // A live lock, same mechanism EnterWorktree uses: the reason string embeds
  // this test process's own (guaranteed-alive) pid, so lockVerdict() reads
  // 'in-use' rather than 'orphaned'.
  git(root, 'worktree', 'lock', wtPath, '--reason', `claude session test (pid ${process.pid} start now)`);

  const wrapper = installGhWrapper([{ number: 42, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }]);
  let result;
  try {
    result = reapMerged({ cwd: root });
  } finally {
    wrapper.restore();
  }
  assert.equal(result.reaped.length, 0);
  assert.equal(result.skipped.length, 1, `expected exactly one skipped entry, got: ${JSON.stringify(result)}`);
  assert.equal(result.skipped[0].reason, 'in-use');

  assert.equal(fs.existsSync(path.join(runDir, 'events.jsonl')), false, 'a quiet skip reason must never write events.jsonl at all');
});
