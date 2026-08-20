# Extract shared events.jsonl wrap-up-scan reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two independently-drifting inline scans of `events.jsonl` (looking for a `skill_invoked` event with `skill === 'claude-tweaks:wrap-up'`) with one shared reader in `bin/lib/hooks/context.js`.

**Architecture:** Add `scanWrapupEvents(runDir)` to `context.js` next to its existing `appendEvent` writer, returning `{ any, wrapup } | null` (missing/unreadable file → `null`; malformed JSON lines skipped). Point `run-integrity.js`'s `checkRunIntegrity` and `close-run-state.js`'s `closeRunState` at it, deleting each file's own inline duplicate.

**Tech Stack:** Node.js (CommonJS), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044220-record-380/work/380-spec.md`

## Global Constraints

- No circular `require`: `context.js` gains no new dependency on `run-integrity.js`, `close-run-state.js`, or `hooks.js`.
- Fail-open contract preserved exactly: missing file, unreadable file, and malformed JSON lines all resolve to "not seen" — never throw.
- Full `npm test` passes.
- `tests/run-integrity.test.js` and `tests/teardown-gate.test.js` are not modified — both exercise this behavior only through their public entry points (`checkRunIntegrity`, and the `close-run` CLI path).

**Note on spec drift:** the spec's Technical Approach names `bin/hooks.js`'s close-run branch (lines ~213-223) as the second duplicate. In the current tree, that inline loop actually lives in `bin/lib/hooks/close-run-state.js`'s `closeRunState` (lines 36-46) — `bin/hooks.js`'s `close-run` command calls `closeRunState(runDir, {...})` and reads `.wrapupSeen` off its result; it never scans `events.jsonl` itself. Same duplication, same fix, different current file. `close-run-state.js` already `require('./context')` (as `ctxLib`), so Task 3 needs no new require line.

---

### Task 1: Add `scanWrapupEvents` to `context.js`

**Files:**
- Modify: `plugin/bin/lib/hooks/context.js` (add function + export, near `appendEvent` at line 353)
- Test: `tests/hooks-context.test.js`

**Interfaces:**
- Produces: `scanWrapupEvents(runDir: string): { any: boolean, wrapup: boolean } | null` — exported from `context.js`. `any` is true when at least one `skill_invoked` event exists in the file; `wrapup` is true when one of those events has `skill === 'claude-tweaks:wrap-up'`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/hooks-context.test.js` (this file already imports `ctx`, `fs`, `path`, and has `tmpProject()`/`mkRun()` fixture helpers — reuse them):

```javascript
test('scanWrapupEvents: missing events.jsonl returns null', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090000-spec-1', { status: 'active' });
  assert.strictEqual(ctx.scanWrapupEvents(run), null);
});

test('scanWrapupEvents: unreadable dir returns null', () => {
  assert.strictEqual(ctx.scanWrapupEvents('/nonexistent/run'), null);
});

test('scanWrapupEvents: no skill_invoked events returns any:false, wrapup:false', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090001-spec-1', { status: 'active' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), JSON.stringify({ type: 'other', ts: '2026-08-01T09:00:00Z' }) + '\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: false, wrapup: false });
});

test('scanWrapupEvents: skill_invoked for a different skill returns any:true, wrapup:false', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090002-spec-1', { status: 'active' });
  const line = JSON.stringify({ type: 'skill_invoked', skill: 'claude-tweaks:build', ts: '2026-08-01T09:00:00Z' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), line + '\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: true, wrapup: false });
});

test('scanWrapupEvents: skill_invoked for claude-tweaks:wrap-up returns any:true, wrapup:true', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090003-spec-1', { status: 'active' });
  const line = JSON.stringify({ type: 'skill_invoked', skill: 'claude-tweaks:wrap-up', ts: '2026-08-01T09:00:00Z' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), line + '\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: true, wrapup: true });
});

test('scanWrapupEvents: malformed JSON lines are skipped, not fatal', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090004-spec-1', { status: 'active' });
  const wrapupLine = JSON.stringify({ type: 'skill_invoked', skill: 'claude-tweaks:wrap-up', ts: '2026-08-01T09:00:00Z' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), 'not json\n' + wrapupLine + '\n\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: true, wrapup: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-context.test.js`
Expected: FAIL — `ctx.scanWrapupEvents is not a function`

- [ ] **Step 3: Implement `scanWrapupEvents` in `context.js`**

In `plugin/bin/lib/hooks/context.js`, add this function immediately before `function appendEvent(runDir, type, data, attribution) {` (around line 353) — ported as-is from `run-integrity.js`'s current `scanSkillEvents` (lines 122-136), same fail-open semantics, same return shape, only the name changes:

```javascript
// events.jsonl scan for skill_invoked / claude-tweaks:wrap-up events; missing
// file or unreadable -> null (indeterminate). Shared by run-integrity.js's
// checkRunIntegrity and close-run-state.js's closeRunState — the single
// reader for the paired appendEvent writer above (#380).
const WRAP_UP_SKILL = 'claude-tweaks:wrap-up';
function scanWrapupEvents(runDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'); } catch { return null; }
  let any = false;
  let wrapup = false;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.type !== 'skill_invoked') continue;
    any = true;
    if (ev.skill === WRAP_UP_SKILL) wrapup = true;
  }
  return { any, wrapup };
}
```

Then add `scanWrapupEvents` to the `module.exports` block at the bottom of the file (currently ends `findNonCanonicalRunDirs,\n};`):

```javascript
module.exports = {
  readStdin, parseInput, resolveRun, resolveRunDir, listRunDirs, listRunDirsWithState, iterRunDirsWithState,
  readRunState, writeRunState, appendEvent, scanWrapupEvents, findRunByWorktreePath, findRunsByWorktreePath, RUN_ID_RE, findNonCanonicalRunDirs,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-context.test.js`
