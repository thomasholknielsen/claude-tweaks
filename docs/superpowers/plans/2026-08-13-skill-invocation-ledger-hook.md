# Skill-Invocation Ledger Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every Skill-tool call as a `skill_invoked` typed event in the active pipeline run's `events.jsonl`, via a new PostToolUse hook module.

**Architecture:** One new module `bin/lib/hooks/skill-invocation.js` wired through the existing `post-tool-use.js` dispatch (one dispatcher, one module per concern). Writes go through `context.js`'s existing `appendEvent` helper on the ownership-scoped `ctx.ownedRun` — never `resolveRun`/`ctx.runDir`. A blocking empirical Task 0 pins the undocumented Skill PostToolUse payload shape before any fixture is written.

**Tech Stack:** Node built-ins only. Tests via `node --test tests/`.

**Spec:** `.claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-371/work/371-spec.md` (materialized from GitHub issue #371)

## Global Constraints

- **Never break a session:** every hook path exits 0, malformed stdin included. New paths must pass the garbage-stdin invariant in `tests/hooks-dispatcher.test.js`.
- **Append to existing runs only** — the module must never `mkdir` a run dir or create `.claude-tweaks/pipelines/` (issue #208's resurrection bug).
- **Skill name stored verbatim** — no normalization, no stripping of plugin qualification.
- **Event shape (cross-spec contract, consumed by #372/#373):** `{"type": "skill_invoked", "skill": "<verbatim>", "ts": "<ISO-8601>"}` — `ts` generated at append time by `appendEvent` (which spreads `ts`/`type` last); no `args` field.
- **Writes use `ctx.ownedRun` + `ctxLib.appendEvent(dir, type, data, attribution)`** — `attribution: "fallback"` tagging for unowned runs is owned by `appendEvent`, not this module.
- **Commit messages:** `refs #371` — NEVER closing keywords (Fixes/Closes/Resolves).
- No new package dependencies.

---

### Task 0: Empirical premise check — capture real Skill PostToolUse payloads

**Blocking: every later task's fixtures depend on this task's output.**

**Files:**
- Create: `.claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-371/work/task0-findings.md` (in the worktree — `work/` is the tracked audit-trail exception, committed)
- Scratch (not committed): a capture directory under the session scratchpad or `/tmp`

**Interfaces:**
- Produces: pinned answers for (a) the `tool_input` field carrying the skill name + its qualification format, (b) bare-invocation format, (c) the error-signaling field on a failed-but-permitted call, (d) whether a Skill call inside a Task-dispatched subagent fires parent-session hooks. Later tasks read `task0-findings.md`.

- [ ] **Step 1: Create the throwaway capture hook settings**

Create a scratch dir (call it `$CAP`) OUTSIDE the repo (e.g. `/tmp/skill-capture-371`), with `capture.jsonl` as target. Write `$CAP/hook-settings.json` via the Write tool (not a heredoc — the isolated session refuses heredocs):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          { "type": "command", "command": "sh -c 'cat >> /tmp/skill-capture-371/capture.jsonl && printf \"\\n\" >> /tmp/skill-capture-371/capture.jsonl'" }
        ]
      }
    ]
  }
}
```

Use the literal absolute path in the command (hook processes don't inherit your shell vars).

- [ ] **Step 2: Run the four capture scenarios headlessly**

One plain command per Bash call (no `&&` chains against the repo). Run each from `$CAP` as cwd:

```bash
claude -p "Invoke the Skill tool with skill claude-tweaks:version and report its output." --settings /tmp/skill-capture-371/hook-settings.json --max-turns 8
```
```bash
claude -p "Invoke the Skill tool with skill: version (bare, unqualified). If it errors, report the error text verbatim." --settings /tmp/skill-capture-371/hook-settings.json --max-turns 8
```
```bash
claude -p "Invoke the Skill tool with skill: claude-tweaks:definitely-not-a-real-skill-xyz. Report the error text verbatim. Do not retry." --settings /tmp/skill-capture-371/hook-settings.json --max-turns 8
```
```bash
claude -p "Dispatch a subagent via the Agent tool whose entire job is: invoke the Skill tool with skill claude-tweaks:version, then reply done. Wait for it and report." --settings /tmp/skill-capture-371/hook-settings.json --max-turns 12
```

After each run, append a separator marker line to `capture.jsonl` noting which scenario just ran (via a plain `printf ... >> capture.jsonl` command), so payloads are attributable per scenario.

If `--settings` hooks do not fire (empty capture file after scenario 1), fall back to a `.claude/settings.json` inside `$CAP`'s own directory (make `$CAP` the project: run `claude -p` with cwd `$CAP`) and re-run. If still empty, STOP and report BLOCKED — the premise (a Skill PostToolUse hook event exists) may be false, which invalidates the spec; do not proceed to Task 1 on a guess.

- [ ] **Step 3: Pin the four answers**

Read `capture.jsonl`. For each scenario record: `tool_name` value, the `tool_input` field carrying the skill name and its exact format (qualified `claude-tweaks:version` vs bare), the `tool_response` shape on success and on the failed call (which field signals failure — e.g. `is_error`, `success`, an error string), and whether scenario 4 produced a parent-session capture line for the subagent's Skill call (the (d) answer — record whichever boundary was measured).

- [ ] **Step 4: Write findings + commit**

Write `task0-findings.md` in the `work/` path above: the four pinned answers, plus 2-3 representative RAW payload lines (verbatim JSON) for use as real-payload fixtures in Task 2's tests. Then:

```bash
git add .claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-371/work/task0-findings.md
git commit -m "Capture Skill PostToolUse payload shapes (Task 0 premise check) — refs #371"
```

---

### Task 1: hooks.json Skill matcher + registration test

**Files:**
- Modify: `hooks/hooks.json` (PostToolUse array)
- Test: `tests/hooks-dispatcher.test.js`

**Interfaces:**
- Consumes: nothing from Task 0 except confirmation that `tool_name` is `Skill`.
- Produces: PostToolUse `Skill` matcher entry routing to the existing `post-tool-use` dispatcher verb.

- [ ] **Step 1: Write the failing test**

Add to `tests/hooks-dispatcher.test.js` (alongside the existing `hooks.json registers PreToolUse matchers` test):

```js
test('hooks.json registers a PostToolUse matcher for Skill (unfiltered, literal tool-name match)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  const skillEntry = config.hooks.PostToolUse.find((e) => e.matcher === 'Skill');
  assert.ok(skillEntry, 'expected a PostToolUse Skill matcher entry');
  assert.strictEqual(skillEntry.hooks.length, 1);
  assert.strictEqual(skillEntry.hooks[0].type, 'command');
  assert.ok(!('if' in skillEntry.hooks[0]), 'Skill matcher must be a literal tool-name match, not pattern-filtered');
  assert.match(skillEntry.hooks[0].command, /bin\/hooks\.js" post-tool-use$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: FAIL with "expected a PostToolUse Skill matcher entry"

- [ ] **Step 3: Add the matcher entry**

In `hooks/hooks.json`, append to the `PostToolUse` array (after the `Write` matcher object):

```json
{
  "matcher": "Skill",
  "hooks": [
    { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use" }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json tests/hooks-dispatcher.test.js
git commit -m "Register PostToolUse Skill matcher — refs #371"
```

---

### Task 2: skill-invocation.js module + routing + unit suite

**Files:**
- Create: `bin/lib/hooks/skill-invocation.js`
- Modify: `bin/lib/hooks/post-tool-use.js` (route `tool_name === 'Skill'`)
- Test: `tests/skill-invocation.test.js` (new)
- Read first: `.claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-371/work/task0-findings.md` — substitute the ACTUAL pinned field names below where marked `per Task 0`.

**Interfaces:**
- Consumes: `ctxLib.appendEvent(runDir, type, data, attribution)` and `ctx.ownedRun = { dir, attribution }` (built by `bin/hooks.js` from `resolveRun(cwd, env, input.session_id)`).
- Produces: `run(ctx)` handler + exported helpers `extractSkillName(toolInput)`, `isFailedCall(toolResponse)` for tests. Event line consumed by #372/#373: `{"skill": ..., "attribution"?: "fallback", "ts": ..., "type": "skill_invoked"}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/skill-invocation.test.js` following `tests/hooks-dispatcher.test.js`'s `runHook`/tmp-project patterns:

```js
// tests/skill-invocation.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'bin', 'hooks.js');

function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
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

// Synthetic payload matching the Task-0-pinned shape. ADJUST the tool_input /
// tool_response field names to the pinned ones before finishing this task.
function skillPayload(overrides = {}) {
  return JSON.stringify({
    tool_name: 'Skill',
    tool_input: { skill: 'claude-tweaks:wrap-up' },     // field name per Task 0
    tool_response: {},                                   // success shape per Task 0
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

test('failed call (per Task 0 error signal): no write', () => {
  const { dir, run } = projectWithRun({ sessionId: 'owner' });
  const r = runHook(['post-tool-use'], {
    // Replace with the REAL captured failure tool_response from Task 0.
    input: skillPayload({ cwd: dir, session_id: 'owner', tool_response: { is_error: true } }),
    cwd: dir,
  });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(readEvents(run).length, 0);
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
  // Paste one RAW captured success payload line from task0-findings.md, then
  // override cwd/session_id to point at the fixture project.
  const raw = JSON.parse('<REAL_CAPTURED_PAYLOAD_JSON>');
  const { dir, run } = projectWithRun({ sessionId: 'owner' });
  raw.cwd = dir;
  raw.session_id = 'owner';
  const r = runHook(['post-tool-use'], { input: JSON.stringify(raw), cwd: dir });
  assert.strictEqual(r.code, 0);
  const events = readEvents(run);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'skill_invoked');
});

test('garbage Skill-shaped stdin exits 0', () => {
  const r = runHook(['post-tool-use'], { input: '{"tool_name":"Skill"' });
  assert.strictEqual(r.code, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/skill-invocation.test.js`
Expected: FAIL — owned-run/unowned-run appends fail (no module routes Skill payloads yet); the drop cases may vacuously pass (that's fine — the append cases are the discriminating ones).

- [ ] **Step 3: Implement the module**

Create `bin/lib/hooks/skill-invocation.js`:

```js
// bin/lib/hooks/skill-invocation.js — skill-invocation ledger (log tier).
// Records every completed Skill-tool call as a `skill_invoked` typed event in
// the session's owned run's events.jsonl. One event = "the procedure was
// entered" — PostToolUse fires when the tool call returns, BEFORE the skill's
// loaded instructions execute; no completion semantics are implied.
//
// Task 0 findings (empirical, captured 2026-08-13 via a throwaway --settings
// hook; see the run's work/task0-findings.md for raw payloads):
//   (a) qualified invocation: tool_input.<FIELD> = "<pinned format>"
//   (b) bare invocation: <pinned answer>
//   (c) failed-but-permitted call signal: <pinned field>
//   (d) subagent Skill calls fire parent-session hooks: <pinned yes/no>
// (REPLACE the four lines above with the actual pinned answers.)
'use strict';
const ctxLib = require('./context');

function extractSkillName(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const skill = toolInput.skill; // field name per Task 0
  return typeof skill === 'string' && skill ? skill : null;
}

// Failure signal per Task 0's pinned error field. A denied call never reaches
// PostToolUse; this excludes the failed-but-permitted class.
function isFailedCall(toolResponse) {
  return !!(toolResponse && typeof toolResponse === 'object' && toolResponse.is_error); // per Task 0
}

function run(ctx) {
  if (ctx.input.tool_name !== 'Skill') return {};
  const skill = extractSkillName(ctx.input.tool_input);
  if (!skill) return {};
  if (isFailedCall(ctx.input.tool_response)) return {};
  const ownedRun = ctx.ownedRun || {};
  if (!ownedRun.dir) return {}; // no run, or every run foreign-owned — drop, by design
  ctxLib.appendEvent(ownedRun.dir, 'skill_invoked', { skill }, ownedRun.attribution);
  return {};
}

module.exports = { run, extractSkillName, isFailedCall };
```

Adjust field names per Task 0 before finishing.

- [ ] **Step 4: Route Skill payloads in post-tool-use.js**

In `bin/lib/hooks/post-tool-use.js`, add near the top requires:

```js
const skillInvocation = require('./skill-invocation');
```

and as the FIRST statement of `run(ctx)`:

```js
function run(ctx) {
  if (ctx.input.tool_name === 'Skill') return skillInvocation.run(ctx);
  ...
```

(Every existing check in this file keys on `Bash`, `Write`, or `EnterWorktree` — an early return for `Skill` changes none of them.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/skill-invocation.test.js`
Expected: PASS (all)

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS (existing behavior untouched)

- [ ] **Step 6: Commit**

```bash
git add bin/lib/hooks/skill-invocation.js bin/lib/hooks/post-tool-use.js tests/skill-invocation.test.js
git commit -m "Add skill-invocation ledger module: skill_invoked events on the owned run — refs #371"
```

---

### Task 3: Full-suite verification

**Files:**
- None modified (verification only; fix-forward if anything fails)

- [ ] **Step 1: Run the full suite**

Run: `npm test` (redirect to a file and inspect the tail — long output).
Expected: PASS, including untouched `hooks-dispatcher`, `hooks-gate-coverage`, and every existing PostToolUse behavior test.

- [ ] **Step 2: Verify acceptance criteria 1-6 map to green tests**

AC1 → owned-run test; AC2 → unowned/fallback test; AC3 → both no-run tests; AC4 → foreign-owner test; AC5 → failed-call + field-validation tests; AC6 → existing garbage-stdin invariant (post-tool-use already in its event list) + the new garbage Skill-shaped stdin test.

- [ ] **Step 3: Commit any fixes**

Only if Step 1 surfaced failures caused by this build. Message: `Fix {what} — refs #371`.
