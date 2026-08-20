// tests/hooks-post-tool-use-adhoc-rundir.test.js
//
// #500's ad-hoc-session run-dir stamping: an EnterWorktree call that finds
// no owned run dir yet mints a lightweight standalone one and stamps this
// session as its owner, so wd-deny/gate-denial/contract-violation/
// ask-user-question incurred later in the SAME ad-hoc session (one that
// never reaches a formal /claude-tweaks:build or /flow pipeline) has
// somewhere to land — see bin/lib/hooks/post-tool-use.js's
// stampAdHocRunDir and skills/reflect/full-mode.md's Friction Lens section
// (the read side, via bin/friction-events.js).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const post = require('../plugin/bin/lib/hooks/post-tool-use');
const ctxLib = require('../plugin/bin/lib/hooks/context');
const { gitRepo, harnessWorktreeOf } = require('./helpers/git-fixtures');

function createdAt(wt) {
  return { content: `Created worktree at ${wt} on branch wt-branch. The session is now working in the worktree.` };
}

function enterWorktreeCtx(wt, { toolResponse, ownedRun, sessionId = 'sess-adhoc-1' } = {}) {
  const input = { tool_name: 'EnterWorktree', cwd: wt };
  if (toolResponse !== undefined) input.tool_response = toolResponse;
  if (sessionId !== undefined) input.session_id = sessionId;
  return { input, cwd: wt, ownedRun };
}

function pipelinesDir(main) {
  return path.join(main, '.claude-tweaks', 'pipelines');
}

function adhocDirs(main) {
  try {
    return fs.readdirSync(pipelinesDir(main)).filter((n) => n.endsWith('-adhoc-standalone'));
  } catch {
    return [];
  }
}

test('stamps a lightweight run dir when this session owns none yet', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  post.run(enterWorktreeCtx(wt, { toolResponse: createdAt(wt) }));
  const dirs = adhocDirs(main);
  assert.strictEqual(dirs.length, 1);
  const state = ctxLib.readRunState(path.join(pipelinesDir(main), dirs[0]));
  assert.strictEqual(state.status, 'active');
  assert.strictEqual(state.sessionId, 'sess-adhoc-1');
  assert.strictEqual(fs.realpathSync(state.worktree), wt);
});

test('does not stamp when ctx.ownedRun.dir already resolves (a formal pipeline already claimed this worktree)', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  const existingRun = fs.mkdtempSync(path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'ct-owned-')), 'run-'));
  post.run(enterWorktreeCtx(wt, { toolResponse: createdAt(wt), ownedRun: { dir: existingRun } }));
  assert.deepStrictEqual(adhocDirs(main), []);
});

test('does not stamp when the hook payload carries no session_id (nothing to stamp ownership against)', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  post.run(enterWorktreeCtx(wt, { toolResponse: createdAt(wt), sessionId: null }));
  assert.deepStrictEqual(adhocDirs(main), []);
});

test('does not fire for a tool other than EnterWorktree', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  post.run({ input: { tool_name: 'ExitWorktree', cwd: wt, session_id: 'sess-adhoc-1' }, cwd: wt });
  assert.deepStrictEqual(adhocDirs(main), []);
});

test('a second EnterWorktree in the same session does not mint a second ad-hoc dir (ownedRun now resolves to the first stamp)', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  post.run(enterWorktreeCtx(wt, { toolResponse: createdAt(wt) }));
  const [first] = adhocDirs(main);
  const firstDir = path.join(pipelinesDir(main), first);
  // Simulates the dispatcher recomputing ctx.ownedRun on the NEXT hook call,
  // now that resolveRun's session-owner scan finds the stamp just written.
  const owned = ctxLib.resolveRun(main, {}, 'sess-adhoc-1');
  assert.strictEqual(owned.dir, firstDir);
  post.run(enterWorktreeCtx(wt, { toolResponse: createdAt(wt), ownedRun: owned }));
  assert.deepStrictEqual(adhocDirs(main), [first]);
});

test('never throws on an unresolvable worktree path — returns {} rather than crashing', () => {
  const out = post.run({ input: { tool_name: 'EnterWorktree', cwd: '/this/path/does/not/exist/at/all', session_id: 'sess-x' } });
  assert.deepStrictEqual(out, {});
});
