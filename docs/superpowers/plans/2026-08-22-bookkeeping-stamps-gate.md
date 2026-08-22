# Bookkeeping Stamps Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mechanical PreToolUse gate — "in the spirit of the existing E1 working-directory gate" — that denies a covered Edit/Write/NotebookEdit/`git commit`/`git push` call when a materialize commit has already landed on the run's branch but `record-worktree` and (under `integration-model: pr-first`) `record-pr` were never called, so IL-131's failure mode (a build agent's "already satisfied by prior work" judgment sweeping past both non-skippable sub-steps) is caught structurally instead of relying on bolded prose that has already failed twice.

**Architecture:** A new gate function, `checkBookkeepingStampsGate`, lives beside `checkTeardownGate`/`checkPipelineShadowGuard`/`checkWorktreeRequired` in `plugin/bin/lib/hooks/pre-tool-use.js` and is wired into `runInner()`'s existing gate chain. It fires only once a committed `work/{n}-spec.md` (or `spec-{slug}/work/{n}-spec.md`) exists on the current branch — the same precondition `build/SKILL.md` Spec Step 1 documents both non-skippable sub-steps as preceding — so it never fires while Common Step 1 is still legitimately in progress. It reuses the already-existing, already-in-process `resolveIntegrationModel()` (from `bin/lib/policy-schema.js`, already called in-process by `bin/lib/reconcile/index.js`) rather than re-detecting forge state ad hoc, and exempts a run whose `decisions.md` already carries the mandated PR-early-lifecycle degrade log line, so a genuine push/PR-create failure degrades gracefully instead of hard-blocking. No `hooks.json` changes are needed — Edit/Write/NotebookEdit already carry unconditional PreToolUse matchers and Bash git-commit/push are already gated by an `if` matcher, the identical tool coverage E1 already uses (`GATE_COVERAGE`).

**Tech Stack:** Node.js (`node --test`), no new dependencies. Real git repos in temp dirs for tests (this module's existing convention — no fake-fs/injectable-runner seam; see `tests/hooks-pre-tool-use.test.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-22T061958-record-991/work/991-spec.md` (materialized from GitHub issue #991 — "Enforce record-worktree + PR-early lifecycle stamps structurally, not by bolded prose (recurrence of IL-131)").

## Global Constraints

- Every hook path — including a deny — must `exit: 0`; the deny signal is `hookSpecificOutput.permissionDecision: 'deny'` in the stdout JSON only (`docs/hooks.md` line 5, `pre-tool-use.js`'s own header comment). Never set a non-zero exit.
- Ambiguity resolves to allow (`docs/hooks.md` line 8). This gate must never deny when: no run resolves, the run isn't in worktree mode, no materialize commit has landed yet, or `integration-model` can't be determined.
- `run-state.json` is written only through sanctioned `hooks.js` verbs (`record-worktree`, `record-pr`, `close-run`) — this new gate is **read-only** against it; it may append to `events.jsonl` via `ctxLib.appendEvent`, same as E1.
- `GATE_COVERAGE` (the prose-pinned tool/gitAction list, `tests/hooks-gate-coverage.test.js`) stays unchanged — this gate reuses the existing tool coverage, so no `policy-schema-coverage.md` edit is required.

---

### Task 1: `hasMaterializeCommit` sentinel + tests

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js` (add near `WORK_SPEC_TAIL_RE`, around line 74)
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js` (new file)

**Interfaces:**
- Produces: `hasMaterializeCommit(worktreeRoot: string): boolean` — internal (not exported from the module; Task 4's end-to-end tests exercise it only through `pre.run()`, matching this file's existing convention of testing through the public `run()` entry point rather than internal helpers).

- [ ] **Step 1: Write the failing test**

Create `tests/hooks-bookkeeping-stamps-gate.test.js`:

```js
// tests/hooks-bookkeeping-stamps-gate.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pre = require('../plugin/bin/lib/hooks/pre-tool-use');

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

function linkedWorktreeOf(main) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-wtparent-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${path.basename(parent)}`]);
  return fs.realpathSync(wt);
}

function commitMaterializedSpec(wt, relPath) {
  const abs = path.join(wt, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '---\nrecord: 1\n---\nbody\n');
  execFileSync('git', ['-C', wt, 'add', relPath]);
  execFileSync('git', ['-C', wt, 'commit', '-m', 'Materialize spec', '-q']);
}

