// tests/hooks-post-tool-use-teardown-pin.test.js
//
// #703: after a worktree teardown (ExitWorktree action:remove, or the
// sanctioned own-cwd `git worktree remove` Bash call), Claude Code's own
// harness-native "worktree isolation pin" can remain anchored to the removed
// path for the rest of the session, permanently blocking further
// git-dependent commands. This plugin owns no lever to clear that pin
// directly (confirmed by grep — no hits for "isolation pin" anywhere in this
// repo outside the issue's own text), so the fix mirrors the EnterWorktree
// staleness backstop (#307): a PostToolUse warn-tier nudge telling the agent
// to verify its git context, not a structural fix.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const post = require('../plugin/bin/lib/hooks/post-tool-use');
const { gitRepo, harnessWorktreeOf } = require('./helpers/git-fixtures');

function readEvents(runDir) {
  const raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('warns after a successful ExitWorktree action:remove, even though the worktree directory is already gone', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  // Simulate the removal having already happened by the time PostToolUse
  // fires — the directory no longer exists at `wt`, exactly like a real
  // successful ExitWorktree(remove) leaves it. ctx.cwd still reports the
  // now-gone path, matching this file's EnterWorktree-handler convention of
  // ctx.cwd reflecting the tool call's own cwd rather than any post-call state.
  fs.rmSync(wt, { recursive: true, force: true });
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'remove' }, cwd: wt };
  const out = post.run({ input, cwd: wt });
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  assert.match(out.json.systemMessage, /worktree isolation pin|git-context pin/i);
  assert.match(out.json.systemMessage, /703/);
});

test('does not warn for an ExitWorktree call that is not a removal (action:create)', () => {
  const main = gitRepo();
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'create' }, cwd: main };
  const out = post.run({ input, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('warns after a sanctioned own-cwd `git worktree remove` Bash call', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  fs.rmSync(wt, { recursive: true, force: true });
  const input = { tool_name: 'Bash', tool_input: { command: `git worktree remove ${wt}` }, cwd: main };
  const out = post.run({ input, cwd: main });
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  assert.match(out.json.systemMessage, /worktree isolation pin|git-context pin/i);
});

test('does not fire for an unrelated Bash command', () => {
  const main = gitRepo();
  const input = { tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: main };
  const out = post.run({ input, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('does not fire for a tool other than ExitWorktree/Bash', () => {
  const main = gitRepo();
  const out = post.run({ input: { tool_name: 'EnterWorktree', cwd: main }, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('logs a post-teardown-pin event when a run dir is owned', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  fs.rmSync(wt, { recursive: true, force: true });
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-teardown-pin-run-'));
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'remove' }, cwd: wt };
  post.run({ input, cwd: wt, ownedRun: { dir: runDir } });
  const events = readEvents(runDir).filter((e) => e.type === 'post-teardown-pin');
  assert.strictEqual(events.length, 1);
});

test('never throws on an unusable cwd — still warns, since the shape check does not depend on cwd validity', () => {
  // ExitWorktree(action:remove) detection is a pure tool_input shape check
  // (see checkPostTeardownPin) — it deliberately fires even when ctx.cwd is
  // unusable, since a broken cwd is exactly the symptom #703 warns about.
  // The assertion here is "does not throw", not "returns {}".
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'remove' }, cwd: '/this/path/does/not/exist/at/all' };
  assert.doesNotThrow(() => post.run({ input, cwd: '/this/path/does/not/exist/at/all' }));
});

test('an unresolvable Bash git-worktree-remove target never throws and does not warn', () => {
  // Unlike the ExitWorktree case above, the Bash-sourced path depends on
  // teardownTargets' own command/cwd parsing succeeding — an unusable cwd
  // with no resolvable git command target yields no targets, so this
  // resolves to a no-op rather than a warning.
  const input = { tool_name: 'Bash', tool_input: { command: 'git worktree remove' }, cwd: '/this/path/does/not/exist/at/all' };
  const out = post.run({ input, cwd: '/this/path/does/not/exist/at/all' });
  assert.deepStrictEqual(out, {});
});
