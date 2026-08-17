// tests/skill-invocation.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    // PIPELINE_RUN_DIR defaults to '' (unset) so an ambient value in the
    // invoking shell can't redirect fixture writes into a real run's
    // events.jsonl — resolveRun checks this env var before the cwd scan.
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, PIPELINE_RUN_DIR: '', ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

// Project with one active run; sessionId optional (absent = unowned run).
function projectWithRun({ sessionId } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-skill-'));
  const run = path.join(dir, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  const state = { status: 'active' };
  if (sessionId) state.sessionId = sessionId;
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { dir, run };
}

// Synthetic payload matching the Task-0-pinned shape: tool_input.skill is a
// plain string (bare or "namespace:skill"-qualified); success responses carry
// tool_response.success === true / commandName (see task0-findings.md).
function skillPayload(overrides = {}) {
  return JSON.stringify({
    tool_name: 'Skill',
    tool_input: { skill: 'claude-tweaks:wrap-up' },
    tool_response: { success: true, commandName: 'claude-tweaks:wrap-up' },
    ...overrides,
  });
}

function readEvents(run) {
  const p = path.join(run, 'events.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('owned run: appends exactly one skill_invoked event with verbatim name and ISO ts', () => {
  const { dir, run } = projectWithRun({ sessionId: 'owner' });
  const r = runHook(['post-tool-use'], {
    input: skillPayload({ cwd: dir, session_id: 'owner' }), cwd: dir,
  });
  assert.strictEqual(r.code, 0);
  const events = readEvents(run);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'skill_invoked');
  assert.strictEqual(events[0].skill, 'claude-tweaks:wrap-up');
  assert.match(events[0].ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(!('attribution' in events[0]), 'owned run must not be tagged fallback');
});

test('unowned run: appends one event tagged attribution fallback', () => {
  const { dir, run } = projectWithRun();
  const r = runHook(['post-tool-use'], {
    input: skillPayload({ cwd: dir, session_id: 'some-session' }), cwd: dir,
  });
  assert.strictEqual(r.code, 0);
  const events = readEvents(run);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'skill_invoked');
  assert.strictEqual(events[0].attribution, 'fallback');
});

test('no resolvable run: exits 0, creates no file and no directory (pipelines dir absent)', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-skill-bare-'));
  const r = runHook(['post-tool-use'], { input: skillPayload({ cwd: bare }), cwd: bare });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(fs.existsSync(path.join(bare, '.claude-tweaks')), false,
    'no .claude-tweaks tree may be created');
});

test('no resolvable run: existing-but-unmatched pipelines dir is byte-identical before/after', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-skill-'));
  const pipelines = path.join(dir, '.claude-tweaks', 'pipelines');
  // Only a terminal (clean) run exists -> resolveRun finds no non-terminal run.
  const run = path.join(pipelines, '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'clean' }));
  const before = JSON.stringify(fs.readdirSync(run).sort());
  const r = runHook(['post-tool-use'], { input: skillPayload({ cwd: dir }), cwd: dir });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(JSON.stringify(fs.readdirSync(run).sort()), before);
  assert.strictEqual(fs.existsSync(path.join(run, 'events.jsonl')), false);
});

test('foreign-owned run: exits 0, appends nothing', () => {
  const { dir, run } = projectWithRun({ sessionId: 'owner' });
  const r = runHook(['post-tool-use'], {
    input: skillPayload({ cwd: dir, session_id: 'bystander' }), cwd: dir,
  });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(readEvents(run).length, 0);
});

// Task 0 measured that a failed ("unknown skill") call fires NO PostToolUse
// event at all — there is no error field in tool_response to pin. isFailedCall
// is kept only as a minimal defensive guard (success === false OR is_error ===
// true) against a future harness change; neither shape is known to occur
// today. Both synthetic shapes must still drop if ever encountered.
test('failed call (defensive guard, not observed to occur today): no write', () => {
  for (const toolResponse of [{ success: false }, { is_error: true }]) {
    const { dir, run } = projectWithRun({ sessionId: 'owner' });
    const r = runHook(['post-tool-use'], {
      input: skillPayload({ cwd: dir, session_id: 'owner', tool_response: toolResponse }),
      cwd: dir,
    });
    assert.strictEqual(r.code, 0, `tool_response ${JSON.stringify(toolResponse)} must exit 0`);
    assert.strictEqual(readEvents(run).length, 0, `tool_response ${JSON.stringify(toolResponse)} must not append`);
  }
});