function mkRunDir(project, worktree, sessionId, extra) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-22T061958-record-991');
  fs.mkdirSync(run, { recursive: true });
  const state = { status: 'active', ...(worktree ? { worktree } : {}), ...(sessionId !== undefined ? { sessionId } : {}), ...extra };
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { run, state };
}

const editInput = (filePath) => ({ tool_name: 'Edit', tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' } });
const bashInput = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

test('bookkeeping-stamps gate: no materialize commit yet -> allow (Common Step 1 still in progress)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const { run } = mkRunDir(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-')), null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: materialize commit landed, no run resolved -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: null, runState: null, cwd: wt });
  assert.deepStrictEqual(out, {});
});
```

- [ ] **Step 1b: Write a multi-record-shape test (proves the `spec-*/work` glob pathspec, not just the single-record `work` one)**

Append immediately after the two tests above:

```js
test('bookkeeping-stamps gate: multi-record materialize commit (spec-{slug}/work/{n}-spec.md) also counts as the materialize sentinel -> deny reachable', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('spec-991-995', 'work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'multi-record spec-{slug}/work/{n}-spec.md form must also be recognized as a landed materialize commit');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});
```

This test is written to FAIL until Task 1 Step 3's `hasMaterializeCommit` pathspec (`'work'`, `'spec-*/work'`) is proven to match the multi-record directory shape — if the glob doesn't actually match, this test catches it here rather than leaving the multi-record path silently unenforced. If `git log -- 'spec-*/work'` turns out not to fnmatch across the `/` the way the comment above assumes, widen the pathspec (e.g. add an explicit `spec-*/work/*-spec.md` alternative) until this test passes — do not weaken the test.

- [ ] **Step 2: Run test to verify it passes trivially, then add the real assertion**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: the first two tests PASS already (no gate wired in yet — `runInner` doesn't call anything new, so behavior is unchanged allow); the Step 1b multi-record test FAILS (it asserts a deny that nothing produces yet — expected at this point, since neither `hasMaterializeCommit` nor the gate exist). This is expected: Task 1 only adds the detection helper, not the deny path — Task 2 wires in the deny behavior all three of these cases exercise.

- [ ] **Step 3: Implement `hasMaterializeCommit`**

In `plugin/bin/lib/hooks/pre-tool-use.js`, immediately after the `WORK_SPEC_TAIL_RE` constant (after line 74), add:

```js
// Materialize-commit sentinel for the bookkeeping-stamps gate below: a
// committed work/{n}-spec.md (or its multi-record spec-{slug}/work/{n}-spec.md
// form) on the current branch is the signal that build/SKILL.md Spec Step 1's
// materialize commit already landed — the exact precondition
// build/worktree-setup.md Step 4.5 (record-worktree) and Step 6 (PR-early
// lifecycle) are documented to precede. Read-only, best-effort: any git
// failure (no commits yet, git unavailable) resolves to false — ambiguity
// never triggers the gate, same posture as every other check in this file.
function hasMaterializeCommit(worktreeRoot) {
  const { stdout, failure } = runGit(
    ['log', '--oneline', '-1', '--', 'work', 'spec-*/work'],
    worktreeRoot,
  );
  if (failure) return false;
  return Boolean(stdout && stdout.trim());
}
```

- [ ] **Step 4: Add tests proving the sentinel itself, through `pre.run()` with a stub gate not yet wired**

These tests can't observe `hasMaterializeCommit` directly (it's not exported, matching this module's convention). Skip a standalone unit test for it — Task 2's deny tests exercise it end-to-end once the gate is wired in. Proceed to Task 2.

- [ ] **Step 5: Run full test file, confirm the expected red/green split**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: PASS (2/2) on the first two tests; the Step 1b multi-record test still FAILS — `hasMaterializeCommit` now exists but nothing calls it yet (the gate itself is wired in Task 2). This is expected, not a regression: Task 1 stops with that test deliberately red so Task 2 has a real assertion to turn green rather than silently coasting on a helper nothing exercises.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-bookkeeping-stamps-gate.test.js
git commit -m "Add hasMaterializeCommit sentinel for the bookkeeping-stamps gate (refs #991)"
```

---

### Task 2: `checkBookkeepingStampsGate` — missing `record-worktree` stamp (deny path)

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js`
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js`

