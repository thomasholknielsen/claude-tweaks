# Resolve-Profile Session-Failure Blacklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Task dispatch fails on a model with a credit/usage-exhaustion error, `bin/resolve-profile.js` remembers it for the rest of the session and never re-resolves that model again this session.

**Architecture:** A new session-scoped state file (mirroring `bin/lib/issues/record-snapshot.js`'s `/tmp/ct-{purpose}-{sessionId}` convention) holds the set of models that have failed this session. `bin/lib/model-profiles/profiles.js`'s pure `resolve()` gains a seventh, final stage: if the resolution it would otherwise return names a model in that set, step down `PROFILE_ORDER` to the next model not in the set (floored at `fast`). `bin/resolve-profile.js` reads the set before every resolution and gains a `record-failure <model>` subcommand a dispatch site calls after observing a credit/usage-exhaustion failure. `skills/_shared/subagent-output-contract.md`'s Model Selection section — the single canonical procedure every dispatch site already cites rather than restates — documents when to call it, so no per-skill prose needs editing.

**Tech Stack:** Node.js (`node:test`, `node:assert`, `node:fs`, `node:os`, `node:path`, `node:child_process`), the existing `bin/lib/model-profiles/` module.

**Spec:** `.claude-tweaks/pipelines/20260817T165609-record-763-standalone/work/763-spec.md`

## Global Constraints

- Scope is fixed to the narrow direction already decided at shaping time: a same-session failure blacklist, never a broad "read the session's live active model" mechanism. Do not add any code path that inspects or reports the session's currently active model.
- `resolve()` in `profiles.js` stays pure — no `fs`/`process` access. All I/O (session-id resolution, reading/writing the blacklist file) lives in `bin/resolve-profile.js` and the new `bin/lib/model-profiles/session-failures.js` module, matching the existing header-comment contract ("CLI wrapper... owns ALL I/O... resolve() itself stays pure").
- Follow `bin/lib/issues/record-snapshot.js`'s established session-file convention exactly: `path.join(os.tmpdir(), `ct-{purpose}-${sessionId}`)`, a `resolveSessionId` guard that degrades a missing/blank id to `null`, and every consumer of that `null` degrading to "act as if nothing is recorded" rather than throwing.
- `npm test` must pass after every task.

---

### Task 1: Session-scoped failure-state module

**Files:**
- Create: `bin/lib/model-profiles/session-failures.js`
- Test: `tests/bin-lib/model-profiles/session-failures.test.js`

**Interfaces:**
- Produces: `failurePath(sessionId) -> string|null`, `readFailedModels(sessionId) -> Set<string>`, `recordFailure(sessionId, model) -> void`. Task 2 (`profiles.js`) consumes only the `Set<string>` shape (via its own `opts.failedModels`, populated by Task 3 from `readFailedModels`'s return value). Task 3 (`resolve-profile.js`) consumes all three functions directly.

- [ ] **Step 1: Write the failing tests**

```js
// tests/bin-lib/model-profiles/session-failures.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  failurePath, readFailedModels, recordFailure,
} = require('../../../bin/lib/model-profiles/session-failures');

function cleanup(sessionId) {
  const p = failurePath(sessionId);
  if (p) { try { fs.unlinkSync(p); } catch { /* already absent */ } }
}

test('failurePath is null for a missing/blank session id, a real path otherwise', () => {
  assert.strictEqual(failurePath(undefined), null);
  assert.strictEqual(failurePath(''), null);
  assert.strictEqual(failurePath('  '), null);
  assert.strictEqual(failurePath('abc-123'), path.join(os.tmpdir(), 'ct-model-failures-abc-123.json'));
});

test('readFailedModels returns an empty set when no file exists', () => {
  const id = 'sf-test-empty';
  cleanup(id);
  assert.deepStrictEqual(readFailedModels(id), new Set());
});

test('readFailedModels degrades to an empty set on malformed JSON, never throws', () => {
  const id = 'sf-test-malformed';
  fs.writeFileSync(failurePath(id), 'not json');
  assert.deepStrictEqual(readFailedModels(id), new Set());
  cleanup(id);
});

test('recordFailure then readFailedModels round-trips one model', () => {
  const id = 'sf-test-roundtrip';
  cleanup(id);
  recordFailure(id, 'fable');
  assert.deepStrictEqual(readFailedModels(id), new Set(['fable']));
  cleanup(id);
});

test('recordFailure is idempotent — recording the same model twice does not duplicate', () => {
  const id = 'sf-test-idempotent';
  cleanup(id);
  recordFailure(id, 'fable');
  recordFailure(id, 'fable');
  const raw = JSON.parse(fs.readFileSync(failurePath(id), 'utf8'));
  assert.strictEqual(raw.length, 1);
  cleanup(id);
});

test('recordFailure accumulates distinct models across calls', () => {
  const id = 'sf-test-accumulate';
  cleanup(id);
  recordFailure(id, 'fable');
  recordFailure(id, 'opus');
  assert.deepStrictEqual(readFailedModels(id), new Set(['fable', 'opus']));
  cleanup(id);
});

test('recordFailure is a no-op with no session id — nothing thrown, no file written', () => {
  assert.doesNotThrow(() => recordFailure(undefined, 'fable'));
  assert.doesNotThrow(() => recordFailure('', 'fable'));
});

test('two session ids never share a file', () => {
  cleanup('sf-test-a');
  cleanup('sf-test-b');
  recordFailure('sf-test-a', 'fable');
  assert.deepStrictEqual(readFailedModels('sf-test-b'), new Set());
  cleanup('sf-test-a');
  cleanup('sf-test-b');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/model-profiles/session-failures.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/model-profiles/session-failures'`

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/model-profiles/session-failures.js
//
// Pure(ish) filesystem helpers for the session-scoped model-failure
// blacklist (#763) — the code twin of
// skills/_shared/subagent-output-contract.md's Model Selection section's
// "record-failure" note. Mirrors bin/lib/issues/record-snapshot.js's
// session-file convention exactly: one file per session under os.tmpdir(),
// keyed by CLAUDE_CODE_SESSION_ID. No network; resolve-profile.js owns
// when this is read/written, same division of labor as record-snapshot.js
// and its `gh`-calling consumers.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// A session id is required for the blacklist to mean anything — without
// one, concurrent unrelated invocations (no session context at all, e.g. a
// bare `node bin/resolve-profile.js standard` outside any Claude Code
// session) would silently share (and race on) the same file. An
// absent/blank id resolves to null, which every function below treats as
// "nothing recorded, nothing to record" rather than an error.
function resolveSessionId(sessionId) {
  return sessionId && String(sessionId).trim() ? String(sessionId).trim() : null;
}

function failurePath(sessionId) {
  const id = resolveSessionId(sessionId);
  if (!id) return null;
  return path.join(os.tmpdir(), `ct-model-failures-${id}.json`);
}

// -> Set<string> of model names that have failed with a credit/usage
// exhaustion error this session. Any read failure (missing file, malformed
// JSON) degrades to an empty set — a corrupt or absent blacklist must
// never block a resolution, only fail to protect one.
function readFailedModels(sessionId) {
  const p = failurePath(sessionId);
  if (!p) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

// Appends `model` to the session's failure set (idempotent — recording the
// same model twice does not duplicate it). A no-op when no session id is
// available: there is nowhere safe to write a shared file, and the CLI
// layer (Task 3) is what decides whether that no-op should be reported to
// the caller as a failure.
function recordFailure(sessionId, model) {
  const p = failurePath(sessionId);
  if (!p) return;
  const current = readFailedModels(sessionId);
  current.add(model);
  fs.writeFileSync(p, JSON.stringify([...current]));
}

module.exports = { failurePath, readFailedModels, recordFailure };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/model-profiles/session-failures.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add bin/lib/model-profiles/session-failures.js tests/bin-lib/model-profiles/session-failures.test.js
git commit -m "Add session-scoped model-failure blacklist module"
```

---

### Task 2: `resolve()` avoids a failed model — final stage

**Files:**
- Modify: `bin/lib/model-profiles/profiles.js`
- Test: `tests/bin-lib/model-profiles/resolve.test.js`

**Interfaces:**
- Consumes: nothing new from Task 1 directly — `resolve()` takes `opts.failedModels` as a plain `Set<string>` (or any object with a `.has()` method), never imports `session-failures.js` itself (keeps the module pure, per Global Constraints).
- Produces: `resolve(profile, { ...opts, failedModels })` — when the model `resolve()` would otherwise return is in `failedModels`, the result instead names the next model down `PROFILE_ORDER` that is not in `failedModels` (floored at `fast`), with `source: 'degraded:session-failure'`. Task 3 populates `opts.failedModels` from `readFailedModels()`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/model-profiles/resolve.test.js` (after the existing `stance never promotes a model upward` / `stance applies after cliOverride` tests, before the `unknown profile...throws` tests — anywhere in the file works since `node --test` runs top-level `test()` calls independently of position):

```js
test('a failed model is skipped — resolution steps down to the next viable tier', () => {
  const r = resolve('frontier', { failedModels: new Set(['fable']) });
  assert.strictEqual(r.model, 'opus');
  assert.strictEqual(r.effort, 'high');
  assert.strictEqual(r.source, 'degraded:session-failure');
});

test('session-failure check runs after frontier gates — a cap-degraded capable that is also failed steps down again', () => {
  // The frontier gate alone (no failedModels) would degrade this to opus —
  // confirm that baseline first, so the next assertion is proven to be
  // session-failure avoidance catching a model the frontier gate itself
  // produced, not some other stage.
  const baseline = resolve('frontier', { frontierUsed: 3 });
  assert.strictEqual(baseline.model, 'opus');
  assert.strictEqual(baseline.source, 'degraded:cap');
  const r = resolve('frontier', { frontierUsed: 3, failedModels: new Set(['opus']) });
  assert.strictEqual(r.model, 'sonnet');
  assert.strictEqual(r.source, 'degraded:session-failure');
});

test('a failed model with every tier below it also failed floors at fast, never throws', () => {
  const r = resolve('frontier', { failedModels: new Set(['fable', 'opus', 'sonnet']) });
  assert.strictEqual(r.model, 'haiku');
  assert.strictEqual(r.source, 'degraded:session-failure');
});

test('a model not in failedModels is unaffected — no source claimed', () => {
  const r = resolve('standard', { failedModels: new Set(['fable']) });
  assert.strictEqual(r.model, 'sonnet');
  assert.strictEqual(r.source, 'default');
});

test('an absent failedModels option behaves exactly as before (byte-identical to omitting it)', () => {
  assert.deepStrictEqual(resolve('frontier', {}), resolve('frontier', { failedModels: new Set() }));
});

test('session-failure avoidance runs after cliOverride and stance too', () => {
  const r = resolve('standard', {
    cliOverride: { model: 'opus' }, failedModels: new Set(['opus']),
  });
  assert.strictEqual(r.model, 'sonnet');
  assert.strictEqual(r.source, 'degraded:session-failure');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/model-profiles/resolve.test.js`
Expected: FAIL — the first new test asserts `r.model === 'opus'` but gets `'fable'` (no stage 7 exists yet); the others fail similarly or with a `TypeError` if `failedModels.has` is called on `undefined` once stage 7 is partially added.

- [ ] **Step 3: Write the implementation**

In `bin/lib/model-profiles/profiles.js`, add a new function directly below `profileOfModel` (after line 41, before `degrade`):

```js
// Steps down PROFILE_ORDER from `model`'s own tier until it finds a model
// not in `failedModels`, floored at 'fast' (index 0) — never goes below the
// cheapest tier, even when fast's own model is also failed, since there is
// nowhere lower to fall back to.
function nextViableModel(model, failedModels) {
  let idx = PROFILE_ORDER.indexOf(profileOfModel(model));
  while (idx > 0 && failedModels.has(PROFILES[PROFILE_ORDER[idx]].model)) {
    idx -= 1;
  }
  return PROFILE_ORDER[idx];
}
```

Then, at the end of `resolve()`, immediately before the final `return { model, effort, source, effortLine: effortLine(effort) };` (replacing that line with the block below — this is the seventh and last stage, deliberately after the frontier gates block so it can catch a model the frontier gates themselves degraded onto):

```js
  const failedModels = opts.failedModels || new Set();
  if (failedModels.has(model)) {
    const tier = nextViableModel(model, failedModels);
    ({ model, effort } = { ...PROFILES[tier] });
    source = 'degraded:session-failure';
  }

  return { model, effort, source, effortLine: effortLine(effort) };
```

Update the file's own header comment (lines 1-6) to add one line noting the seventh stage:

```js
// bin/lib/model-profiles/profiles.js
//
// Canonical work-profile data. The markdown table in
// skills/_shared/subagent-output-contract.md §Model Selection is pinned to
// PROFILES by tests/bin-lib/model-profiles/table-pinning.test.js — change
// them together.
//
// resolve() runs seven stages in fixed order — table default, policy row,
// cliOverride, stance, model-ceiling, frontier gates, session-failure
// avoidance (#763) — with the last stage that changed the result naming
// `source`.
```

Also update the existing "Pure: no fs, no process, no I/O" comment above `resolve()` (originally "Six stages in fixed order...") to say "Seven stages":

```js
// Pure: no fs, no process, no I/O. The CLI owns all of that.
// Seven stages in fixed order — table default, policy row, cliOverride,
// stance, model-ceiling, frontier gates, session-failure avoidance — with
// the last transform that changed the result naming `source`.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/model-profiles/resolve.test.js`
Expected: PASS, all tests (existing + 6 new)

Also run the full existing suite for this module to confirm nothing else regressed:
Run: `node --test tests/bin-lib/model-profiles/`
Expected: PASS, all files

- [ ] **Step 5: Commit**

```bash
git add bin/lib/model-profiles/profiles.js tests/bin-lib/model-profiles/resolve.test.js
git commit -m "resolve(): add session-failure avoidance as a seventh, final stage"
```

---

### Task 3: Wire the CLI — read the blacklist, add `record-failure`

**Files:**
- Modify: `bin/resolve-profile.js`
- Test: `tests/bin-lib/model-profiles/cli.test.js`

**Interfaces:**
- Consumes: `failurePath`, `readFailedModels`, `recordFailure` from Task 1's `bin/lib/model-profiles/session-failures.js`; `resolve` from Task 2's `bin/lib/model-profiles/profiles.js` (already imported).
- Produces: two behaviors — every normal `<profile>` resolution now reads `process.env.CLAUDE_CODE_SESSION_ID`'s failure set and passes it as `opts.failedModels`; a new `record-failure <model>` subcommand appends to that set and prints `{"recorded":true,"model":"...","sessionId":"..."}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/model-profiles/cli.test.js`:

```js
test('a resolution avoids a model recorded as failed this session, via CLAUDE_CODE_SESSION_ID', () => {
  const dir = tmpProject(null);
  const sessionId = `cli-test-${process.pid}-fail-avoid`;
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId };
  execFileSync('node', [CLI, 'record-failure', 'fable'], { cwd: dir, env, encoding: 'utf8' });
  const r = JSON.parse(execFileSync('node', [CLI, 'frontier'], { cwd: dir, env, encoding: 'utf8' }));
  assert.strictEqual(r.model, 'opus');
  assert.strictEqual(r.source, 'degraded:session-failure');
  // cleanup — do not leak this test's blacklist file to a later run
  const { failurePath } = require('../../../bin/lib/model-profiles/session-failures');
  fs.rmSync(failurePath(sessionId), { force: true });
});

test('a resolution with no CLAUDE_CODE_SESSION_ID set is unaffected by any blacklist', () => {
  const dir = tmpProject(null);
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  const r = JSON.parse(execFileSync('node', [CLI, 'frontier'], { cwd: dir, env, encoding: 'utf8' }));
  assert.strictEqual(r.model, 'fable');
});

test('record-failure with no model name exits 1 naming the problem', () => {
  const dir = tmpProject(null);
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: `cli-test-${process.pid}-no-model` };
  assert.throws(
    () => execFileSync('node', [CLI, 'record-failure'], { cwd: dir, env, encoding: 'utf8' }),
    (e) => e.status === 1 && /record-failure requires a model name/.test(String(e.stderr)),
  );
});

test('record-failure with no CLAUDE_CODE_SESSION_ID exits 1 naming the problem, records nothing', () => {
  const dir = tmpProject(null);
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  assert.throws(
    () => execFileSync('node', [CLI, 'record-failure', 'fable'], { cwd: dir, env, encoding: 'utf8' }),
    (e) => e.status === 1 && /CLAUDE_CODE_SESSION_ID/.test(String(e.stderr)),
  );
});

test('record-failure prints a JSON confirmation on success', () => {
  const dir = tmpProject(null);
  const sessionId = `cli-test-${process.pid}-confirm`;
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId };
  const out = JSON.parse(execFileSync('node', [CLI, 'record-failure', 'opus'], { cwd: dir, env, encoding: 'utf8' }));
  assert.deepStrictEqual(out, { recorded: true, model: 'opus', sessionId });
  const { failurePath } = require('../../../bin/lib/model-profiles/session-failures');
  fs.rmSync(failurePath(sessionId), { force: true });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/model-profiles/cli.test.js`
Expected: FAIL — `record-failure` is not a recognized profile (`unknown profile "record-failure"`), and no blacklist is ever read, so the first two new tests also fail their model/source assertions.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `bin/resolve-profile.js`:

```js
#!/usr/bin/env node
// bin/resolve-profile.js
//
// CLI wrapper around bin/lib/model-profiles — owns ALL I/O (policy read,
// frontier tally read/append, session-scoped model-failure blacklist
// read/write). resolve() itself stays pure. Contract cited by dispatch
// sites: skills/_shared/subagent-output-contract.md §Model Selection.
//
// Session-failure blacklist (#763): every normal `<profile>` resolution
// reads the CLAUDE_CODE_SESSION_ID-keyed blacklist
// (bin/lib/model-profiles/session-failures.js) and passes it to resolve()
// as `failedModels`, so a model that already failed with a credit/usage
// exhaustion error this session is never re-resolved. A dispatch site that
// observes such a failure records it via:
//
//   node bin/resolve-profile.js record-failure <model>
//
// before retrying or reporting — see subagent-output-contract.md's Model
// Selection section for when to call this.
'use strict';
const fs = require('fs');
const path = require('path');
const { resolve } = require('./lib/model-profiles/profiles');
const { parsePolicyModelConfig } = require('./lib/model-profiles/policy-fragment');
const { readFailedModels, recordFailure } = require('./lib/model-profiles/session-failures');

function fail(msg) {
  process.stderr.write(`resolve-profile: ${msg}\n`);
  process.exit(1);
}

// A value-taking flag must be followed by a value. Without this, `--stance`
// at end-of-args resolves as if the flag were absent, and `--stance
// --unattended` eats the next flag as the stance — both silent.
function requireValue(args, flag) {
  const v = args.shift();
  if (v === undefined || v.startsWith('--')) fail(`${flag} requires a value`);
  return v;
}

function main(argv) {
  const args = argv.slice(2);
  const profile = args.shift();
  if (!profile) {
    fail('usage: resolve-profile.js <profile>|record-failure <model> [--stance <s>] [--unattended] [--run-dir <path>]');
    return;
  }

  if (profile === 'record-failure') {
    const model = args.shift();
    if (!model) { fail('record-failure requires a model name'); return; }
    const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
    if (!sessionId) { fail('record-failure requires CLAUDE_CODE_SESSION_ID to be set — nothing recorded'); return; }
    recordFailure(sessionId, model);
    process.stdout.write(`${JSON.stringify({ recorded: true, model, sessionId })}\n`);
    return;
  }

  let stance;
  let unattended = false;
  let runDir;
  while (args.length) {
    const a = args.shift();
    if (a === '--stance') stance = requireValue(args, '--stance');
    else if (a === '--unattended') unattended = true;
    else if (a === '--run-dir') runDir = requireValue(args, '--run-dir');
    else { fail(`unknown argument "${a}"`); return; }
  }

  let policy = {};
  const policyPath = path.join(process.cwd(), '.claude-tweaks', 'policy.yml');
  if (fs.existsSync(policyPath)) {
    try {
      policy = parsePolicyModelConfig(fs.readFileSync(policyPath, 'utf8'));
    } catch (e) {
      fail(`malformed ${policyPath}: ${e.message}`);
      return;
    }
  }

  let frontierUsed = 0;
  const tallyPath = runDir ? path.join(runDir, 'frontier-tally.log') : null;
  if (tallyPath && fs.existsSync(tallyPath)) {
    frontierUsed = fs.readFileSync(tallyPath, 'utf8')
      .split('\n').filter((l) => l.startsWith('frontier\t')).length;
  }

  const failedModels = readFailedModels(process.env.CLAUDE_CODE_SESSION_ID);

  let result;
  try {
    result = resolve(profile, { policy, stance, unattended, frontierUsed, failedModels });
  } catch (e) {
    fail(e.message);
    return;
  }

  // The read side degrades to 0 on a missing tally, but the append cannot
  // degrade: a run-dir that does not exist throws ENOENT, and an uncaught
  // throw here is a raw stack trace on stderr. Failing loud is right — a lost
  // append silently under-counts the frontier cap on every later resolution.
  if (tallyPath && result.model === 'fable') {
    try {
      fs.appendFileSync(tallyPath, `frontier\t${new Date().toISOString()}\n`);
    } catch (e) {
      fail(`cannot append frontier tally: ${e.message}`);
      return;
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/model-profiles/cli.test.js`
Expected: PASS, all tests (existing + 5 new)

Run the full model-profiles suite once more:
Run: `node --test tests/bin-lib/model-profiles/`
Expected: PASS, all files

- [ ] **Step 5: Commit**

```bash
git add bin/resolve-profile.js tests/bin-lib/model-profiles/cli.test.js
git commit -m "resolve-profile CLI: read session-failure blacklist, add record-failure subcommand"
```

---

### Task 4: Document the mechanism in the Model Selection contract

**Files:**
- Modify: `skills/_shared/subagent-output-contract.md`

**Interfaces:**
- Consumes: nothing (prose-only task).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Update the "Dispatching" paragraph**

In `skills/_shared/subagent-output-contract.md`, find the "Dispatching." paragraph in the `## Model Selection` section (the one starting "Name the profile in the prompt as `[Use: {Profile}]`..."). Append this sentence to the end of that paragraph, after the existing "(${CLAUDE_PLUGIN_ROOT}` is not reliably set...)" parenthetical:

```
When a dispatched agent's own failure is specifically a credit/usage-exhaustion error (not a reasoning failure, not a timeout), run `node bin/resolve-profile.js record-failure {model}` — `{model}` is the family alias this dispatch resolved to (`haiku`/`sonnet`/`opus`/`fable`) — before any retry or re-dispatch this session. The resolver reads this session-scoped blacklist on every later resolution and steps down to the next viable tier rather than re-resolving the same failed model (#763); the blacklist lives under `os.tmpdir()`, keyed by `CLAUDE_CODE_SESSION_ID`, and is never consulted across sessions.
```

- [ ] **Step 2: Update the Frontier "Best-effort rule" sentence**

In the same file's `## Model Selection` section, find the "**Frontier is singleton-only.**" paragraph, which currently ends: "Best-effort rule: a harness usage-limit warning observed in-session degrades Frontier to Capable for the remainder of the run — best-effort, no mechanism claimed." Replace that final sentence with:

```
A harness usage-limit warning observed in-session, or a dispatched agent's own credit/usage-exhaustion failure, is recorded via `record-failure` (see Dispatching above) and degrades that specific model to the next viable tier for the remainder of the session — a real mechanism (#763), not best-effort.
```

- [ ] **Step 3: Verify no other file restates what this section now documents**

Run: `grep -rn "best-effort, no mechanism claimed" skills/`
Expected: no output — confirms the sentence being replaced was not duplicated elsewhere (this file is the single canonical Model Selection section every dispatch site cites, per CLAUDE.md's own citation-once convention).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — this task is prose-only, but `subagent-output-contract.md` is read by conformance tests elsewhere in the suite; a full run confirms nothing there pins the exact sentences just changed.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/subagent-output-contract.md
git commit -m "Document the session-failure blacklist in the Model Selection contract"
```