test('missing, empty, and non-string skill field: no write, exit 0', () => {
  for (const toolInput of [{}, { skill: '' }, { skill: 42 }, null]) {
    const { dir, run } = projectWithRun({ sessionId: 'owner' });
    const r = runHook(['post-tool-use'], {
      input: skillPayload({ cwd: dir, session_id: 'owner', tool_input: toolInput }), cwd: dir,
    });
    assert.strictEqual(r.code, 0, `tool_input ${JSON.stringify(toolInput)} must exit 0`);
    assert.strictEqual(readEvents(run).length, 0);
  }
});

test('real captured payload from Task 0 appends against an owned run', () => {
  // Scenario (a) raw JSON line from task0-findings.md, pasted verbatim, with
  // cwd/session_id overridden to point at the fixture project.
  const raw = JSON.parse('{"session_id":"35041dba-0268-4aa8-ad14-f2adde5770be","transcript_path":"/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-skill-capture-371/35041dba-0268-4aa8-ad14-f2adde5770be.jsonl","cwd":"/private/tmp/skill-capture-371","prompt_id":"c7a57d91-ee92-42f0-bde3-e221a478aec5","permission_mode":"bypassPermissions","effort":{"level":"high"},"hook_event_name":"PostToolUse","tool_name":"Skill","tool_input":{"skill":"claude-tweaks:help"},"tool_response":{"success":true,"commandName":"claude-tweaks:help"},"tool_use_id":"toolu_01VrDhrpt9vX3Fhi2Bs1RhdH","duration_ms":7}');
  const { dir, run } = projectWithRun({ sessionId: 'owner' });
  raw.cwd = dir;
  raw.session_id = 'owner';
  const r = runHook(['post-tool-use'], { input: JSON.stringify(raw), cwd: dir });
  assert.strictEqual(r.code, 0);
  const events = readEvents(run);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'skill_invoked');
  assert.strictEqual(events[0].skill, 'claude-tweaks:help');
});

test('subagent-attributed payload (agent_id/agent_type) is logged like any other — no filtering', () => {
  // Scenario (d) raw JSON line from task0-findings.md, pasted verbatim, with
  // cwd/session_id overridden to point at the fixture project. Carries
  // agent_id/agent_type — the spec's Non-Goals say these are NOT filtered.
  const raw = JSON.parse('{"session_id":"906fa528-8660-4526-b111-ef0b9bd03aba","transcript_path":"/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-skill-capture-371/906fa528-8660-4526-b111-ef0b9bd03aba.jsonl","cwd":"/private/tmp/skill-capture-371","prompt_id":"3a93798f-4aab-4c26-8738-32f2e672166e","permission_mode":"bypassPermissions","agent_id":"aecdf2eb0cc2a129b","agent_type":"general-purpose","effort":{"level":"high"},"hook_event_name":"PostToolUse","tool_name":"Skill","tool_input":{"skill":"claude-tweaks:help"},"tool_response":{"success":true,"commandName":"claude-tweaks:help"},"tool_use_id":"toolu_014QfZJzHJejH5BhpsDKuT8R","duration_ms":10}');
  const { dir, run } = projectWithRun({ sessionId: 'owner' });
  raw.cwd = dir;
  raw.session_id = 'owner';
  const r = runHook(['post-tool-use'], { input: JSON.stringify(raw), cwd: dir });
  assert.strictEqual(r.code, 0);
  const events = readEvents(run);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'skill_invoked');
  assert.strictEqual(events[0].skill, 'claude-tweaks:help');
});

test('garbage Skill-shaped stdin exits 0', () => {
  const r = runHook(['post-tool-use'], { input: '{"tool_name":"Skill"' });
  assert.strictEqual(r.code, 0);
});