**Interfaces:**
- Consumes: `hasMaterializeCommit(worktreeRoot)` (Task 1), `wtDetect.repoInfo(p)` → `{repoRoot, isLinkedWorktree, indeterminate}`, `denyResult(reason)`, `ctxLib.appendEvent(runDir, type, data)`, `pluginRoot()` — all already defined in this file.
- Produces: `checkBookkeepingStampsGate(ctx, commandGitTargets, deps = {}): {} | {exit, json}` — same return shape as every other gate in this file. `deps` is accepted now but unused until Task 3; not yet exported from the module (Task 3 exports it once there's a reason to unit-test it directly).

- [ ] **Step 1: Write the failing test**

Append to `tests/hooks-bookkeeping-stamps-gate.test.js`:

```js
test('bookkeeping-stamps gate: materialize commit landed, run resolved, no worktree stamp -> deny', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'expected a deny result');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-worktree/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.type === 'bookkeeping-stamp-deny' && e.data && e.data.stamp === 'record-worktree'));
});

test('bookkeeping-stamps gate: same deny fires for a Bash git-commit call, not just Edit/Write', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  fs.writeFileSync(path.join(wt, 'other.txt'), 'x'); // staged content for the commit below
  execFileSync('git', ['-C', wt, 'add', 'other.txt']);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: bashInput('git commit -m "unrelated fix"', wt), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(out.json, 'expected a deny result for a Bash git-commit call too');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-worktree/);
});

test('bookkeeping-stamps gate: materialize commit landed AND worktree stamp present -> allow (pr-first check runs but resolves local-merge, no origin remote on this fixture)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  // No origin remote on this fixture repo -> resolveIntegrationModel resolves
  // 'local-merge' (detectIntegrationModel's own fail-open first check), so the
  // PR-stamp branch (Task 3) never denies here even with runState.pr unset.
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: main checkout (not a linked worktree) -> allow regardless of stamps', () => {
  const main = gitRepo();
  commitMaterializedSpec(main, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined);
  const out = pre.run({ input: editInput(path.join(main, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: main });
  assert.deepStrictEqual(out, {});
});
```

- [ ] **Step 2: Run test to verify the deny tests fail**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: FAIL on this task's first two new tests (the Edit-triggered and Bash-git-commit-triggered deny cases — both assert `out.json` truthy but the gate isn't wired in yet, so `out` is still `{}`) and on the carried-over Task 1 Step 1b multi-record test (same reason). The other two new tests in this task ("worktree stamp present" and "main checkout") pass already since they assert allow, which is still the unconditional behavior at this point.

- [ ] **Step 3: Implement `checkBookkeepingStampsGate`'s worktree-stamp check**

In `plugin/bin/lib/hooks/pre-tool-use.js`, add this function immediately before `runInner` (i.e., right after `checkWorktreeRequired`'s closing brace, before the `function runInner(ctx, indeterminateTargets, teardownWarnings) {` line):

```js
// Bookkeeping-stamps gate: build/SKILL.md Spec Step 1 marks record-worktree
// (Common Step 1 Step 4.5) and, under integration-model: pr-first, the
// PR-early lifecycle's draft-PR open (Step 6) as non-skippable — a build
// agent's own "already satisfied by prior work" judgment has twice (IL-131,
// its recurrence on record #893) swept past both anyway despite the bolded
// prose. This is the mechanical backstop: once a materialize commit has
// landed (hasMaterializeCommit above — the exact precondition both
// sub-steps are documented to precede), a covered call is denied if either
// stamp is still missing. Ambiguity resolves to allow, same posture as E1:
// no materialize commit yet (Common Step 1 still in progress), no resolved
// run, or a target outside a linked worktree all no-op here.
// `deps.resolveIntegrationModel` is an injectable override of the real
// `resolveIntegrationModel` import (Task 3 wires the PR-stamp branch that
// uses it) — unused by this task's own worktree-stamp check, but accepted
// here so the signature never has to change again once Task 3 lands.
function checkBookkeepingStampsGate(ctx, commandGitTargets, deps = {}) {
  const toolName = ctx.input && ctx.input.tool_name;
  const isFileTool = GATE_COVERAGE.tools.includes(toolName);
  const isGitWrite = toolName === 'Bash' && Array.isArray(commandGitTargets) && commandGitTargets.length > 0;
  if (!isFileTool && !isGitWrite) return {};
  if (!ctx.runDir || !ctx.runState) return {};
  if (ctx.runState.status === 'clean') return {};
  const { repoRoot: wtRoot, isLinkedWorktree, indeterminate } = wtDetect.repoInfo(ctx.cwd);
  if (indeterminate || !wtRoot || !isLinkedWorktree) return {};
  if (!hasMaterializeCommit(wtRoot)) return {};

  if (!ctx.runState.worktree) {
    ctxLib.appendEvent(ctx.runDir, 'bookkeeping-stamp-deny', { stamp: 'record-worktree', worktree: wtRoot });
    return denyResult(
      `claude-tweaks: a materialize commit already landed in ${wtRoot} but this run's worktree assignment was never ` +
      `recorded — build/worktree-setup.md Step 4.5 (record-worktree) is non-skippable, even when Spec Step 2 judges no ` +
      `further implementation is needed [IL-131]. Run: node "${pluginRoot()}/bin/hooks.js" record-worktree --run "${ctx.runDir}" "${wtRoot}"`,
    );
  }

  return {};
}
```

- [ ] **Step 4: Wire the gate into `runInner`**

In `runInner`, after the `commandGitTargets` computation and the `checkWorktreeRequired` call (immediately after the block ending `if (gate.json) return gate;` around line 697), insert:

```js
  const stamps = checkBookkeepingStampsGate(ctx, commandGitTargets);
  if (stamps.json) return stamps;

