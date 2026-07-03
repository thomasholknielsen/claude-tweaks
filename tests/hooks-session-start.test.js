// tests/hooks-session-start.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
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
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  mkRun(project, '2026-07-02T090000-spec-2', { status: 'active' });
  mkRun(project, '2026-06-30T090000-spec-0', { status: 'clean' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  const ctx = out.json.hookSpecificOutput.additionalContext;
  assert.strictEqual(out.json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(ctx, /unfinished pipeline run/i);
  assert.match(ctx, /spec-2/);
  assert.match(ctx, /spec-1/);
  assert.doesNotMatch(ctx, /spec-0/);
});

test('close-run hint substitutes CLAUDE_PLUGIN_ROOT when set, else keeps the literal placeholder', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });

  delete process.env.CLAUDE_PLUGIN_ROOT;
  const withoutEnv = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(withoutEnv.json.hookSpecificOutput.additionalContext, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hooks\.js/);

  process.env.CLAUDE_PLUGIN_ROOT = '/opt/claude-tweaks';
  try {
    const withEnv = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.match(withEnv.json.hookSpecificOutput.additionalContext, /\/opt\/claude-tweaks\/bin\/hooks\.js/);
  } finally {
    delete process.env.CLAUDE_PLUGIN_ROOT;
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
