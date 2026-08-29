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
const cp = require('child_process');
const post = require('../plugin/bin/lib/hooks/post-tool-use');
const ctxLib = require('../plugin/bin/lib/hooks/context');
const { sessionTmpRoot } = require('../plugin/bin/lib/session-tmp');
const { gitRepo, harnessWorktreeOf } = require('./helpers/git-fixtures');

// The non-EnterWorktree rate-limit marker (#1333) lives under a real,
// persistent OS tmp path keyed only by session id (sessionTmpRoot), the same
// convention every other session-tmp consumer in this repo uses — see
// tests/backlog-refine-foldin-no-truncation.test.js for the identical
// cleanup pattern. Every test below that exercises the non-EnterWorktree
// path uses its own unique session id AND cleans that id's tmp root first,
// so a marker left behind by an earlier run of this same suite (or a
// concurrent one) can never leak into a later test's expectations.
function cleanSessionTmp(sessionId) {
  const root = sessionTmpRoot(sessionId);
  if (root) fs.rmSync(root, { recursive: true, force: true });
}

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

test('does not fire for a tool other than EnterWorktree when cwd is the main checkout (not any worktree)', () => {
  cleanSessionTmp('sess-adhoc-mainonly');
  const main = gitRepo();
  post.run({ input: { tool_name: 'ExitWorktree', cwd: main, session_id: 'sess-adhoc-mainonly' }, cwd: main });
  assert.deepStrictEqual(adhocDirs(main), []);
});

// ---- widened non-EnterWorktree trigger (#1333) -------------------------

test('stamps via the widened trigger: a non-EnterWorktree tool call from cwd inside a real (non-main) worktree', () => {
  cleanSessionTmp('sess-adhoc-nonEW-1');
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  // No EnterWorktree call anywhere in this test — simulates a worktree
  // created by a tool other than claude-tweaks' own EnterWorktree (another
  // plugin's worktree-management skill, or a raw `git worktree add`).
  post.run({ input: { tool_name: 'Write', cwd: wt, session_id: 'sess-adhoc-nonEW-1' }, cwd: wt });
  const dirs = adhocDirs(main);
  assert.strictEqual(dirs.length, 1);
  const state = ctxLib.readRunState(path.join(pipelinesDir(main), dirs[0]));
  assert.strictEqual(state.status, 'active');
  assert.strictEqual(state.sessionId, 'sess-adhoc-nonEW-1');
  assert.strictEqual(fs.realpathSync(state.worktree), wt);
});

test('non-EnterWorktree trigger: does not stamp when this session already owns a run dir', () => {
  cleanSessionTmp('sess-adhoc-nonEW-owned');
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  const existingRun = fs.mkdtempSync(path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'ct-owned-')), 'run-'));
  post.run({
    input: { tool_name: 'Write', cwd: wt, session_id: 'sess-adhoc-nonEW-owned' },
    cwd: wt,
    ownedRun: { dir: existingRun },
  });
  assert.deepStrictEqual(adhocDirs(main), []);
});

test('non-EnterWorktree trigger: git worktree list is not invoked on every ordinary tool call — rate-limited to at most once per session', (t) => {
  cleanSessionTmp('sess-adhoc-ratelimit');
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  const realExecFileSync = cp.execFileSync;
  const worktreeListCalls = [];
  t.mock.method(cp, 'execFileSync', (cmd, args, opts) => {
    if (cmd === 'git' && Array.isArray(args) && args.includes('worktree') && args.includes('list')) {
      worktreeListCalls.push(args);
    }
    return realExecFileSync(cmd, args, opts);
  });

  post.run({ input: { tool_name: 'Write', cwd: wt, session_id: 'sess-adhoc-ratelimit' }, cwd: wt });
  const dirs = adhocDirs(main);
  assert.strictEqual(dirs.length, 1, 'first call should stamp once');

  // ctx.ownedRun is unset on this second call too (this test simulates the
  // dispatcher not yet having recomputed it), so without the rate-limit
  // marker this would run `git worktree list` — and, absent the ownedRun
  // guard, re-derive the same worktree path — a second time.
  post.run({ input: { tool_name: 'Write', cwd: wt, session_id: 'sess-adhoc-ratelimit' }, cwd: wt });

  assert.strictEqual(worktreeListCalls.length, 1, `expected exactly 1 'git worktree list' spawn across two calls, got ${worktreeListCalls.length}`);
  assert.strictEqual(adhocDirs(main).length, 1, 'second call must not mint a second ad-hoc dir');
});

test('non-EnterWorktree trigger: an ordinary tool call from a session already checked this run never re-invokes git worktree list', (t) => {
  cleanSessionTmp('sess-adhoc-checked-once');
  const main = gitRepo();
  const realExecFileSync = cp.execFileSync;
  const worktreeListCalls = [];
  t.mock.method(cp, 'execFileSync', (cmd, args, opts) => {
    if (cmd === 'git' && Array.isArray(args) && args.includes('worktree') && args.includes('list')) {
      worktreeListCalls.push(args);
    }
    return realExecFileSync(cmd, args, opts);
  });

  // First call from the main checkout rules this session out ("not a
  // worktree") and writes the marker.
  post.run({ input: { tool_name: 'Write', cwd: main, session_id: 'sess-adhoc-checked-once' }, cwd: main });
  assert.strictEqual(worktreeListCalls.length, 1);

  // A second, later call in the same session must not re-run the check.
  post.run({ input: { tool_name: 'Write', cwd: main, session_id: 'sess-adhoc-checked-once' }, cwd: main });
  assert.strictEqual(worktreeListCalls.length, 1, `expected the second call to skip the git call entirely, got ${worktreeListCalls.length} total calls`);
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