```

directly before the existing line `if (!ctx.runDir || !ctx.runState || !ctx.runState.worktree) return {};` — this ordering is load-bearing: E1's own next line no-ops precisely when `runState.worktree` is missing, which is the exact gap this new gate exists to close, so it must run first.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: PASS (7/7) — the two Task 1 Step 1 tests, the Task 1 Step 1b multi-record test (now green now that the gate is wired), and the four tests added in this task's Step 1.

- [ ] **Step 6: Run the full existing E1 suite to confirm no regression**

Run: `node --test tests/hooks-pre-tool-use.test.js`
Expected: PASS, unchanged pass count from before this task (the new gate only adds a new deny path gated behind `hasMaterializeCommit`, which is false for every existing E1 fixture — none of them commit a `work/` path).

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-bookkeeping-stamps-gate.test.js
git commit -m "Deny a covered write when record-worktree never ran after materialize (refs #991)"
```

---

### Task 3: PR-early lifecycle stamp check + graceful-degrade exemption

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js`
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js`

**Interfaces:**
- Consumes: `resolveIntegrationModel(repoRoot)` from `../policy-schema` (new require), `wtDetect.mainCheckoutRoot(p)`.
- Produces: extends `checkBookkeepingStampsGate` with a third `deps` parameter (`{ resolveIntegrationModel }`, defaulting to the real import) and the PR-stamp branch; adds internal `hasLoggedPrDegrade(runDir)`; exports both `checkBookkeepingStampsGate` and `hasLoggedPrDegrade` from the module (this file's established pattern for direct-testable predicates — see `isPolicyFile`/`isPolicyOnlyCommit`/`checkPipelineShadowGuard` in the existing `module.exports`).

**Why `deps` injection here:** `resolveIntegrationModel` shells out to `git remote get-url` and `gh repo view` (`detectIntegrationModel`, `bin/lib/policy-schema.js`). A sandboxed test fixture repo has no real GitHub-backed remote, so `gh repo view` always fails there and the real resolver can only ever return `'local-merge'` in a test — meaning the pr-first deny branch could never be exercised at all without a way to substitute the resolution. Injecting it (defaulting to the real function in production, overridable in tests) follows this repo's own `gh-api-module-pattern` injectable-runner convention rather than leaving the deny path untested.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks-bookkeeping-stamps-gate.test.js`:

```js
test('bookkeeping-stamps gate: worktree stamped, resolveIntegrationModel stubbed to pr-first, no PR recorded -> deny', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.ok(out.json, 'expected a deny result once integration-model resolves pr-first with no PR recorded');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-pr|PR-early/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.type === 'bookkeeping-stamp-deny' && e.data && e.data.stamp === 'record-pr'));
});

test('bookkeeping-stamps gate: worktree stamped, pr-first stubbed, degrade already logged in decisions.md -> allow (graceful degrade)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  fs.writeFileSync(
    path.join(run, 'decisions.md'),
    '## /build\n- AUTO 09:00:00 — PR-early run lifecycle: push of wt-branch to origin FAILED (network); run proceeds local-only, no PR opened. Reversibility: n/a.\n',
  );
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped, resolveIntegrationModel stubbed to local-merge, no PR recorded -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'local-merge' },
  );
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: through pre.run() with the real (unstubbed) resolveIntegrationModel — a fixture repo with no gh-backed remote resolves local-merge, PR branch never denies', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined);
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt }, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('bookkeeping-stamps gate: worktree stamped AND pr recorded -> allow regardless of integration-model', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, wt, undefined, { pr: { number: 991, url: 'https://github.com/example/example/pull/991' } });
  const out = pre.checkBookkeepingStampsGate(
    { input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active', worktree: wt, pr: { number: 991, url: 'x' } }, cwd: wt },
    null,
    { resolveIntegrationModel: () => 'pr-first' },
  );
  assert.deepStrictEqual(out, {});
});

test('hasLoggedPrDegrade: recognizes the mandated PR-early run lifecycle FAILED log line', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, '/nonexistent', undefined);
  fs.writeFileSync(
    path.join(run, 'decisions.md'),
    '## /build\n- AUTO 14:32:14 — PR-early run lifecycle: push of feature-branch to origin FAILED (network); run proceeds local-only, no PR opened. Reversibility: n/a.\n',
  );
  assert.strictEqual(pre.hasLoggedPrDegrade(run), true);
});

test('hasLoggedPrDegrade: false when decisions.md has no matching line', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, '/nonexistent', undefined);
  fs.writeFileSync(path.join(run, 'decisions.md'), '## /build\n- AUTO 14:32:14 — unrelated entry.\n');
  assert.strictEqual(pre.hasLoggedPrDegrade(run), false);
});

test('hasLoggedPrDegrade: false when decisions.md does not exist', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, '/nonexistent', undefined);
  assert.strictEqual(pre.hasLoggedPrDegrade(run), false);
});
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: FAIL on all six tests added in this task's Step 1 — `pre.checkBookkeepingStampsGate` and `pre.hasLoggedPrDegrade` are not exported yet (calling either throws `pre.checkBookkeepingStampsGate is not a function` / `pre.hasLoggedPrDegrade is not a function`), so every test in this task fails at that call, including the ones that would otherwise assert allow. All prior tests (from Tasks 1-2) still pass unchanged.

- [ ] **Step 3: Implement `hasLoggedPrDegrade` and the PR-stamp branch**

At the top of `plugin/bin/lib/hooks/pre-tool-use.js`, add the new require alongside the existing ones (after the `const { runGit } = require('./git-exec');` line):

```js
const { resolveIntegrationModel } = require('../policy-schema');
```

Immediately before `checkBookkeepingStampsGate` (or directly after `hasMaterializeCommit`), add:

```js
// Graceful-degrade exemption for the PR-stamp check below: pr-early-run-lifecycle.md
// mandates a "PR-early run lifecycle: ... FAILED" decisions.md log line whenever the
// push or `gh pr create` genuinely fails (Steps 2 and 3). A run that logged this
// legitimately has no PR to record and must not be denied for it — read-only,
// best-effort: a missing or unreadable decisions.md resolves to false (no exemption
// found), never throws.
function hasLoggedPrDegrade(runDir) {
  try {
    const body = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
    return /PR-early run lifecycle:.*FAILED/i.test(body);
  } catch {
    return false;
  }
}
```

Then extend `checkBookkeepingStampsGate`'s body — replace its final `return {};` with:

```js
  if (!ctx.runState.pr) {
    const resolveModel = (deps && deps.resolveIntegrationModel) || resolveIntegrationModel;
    const mainRoot = wtDetect.mainCheckoutRoot(wtRoot) || wtRoot;
    let model;
    try {
      model = resolveModel(mainRoot);
    } catch {
      model = 'local-merge'; // fail open: an unresolvable model is not provably pr-first
    }
    if (model === 'pr-first' && !hasLoggedPrDegrade(ctx.runDir)) {
      ctxLib.appendEvent(ctx.runDir, 'bookkeeping-stamp-deny', { stamp: 'record-pr', worktree: wtRoot });
      return denyResult(
        `claude-tweaks: this project resolves integration-model: pr-first and a materialize commit already landed in ` +
        `${wtRoot}, but no PR is recorded for this run — build/worktree-setup.md Step 6 (the PR-early lifecycle draft-PR ` +
        `open, _shared/pr-early-run-lifecycle.md) is non-skippable, even when Spec Step 2 judges no further ` +
        `implementation is needed [IL-131]. Open it now, or — if the push/PR-create genuinely failed — log the ` +
        `mandatory "PR-early run lifecycle: ... FAILED" line to decisions.md per pr-early-run-lifecycle.md before continuing.`,
      );
    }
  }

  return {};
```

Finally, export `checkBookkeepingStampsGate` and `hasLoggedPrDegrade` for the direct unit tests above — add both to the `module.exports` block at the bottom of the file:

```js
  checkBookkeepingStampsGate,
  hasLoggedPrDegrade,
```

(inserted as a new line in the existing `module.exports = { ... }` object, alongside `shadowPipelineRunDir`/`checkPipelineShadowGuard`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: PASS (15/15) — 3 from Task 1 (including the now-green multi-record test), 4 from Task 2, 8 from this task's Step 1.

- [ ] **Step 5: Run the full existing E1 + reconcile suites to confirm no regression**

Run: `node --test tests/hooks-pre-tool-use.test.js tests/hooks-gate-coverage.test.js`
Expected: PASS, unchanged pass counts — `GATE_COVERAGE` itself was not modified, so `hooks-gate-coverage.test.js`'s prose-pinning assertions are untouched.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-bookkeeping-stamps-gate.test.js
git commit -m "Deny a covered write when pr-first has no recorded PR after materialize, exempt logged degrades (refs #991)"
```

---

### Task 4: End-to-end regression test reproducing the #118/#893 trigger

**Files:**
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1-3, exercised only through `pre.run()` — no new production code in this task.

- [ ] **Step 1: Write the reproduction test**

Append to `tests/hooks-bookkeeping-stamps-gate.test.js`:

```js
test('regression (IL-131 recurrence, records #118/#893): a build agent that materializes then edits code directly — no record-worktree, no record-pr — is denied on its very first code edit, not silently allowed through', () => {
  // Reproduces the exact trigger: build judged "already satisfied by prior
  // work," skipped straight from the materialize commit to editing
  // implementation code, never calling record-worktree or record-pr.
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '893-spec.md'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-proj-'));
  const { run } = mkRunDir(project, null, undefined); // record-worktree never ran

  // The first tool call after materialize: an Edit to some already-satisfied
  // file, exactly the "nothing further to implement" shortcut IL-131 describes.
  const out = pre.run({
    input: editInput(path.join(wt, 'plugin', 'skills', 'build', 'SKILL.md')),
    runDir: run,
    runState: { status: 'active' },
    cwd: wt,
  });

  assert.ok(out.json, 'expected the sweep-past-both-stamps case to be caught, not silently allowed');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /record-worktree/);

  // Simulate remediation: run record-worktree, retry the same edit.
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'active', worktree: wt }));
  const retry = pre.run({
    input: editInput(path.join(wt, 'plugin', 'skills', 'build', 'SKILL.md')),
    runDir: run,
    runState: { status: 'active', worktree: wt },
    cwd: wt,
  });
  // No origin remote on this fixture -> local-merge, so the PR-stamp branch
  // never applies here; the edit is now allowed once the worktree stamp lands.
  assert.deepStrictEqual(retry, {});
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: PASS (16/16) — this test should already pass given Tasks 1-3's implementation; it is a regression pin, not new behavior.

- [ ] **Step 3: Run the entire test suite**

Run: `npm test`
Expected: PASS, full suite green (this repo's `npm test` runs every `tests/**` file plus `tools/upstream-drift/tests/`).

- [ ] **Step 4: Commit**

```bash
git add tests/hooks-bookkeeping-stamps-gate.test.js
git commit -m "Add IL-131 recurrence regression test for the bookkeeping-stamps gate (refs #991)"
```

---

### Task 5: Document the gate — `docs/hooks.md`, `docs/incident-log.md` IL-131, cross-reference in `build/SKILL.md`

**Files:**
- Modify: `docs/hooks.md`
- Modify: `docs/incident-log.md`
- Modify: `plugin/skills/build/SKILL.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Add a bullet to `docs/hooks.md`**

Insert a new bullet after the existing `worktree-always` verdict banner bullet (after the line ending `...it cannot itself widen the never-break-a-session invariant.` — the last bullet before the `Referenced by` line), matching this file's existing dense-bullet style:

```markdown
- **Bookkeeping-stamps gate (block tier, IL-131):** `pre-tool-use.js`'s `checkBookkeepingStampsGate` denies a covered Edit/Write/NotebookEdit/commit/push once a materialize commit has landed on the run's branch (`hasMaterializeCommit` — a committed `work/{n}-spec.md`) but `record-worktree` never stamped `run-state.json.worktree`, or — under a `resolveIntegrationModel()`-resolved `pr-first` project — `record-pr` never stamped `run-state.json.pr`. Same ambiguity-resolves-to-allow posture as E1: no materialize commit yet, no resolved run, or a target outside a linked worktree all no-op. A run whose `decisions.md` already carries the mandated `PR-early run lifecycle: ... FAILED` degrade line is exempted from the PR-stamp deny — a genuine push/PR-create failure still degrades gracefully, never a hard block. Reuses `GATE_COVERAGE`'s existing tool/gitAction list — no `hooks.json` or coverage-prose change.
```

- [ ] **Step 2: Add a Resolution addendum to `docs/incident-log.md`'s IL-131 entry**

Find the IL-131 entry (search for `## IL-131`) and append a new paragraph immediately after its existing "**Recurrence (record #893, 2026-08-20):**" paragraph:

```markdown

**Resolution (record #991, 2026-08-22):** the second recurrence's own backlog candidate — investigate structural, hook-level enforcement rather than a third prose iteration — was built as `pre-tool-use.js`'s `checkBookkeepingStampsGate` (`docs/hooks.md`'s bookkeeping-stamps-gate bullet): a covered Edit/Write/NotebookEdit/commit/push is now denied once a materialize commit has landed but `record-worktree` and (under `integration-model: pr-first`) `record-pr` weren't stamped, with a decisions.md degrade-log exemption preserving the legitimate push/PR-create-failure path. This closes the loop IL-131's own generalizable rule named: a sub-step whose failure mode is silent needed enforcement at the point of use, not correct sequencing or bolded prose alone.
```

- [ ] **Step 3: Cross-reference from `build/SKILL.md`**

In `plugin/skills/build/SKILL.md`, find the "Non-skippable, regardless of what Spec Step 2's implementation assessment turns out to find:" sentence in Spec Step 1 and append one clause to it (do not remove any existing text — this is additive):

Find:
```
never treat "the acceptance criteria already look satisfied" as license to jump past either. A record found already-satisfied still needs its own PR and its own worktree stamp: the reconciler's automatic worktree-reap and run-dir archival (`bin/hooks.js reconcile`) key off that stamp, and skipping it silently strands the run's cleanup on whoever dispatched it (`docs/incident-log.md`'s `[IL-131]`).
```

Replace with:
```
never treat "the acceptance criteria already look satisfied" as license to jump past either. A record found already-satisfied still needs its own PR and its own worktree stamp: the reconciler's automatic worktree-reap and run-dir archival (`bin/hooks.js reconcile`) key off that stamp, and skipping it silently strands the run's cleanup on whoever dispatched it (`docs/incident-log.md`'s `[IL-131]`). This is now also caught mechanically, not just by this prose: `docs/hooks.md`'s bookkeeping-stamps gate denies the next covered write once a materialize commit has landed without both stamps present.
```

- [ ] **Step 4: Verify the doc edits with a quick grep, no test to run for prose-only changes**

Run: `grep -n "bookkeeping-stamps gate" docs/hooks.md docs/incident-log.md plugin/skills/build/SKILL.md`
Expected: three hits, one per file.

- [ ] **Step 5: Commit**

```bash
git add docs/hooks.md docs/incident-log.md plugin/skills/build/SKILL.md
git commit -m "Document the bookkeeping-stamps gate and close IL-131's Resolution (refs #991)"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, full suite green.

- [ ] **Step 2: Run the perf suite if touched files are perf-sensitive**

This change adds a `git log` call to a hot PreToolUse path. Run: `npm run test:perf`
Expected: PASS, or if a budget is tight, note it — `hasMaterializeCommit` short-circuits via `runGit`'s existing 5s-bounded timeout and only runs after the (cheap, fs-only) `wtDetect.repoInfo` check already confirms a linked worktree, so its cost is bounded to genuinely worktree-mode pipeline runs, not every tool call project-wide.

- [ ] **Step 3: Commit any perf-budget adjustment if needed, otherwise no commit for this task**

No files change in this task unless Step 2 surfaces a budget miss — in that case, follow whatever remediation `npm run test:perf`'s own output recommends (this plan does not pre-guess a specific budget number).
