# PR-Early Lifecycle Null-RunState Gap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap where `checkBookkeepingStampsGate` (`plugin/bin/lib/hooks/pre-tool-use.js`) silently no-ops — allowing every covered Edit/Write/commit/push through with no deny and no trace — whenever a run directory resolves but `run-state.json` doesn't exist yet, because `record-worktree` was never invoked (the "materialize-then-implement-directly" shortcut, #1456).

**Architecture:** `checkBookkeepingStampsGate` currently short-circuits to `{}` (allow, no-op) whenever `!ctx.runDir || !ctx.runState` (line 1130). Production wiring (`bin/hooks.js` line 881-882) sets `ctx.runState = runDir ? ctxLib.readRunState(runDir) : null` — and `readRunState` returns `null` both when no run dir exists at all AND when the run dir exists but `run-state.json` is simply absent (a file-not-found is caught the same as "no run dir"). This conflates two materially different states: "no run resolved, nothing to gate" (correctly a no-op) and "a real, adopted run dir exists (with a landed materialize commit) but `record-worktree` was never called" (should deny, exactly like the already-covered "run-state.json exists but `worktree` field is unset" case). The fix separates these: only `!ctx.runDir` short-circuits; a resolved run dir with no run-state.json treats `runState` as `{}` and falls through to the existing (unchanged) stamp-check logic, which already denies correctly once a materialize commit is confirmed landed.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-30T000813-record-1456/work/1456-spec.md` (materialized from GitHub issue #1456)

## Global Constraints

- Never widen the gate's deny surface beyond this one gap — the "ambiguity resolves to allow" posture (docs/hooks.md, the never-break-a-session invariant) must hold for every other branch unchanged.
- The existing test `bookkeeping-stamps gate: materialize commit landed, no run resolved -> allow` (tests/hooks-bookkeeping-stamps-gate.test.js, passes `runDir: null, runState: null`) must keep passing unmodified — it covers a genuinely different case (`runDir` itself null) than this fix's target case (`runDir` set, `runState` null).
- Do not touch `#1106`/`#838`'s existing fixes (`worktree-setup.md`'s "already inside an externally-created worktree" Step 4.5 re-stamp; `pr-early-run-lifecycle.md`'s mandatory degrade-log wording) — both remain correct and unrelated to this gap.

---

### Task 1: Fix the null-runState no-op and add regression coverage

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js:1125-1246` (`checkBookkeepingStampsGate`) and its header comment at `1076-1083`
- Modify: `docs/hooks.md` (the bookkeeping-stamps-gate bullet's "no resolved run" no-op wording, currently in the paragraph starting "Same ambiguity-resolves-to-allow posture as E1")
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js`

**Interfaces:**
- Consumes: `pre.run(ctx, deps)` — the existing exported entry point (`module.exports.run`), unchanged signature. `ctx.runDir` (string|null), `ctx.runState` (object|null), `ctx.cwd` (string), `ctx.input` (hook payload).
- Produces: no new exports. `checkBookkeepingStampsGate`'s external behavior contract: given `ctx.runDir` truthy and a landed materialize commit under it, a missing worktree/PR stamp now denies **regardless of whether `run-state.json` exists at all**, not only when it exists with the field unset.

- [x] **Step 1: Write the failing test**

Add to `tests/hooks-bookkeeping-stamps-gate.test.js`, immediately after the existing test at line 108 (`same deny fires for a Bash git-commit call...` — insert after that block, before the next test):

