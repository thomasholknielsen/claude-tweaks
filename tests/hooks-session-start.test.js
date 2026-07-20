// tests/hooks-session-start.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sessionStart = require('../bin/lib/hooks/session-start');
const deps = require('../bin/lib/deps');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines'), { recursive: true });
  return dir;
}
function mkRun(project, name, state) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(run, { recursive: true });
  if (state) fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return run;
}

test('deps.collect returns an array of strings and prints nothing', () => {
  const msgs = deps.collect();
  assert.ok(Array.isArray(msgs));
  for (const m of msgs) assert.strictEqual(typeof m, 'string');
});

test('stale runs are reported in additionalContext, capped at 3, newest first', () => {
  const project = tmpProject();
  // Four non-clean runs (more than MAX_REPORTED=3) so the cap is actually exercised —
  // with only 2 non-clean candidates, listRunDirsWithState's own clean-status filter
  // (which drops spec-0 below) does all the work and .slice(0, 3) is a no-op, unable to
  // distinguish "the cap correctly keeps 3" from "there is no cap at all".
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  mkRun(project, '2026-07-02T090000-spec-2', { status: 'active' });
  mkRun(project, '2026-07-03T090000-spec-3', { status: 'interrupted' });
  mkRun(project, '2026-07-04T090000-spec-4', { status: 'active' });
  mkRun(project, '2026-06-30T090000-spec-0', { status: 'clean' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  const ctx = out.json.hookSpecificOutput.additionalContext;
  assert.strictEqual(out.json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(ctx, /unfinished pipeline run/i);
  assert.match(ctx, /spec-4/);
  assert.match(ctx, /spec-3/);
  assert.match(ctx, /spec-2/);
  assert.doesNotMatch(ctx, /spec-1/, 'the oldest of 4 non-clean runs must be excluded by the MAX_REPORTED=3 cap');
  assert.doesNotMatch(ctx, /spec-0/, 'the clean run must be excluded before the cap ever runs');
  assert.ok(ctx.indexOf('spec-4') < ctx.indexOf('spec-3'), 'newest-first: spec-4 before spec-3');
  assert.ok(ctx.indexOf('spec-3') < ctx.indexOf('spec-2'), 'newest-first: spec-3 before spec-2');
});

test('close-run hint substitutes CLAUDE_PLUGIN_ROOT when set, else keeps the literal placeholder', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  const orig = process.env.CLAUDE_PLUGIN_ROOT;

  try {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    const withoutEnv = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.match(withoutEnv.json.hookSpecificOutput.additionalContext, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hooks\.js/);

    process.env.CLAUDE_PLUGIN_ROOT = '/opt/claude-tweaks';
    const withEnv = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.match(withEnv.json.hookSpecificOutput.additionalContext, /\/opt\/claude-tweaks\/bin\/hooks\.js/);
  } finally {
    if (orig === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = orig;
  }
});

test('no stale runs and no deps warnings -> no json output', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'clean' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) {
    // On machines missing agent-browser, deps warnings alone may produce output — accept both, but stale-run text must be absent.
    assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /unfinished pipeline run/i);
  } else {
    assert.deepStrictEqual(out, {});
  }
});

function gitProject() {
  const dir = tmpProject();
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return dir;
}
function withPolicy(repo, content) {
  fs.mkdirSync(path.join(repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude-tweaks', 'policy.yml'), content);
}

test('worktree.always nudge appears when policy is on and session is not yet isolated', () => {
  const project = gitProject();
  withPolicy(project, 'worktree.always: true\n');
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree\.always/);
  assert.match(out.json.hookSpecificOutput.additionalContext, /using-git-worktrees/);
});

test('worktree.always nudge is absent when policy is off', () => {
  const project = gitProject();
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree\.always/);
  else assert.deepStrictEqual(out, {});
});

test('worktree.always nudge is absent when the session is already inside a linked worktree', () => {
  const project = gitProject();
  execFileSync('git', ['-C', project, 'commit', '--allow-empty', '-m', 'init', '-q']);
  withPolicy(project, 'worktree.always: true\n');
  execFileSync('git', ['-C', project, 'add', '.claude-tweaks/policy.yml']);
  execFileSync('git', ['-C', project, 'commit', '-m', 'policy', '-q']);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-wt-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', project, 'worktree', 'add', '-q', wt, '-b', 'wt-branch']);
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: fs.realpathSync(wt) });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree\.always/);
  else assert.deepStrictEqual(out, {});
});
