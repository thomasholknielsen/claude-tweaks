'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { closeRunState, hasUnarchivedWork } = require('../../../plugin/bin/lib/hooks/close-run-state');

function makeTmpRunDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'close-run-state-test-'));
  return dir;
}

test('closeRunState: notYetArchived is true when the run dir still has a top-level work/ subdirectory', () => {
  const dir = makeTmpRunDir();
  try {
    fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'work', '42-spec.md'), '# 42\n');
    const r = closeRunState(dir, { explicit: true, callerIdentity: { sessionId: 's1' } });
    assert.strictEqual(r.status, 'closed');
    assert.strictEqual(r.notYetArchived, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: notYetArchived is true when a multi-spec spec-N/work/ subdirectory exists', () => {
  const dir = makeTmpRunDir();
  try {
    fs.mkdirSync(path.join(dir, 'spec-42', 'work'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec-42', 'work', '42-spec.md'), '# 42\n');
    const r = closeRunState(dir, { explicit: true, callerIdentity: { sessionId: 's1' } });
    assert.strictEqual(r.notYetArchived, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('closeRunState: notYetArchived is false when no work/ subdirectory exists anywhere under the run dir', () => {
  const dir = makeTmpRunDir();
  try {
    fs.writeFileSync(path.join(dir, 'decisions.md'), '# decisions\n');
    const r = closeRunState(dir, { explicit: true, callerIdentity: { sessionId: 's1' } });
    assert.strictEqual(r.notYetArchived, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Review finding: the defensive readdirSync catch (fail-open — an unreadable
// run dir is reported as having no unarchived work, matching the function's
// own header comment: this must never block a stuck/foreign run's manual
// close) had no direct test. A non-existent runDir exercises it exactly —
// fs.existsSync(work) returns false without throwing, then
// fs.readdirSync(runDir) throws ENOENT.
test('hasUnarchivedWork: unreadable/non-existent run dir fails open (returns false), never throws', () => {
  const missing = path.join(os.tmpdir(), 'close-run-state-test-does-not-exist-' + Date.now());
  assert.strictEqual(hasUnarchivedWork(missing), false);
});

test('closeRunState: refused-foreign case never reaches the notYetArchived check', () => {
  const dir = makeTmpRunDir();
  try {
    fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify({ sessionId: 'other-session' }));
    const r = closeRunState(dir, { explicit: false, callerIdentity: { sessionId: 'this-session' } });
    assert.strictEqual(r.status, 'refused-foreign');
    assert.strictEqual('notYetArchived' in r, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// #1012: the upgrade from a raw sessionId comparison to classifyOwnership —
// same CLAUDE_CODE_SESSION_ID (the shape #965 found defeats the old check),
// but the caller's cwd is inside a DIFFERENT live worktree than the one this
// run recorded as its binding. classifyOwnership must still prove 'foreign'
// from the worktree mismatch alone.
test('closeRunState: same sessionId but caller cwd in a different live worktree than the recorded binding still refuses (classifyOwnership upgrade, #1012/#965)', () => {
  const { execFileSync } = require('child_process');
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'close-run-state-wt-main-'));
  execFileSync('git', ['-C', main, 'init', '-q']);
  execFileSync('git', ['-C', main, 'commit', '--allow-empty', '-m', 'init', '-q']);
  const boundWt = path.join(main, '.claude', 'worktrees', 'bound');
  fs.mkdirSync(path.dirname(boundWt), { recursive: true });
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', boundWt, '-b', 'bound-branch']);
  const callerWt = path.join(main, '.claude', 'worktrees', 'caller');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', callerWt, '-b', 'caller-branch']);
  const dir = makeTmpRunDir();
  try {
    fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify({ sessionId: 'shared-session', worktree: fs.realpathSync(boundWt) }));
    const r = closeRunState(dir, { explicit: false, callerIdentity: { sessionId: 'shared-session', cwd: fs.realpathSync(callerWt) } });
    assert.strictEqual(r.status, 'refused-foreign', 'a matching sessionId must not be enough once the binding names a different live worktree');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(main, { recursive: true, force: true });
  }
});