Expected: PASS (all tests in the file, including the 5 new ones)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/context.js tests/hooks-context.test.js
git commit -m "Add shared scanWrapupEvents reader to context.js (refs #380)"
```

---

### Task 2: Point `run-integrity.js` at the shared reader

**Files:**
- Modify: `plugin/bin/lib/hooks/run-integrity.js` (remove local `scanSkillEvents`, lines 121-136; update its one call site at `checkRunIntegrity`, currently line 152; add `require('./context')`)
- Test: none new — `tests/run-integrity.test.js` already exercises `checkRunIntegrity`'s public behavior and must pass unmodified.

**Interfaces:**
- Consumes: `scanWrapupEvents(runDir)` from Task 1, imported as `ctxLib.scanWrapupEvents`.

- [ ] **Step 1: Add the require and delete the local function**

In `plugin/bin/lib/hooks/run-integrity.js`:

1. Add near the top, alongside the other `require`s (after `const { parseWorktreeList, resolveIntegrationBranch } = require('./worktree-reap');`):

```javascript
const ctxLib = require('./context');
```

2. Delete the entire local `scanSkillEvents` function (currently lines 121-136, including its leading comment `// events.jsonl scan; missing file or unreadable -> null (indeterminate).`) and its now-unused `WRAP_UP_SKILL` constant (line 26) — `context.js`'s own copy owns that constant now.

3. In `checkRunIntegrity`, replace the call `const events = scanSkillEvents(runDir);` (currently line 152) with:

```javascript
    const events = ctxLib.scanWrapupEvents(runDir);
```

Everything else in `checkRunIntegrity` (the `if (!events) return inProgress;` precondition, `evidence.ledgerActive = events.any;`, `evidence.wrapupInvoked = events.wrapup;`, the `if (!events.any) return inProgress;` pre-ledger precondition) is unchanged — same field names, same shape.

- [ ] **Step 2: Run the existing test suite for this file to verify nothing broke**

Run: `node --test tests/run-integrity.test.js`
Expected: PASS — every existing case (verdicts, `evidence.ledgerActive`/`evidence.wrapupInvoked`) unchanged.

- [ ] **Step 3: Grep to confirm no dangling reference**

Run: `grep -n scanSkillEvents plugin/bin/lib/hooks/run-integrity.js`
Expected: no output (function fully removed)

- [ ] **Step 4: Commit**

```bash
git add plugin/bin/lib/hooks/run-integrity.js
git commit -m "run-integrity.js: use context.js's shared scanWrapupEvents (refs #380)"
```

---

### Task 3: Point `close-run-state.js` at the shared reader

**Files:**
- Modify: `plugin/bin/lib/hooks/close-run-state.js` (replace inline loop at lines 36-46 with a call to `ctxLib.scanWrapupEvents`; `ctxLib` is already required at line 9 — no new require needed)
- Test: none new — `tests/teardown-gate.test.js`'s three AC6 cases already exercise this through the `close-run` CLI path and must pass unmodified.

**Interfaces:**
- Consumes: `scanWrapupEvents(runDir)` from Task 1, imported as `ctxLib.scanWrapupEvents` (already imported in this file as `const ctxLib = require('./context');`, line 9).

- [ ] **Step 1: Replace the inline loop**

In `plugin/bin/lib/hooks/close-run-state.js`, replace this block (currently lines 36-46):

```javascript
  let wrapupSeen = false;
  try {
    const rawEvents = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
    for (const line of rawEvents.split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev && ev.type === 'skill_invoked' && ev.skill === 'claude-tweaks:wrap-up') { wrapupSeen = true; break; }
      } catch { /* skip garbage line */ }
    }
  } catch { /* no events.jsonl — treated the same as no wrap-up event */ }
```

with:

```javascript
  const wrapupSeen = !!(ctxLib.scanWrapupEvents(runDir) || {}).wrapup;
```

The surrounding `try`/`catch` for "no events.jsonl" becomes unnecessary — `scanWrapupEvents` already fails open to `null` on that case (and any other unreadable-file case), and `(null || {}).wrapup` is `undefined`, coerced to `false` by `!!`.

After this change, `fs` and `path` may no longer be used elsewhere in this file — check before removing either import:

```bash
grep -n "fs\.\|path\." plugin/bin/lib/hooks/close-run-state.js
```

Remove the `const fs = require('fs');` / `const path = require('path');` lines only if that grep shows no remaining use of `fs.` or `path.` in the file.

- [ ] **Step 2: Run the AC6 tests to verify nothing broke**

Run: `node --test tests/teardown-gate.test.js`
Expected: PASS — all three AC6 cases (`close-run` with a non-wrapup event, with a wrapup event, and with no `events.jsonl` at all).

- [ ] **Step 3: Commit**

```bash
git add plugin/bin/lib/hooks/close-run-state.js
git commit -m "close-run-state.js: use context.js's shared scanWrapupEvents (refs #380)"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions anywhere in the repo.

- [ ] **Step 2: Confirm the single-reader acceptance criterion**

Run: `grep -rn "type !== 'skill_invoked'\|type === 'skill_invoked'" plugin/bin/lib/hooks/`
Expected: exactly one match, inside `context.js`'s `scanWrapupEvents` — proving `context.js` is now the only place in the plugin that scans `events.jsonl` for `skill_invoked`/`claude-tweaks:wrap-up` events.

- [ ] **Step 3: Confirm no circular require**

Run: `grep -n "require(" plugin/bin/lib/hooks/context.js`
Expected: no `require('./run-integrity')`, no `require('./close-run-state')`, no `require('../hooks')` — `context.js` gained no new dependency on either consumer.