```js
test('bookkeeping-stamps gate: materialize commit landed, run dir resolved but run-state.json never written (record-worktree never ran) -> deny, not allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const project = projectDir();
  const run = path.join(project, '.claude-tweaks', 'pipelines', RUN_ID);
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'decisions.md'), '# Auto-Decision Log\n');
  // Deliberately no run-state.json -- mirrors bin/hooks.js's real wiring
  // (`runState = runDir ? ctxLib.readRunState(runDir) : null`), where a
  // resolved-but-uninitialized run dir yields runState === null, not {}.
  const out = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: null, cwd: wt });
  assert.ok(out.json, 'expected a deny result -- a landed materialize commit with no run-state.json at all must not be treated as "no run resolved"');
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /record-worktree/);
  assert.match(spec.permissionDecisionReason, /IL-131/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: FAIL — the new test's `assert.ok(out.json, ...)` fails because `pre.run` currently returns `{}` (line 1130's `!ctx.runState` short-circuit fires on `runState === null` even though `runDir` is a real, adopted run directory).

- [x] **Step 3: Fix `checkBookkeepingStampsGate`**

In `plugin/bin/lib/hooks/pre-tool-use.js`, change line 1130 from:

```js
  if (!ctx.runDir || !ctx.runState) return {};
```

to:

```js
  if (!ctx.runDir) return {};
  // ctx.runState is null both when no run resolved (already excluded above)
  // AND when a real, adopted run dir exists but record-worktree never ran
  // yet (bin/hooks.js: `runState = runDir ? ctxLib.readRunState(runDir) :
  // null`, and readRunState returns null on a missing run-state.json the
  // same way it does on a missing run dir). Only the first case is "nothing
  // to gate" -- the second is exactly the materialize-then-implement-
  // directly shortcut this gate exists to catch (#1456), so it must fall
  // through to the same stamp checks below as an explicit `runState.worktree`
  // unset, not no-op here.
  const runState = ctx.runState || {};
```

Then replace every remaining `ctx.runState` reference **inside this function only** (lines 1131, 1142, 1170, 1184) with the new local `runState`:

- Line 1131: `if (ctx.runState.status === 'clean') return {};` → `if (runState.status === 'clean') return {};`
- Line 1142: `if (ctx.runState.worktree && (ctx.runState.pr || ctx.runState.prExempt)) return {};` → `if (runState.worktree && (runState.pr || runState.prExempt)) return {};`
- Line 1170: `if (!ctx.runState.worktree) {` → `if (!runState.worktree) {`
- Line 1184: `if (!ctx.runState.pr) {` → `if (!runState.pr) {`

Do **not** change `isForeignSessionCall(ctx)` or `hasDistinctOwnedRun(ctx)` (lines 994, 1013) or the `ctxLib.writeRunState(ctx.runDir, ...)` call at line 1241 — they already take `ctx` directly and already handle `ctx.runState` being null safely (`isForeignSessionCall`'s `ctx.runState && ...` guard returns an empty owner string, correctly falling through to "not foreign" rather than throwing).

Update the header comment's no-op list (lines 1077-1078, currently "the tool isn't covered, no run resolved, the run is already clean, BOTH stamps...") to read "the tool isn't covered, **`ctx.runDir` itself never resolved** (a run dir that resolved but has no `run-state.json` yet is NOT this case — see #1456), the run is already clean, BOTH stamps...".

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: PASS (all tests in the file, including the new one and the pre-existing `runDir: null, runState: null` case at line 78, which is untouched by this change since it still hits the `!ctx.runDir` branch).

- [x] **Step 5: Update docs/hooks.md**

In the bookkeeping-stamps-gate paragraph (the one beginning "Same ambiguity-resolves-to-allow posture as E1: no materialize commit yet, no resolved run, or a target outside a linked worktree all no-op."), change "no resolved run" to "`ctx.runDir` itself unresolved (a resolved run dir with no `run-state.json` yet is not this case, #1456)".

- [x] **Step 6: Run the full existing hooks test suites once more**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js tests/hooks-pre-tool-use.test.js`
Expected: PASS — confirms this change doesn't regress any other `checkBookkeepingStampsGate` scenario or any other gate sharing `pre-tool-use.js`.

- [x] **Step 7: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-bookkeeping-stamps-gate.test.js docs/hooks.md
git commit -m "Fix bookkeeping-stamps gate no-op on a resolved run dir with no run-state.json yet

refs #1456"
```
