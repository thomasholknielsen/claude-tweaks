# subagent-stop.js contract-violation event attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `subagent-stop.js`'s `contract-violation` event from cross-contaminating concurrent pipeline runs by scoping it to `ctx.ownedRun` (a session's confirmed run identity) instead of `ctx.runDir` (which can be a cross-session fallback guess), mirroring the hardening `post-tool-use.js` already applies to its `commit` event — then audit the remaining `ctx.runDir`-gated `appendEvent` call sites in `pre-tool-use.js` for the same class of issue.

**Architecture:** One-function edit in `plugin/bin/lib/hooks/subagent-stop.js` (swap the gate and the `appendEvent` call to use `ctx.ownedRun`), plus documentation-only comments in `plugin/bin/lib/hooks/pre-tool-use.js` recording why its own `ctx.runDir`-gated `appendEvent` calls are a *different*, deliberately session-agnostic case that should NOT be converted. No plumbing changes: `bin/hooks.js`'s `runHook` already resolves and passes `ownedRun` into every hook module's `ctx`.

**Tech Stack:** Node.js (CommonJS), `node --test` for tests.

**Spec:** `work/1431-spec.md` (materialized from GitHub issue #1431)

## Global Constraints

- No plumbing/API changes — `ctx.ownedRun` is already populated on every hook module's `ctx` by `bin/hooks.js`'s `runHook` (line ~772-773). This is a same-file, same-function edit in `subagent-stop.js`.
- `appendEvent`'s fourth argument (`attribution`) is safe to pass unconditionally — `context.js`'s `appendEvent` (line ~494) only stamps an `attribution` field on the written event when the value is literally `'fallback'`.
- `subagent-stop.js` is documented as "best-effort by design" (file header, lines 1-8) — the fix must stay a no-op-on-uncertainty change (drop or tag, never block).
- `pre-tool-use.js`'s `ctx.runDir`-gated `appendEvent` calls (the bookkeeping-stamps gate's `stampCheckOutcome`, and the E1 working-directory loop) are OUT OF SCOPE for conversion — they are session-agnostic "run this worktree is currently assigned to" enforcement writes, not misattributed event logs. Document with a one-line comment per Acceptance Criterion 2; do not convert to `ownedRun`.

---

### Task 1: Harden subagent-stop.js's contract-violation event to ctx.ownedRun

**Files:**
- Modify: `plugin/bin/lib/hooks/subagent-stop.js:43-51` (the `run(ctx)` function)
- Test: `tests/hooks-log-modules.test.js` (subagent-stop coverage, currently lines ~76-146)

**Interfaces:**
- Consumes: `ctx.ownedRun` — `{ dir: string|null, attribution: 'env'|'session'|'fallback'|null }`, already populated by `bin/hooks.js`'s `runHook` on every hook module's `ctx` (no change needed there).
- Consumes: `ctxLib.appendEvent(runDir, type, data, attribution)` — existing signature in `plugin/bin/lib/hooks/context.js:494`, unchanged.
- Produces: `run(ctx)` still returns `{}` (no-op) or `{ json: { systemMessage: ... } }` — return shape unchanged, only the *gate* and the `appendEvent` call's first/fourth arguments change.

- [ ] **Step 1: Write the failing tests**

Open `tests/hooks-log-modules.test.js`. Every existing `substop.run(...)` call currently passes no `ownedRun` key — once Step 3 lands, those calls will silently no-op (since `ctx.ownedRun || {}` → `{}` → `.dir` is `undefined`), which would make the existing "flags violation" tests assert nothing. Update them, and add two new cases.

Replace the two tests at (current) lines 76-88:

```javascript
test('subagent-stop flags a missing status line as contract violation (warn, non-blocking)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  const ev = readEvents(run)[0];
  assert.strictEqual(ev.type, 'contract-violation');
  assert.strictEqual(ev.attribution, undefined, 'a session-owned run must NOT be tagged fallback');
});

test('subagent-stop accepts a compliant status line silently', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('DONE\nAll checks green.') }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

test('subagent-stop tags a fallback-attributed (guessed) run\'s contract-violation event as attribution: fallback, not silently trusted (#1431)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'fallback' }, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  const ev = readEvents(run)[0];
  assert.strictEqual(ev.type, 'contract-violation');
  assert.strictEqual(ev.attribution, 'fallback');
});

test('subagent-stop with no confirmed run ownership (ownedRun.dir unset) does not append to a run it does not own (#1431)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, ownedRun: { dir: null, attribution: null }, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});
```

Then update the remaining `substop.run(...)` calls later in the same file (the "checks the LAST assistant message" pair, the tool-call-only test, and the final "unreadable transcript or no run dir" test) to add `ownedRun: { dir: run, attribution: 'session' }` (or `ownedRun: { dir: null, attribution: null }` for the second assertion in the last test, which passes `runDir: null`):

```javascript
test('subagent-stop checks the LAST assistant message, not an earlier compliant one', () => {
  const run = mkRun();
  const t = multiTurnTranscript(['DONE\nfirst pass looked fine.', 'Actually let me also check this other thing.']);
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  assert.strictEqual(readEvents(run)[0].type, 'contract-violation');
});

test('subagent-stop checks the LAST assistant message, not an earlier non-compliant one', () => {
  const run = mkRun();
  const t = multiTurnTranscript(['still investigating', 'DONE\nAll checks green.']);
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});
```

```javascript
test('subagent-stop treats a tool-call-only LAST assistant turn as nothing to grade, not a fallback to an earlier text message (finding regression)', () => {
  const run = mkRun();
  const t = toolOnlyLastTurnTranscript();
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});
```

```javascript
test('subagent-stop with unreadable transcript or no run dir is a silent no-op', () => {
  const run = mkRun();
  assert.deepStrictEqual(substop.run({ input: { agent_transcript_path: '/nope.jsonl' }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' }), {});
  assert.deepStrictEqual(substop.run({ input: {}, runDir: null, runState: null, ownedRun: { dir: null, attribution: null }, cwd: '/x' }), {});
});
```

- [ ] **Step 2: Run the tests to verify the new/changed assertions fail against current code**

Run: `node --test tests/hooks-log-modules.test.js`
Expected: FAIL — the two new tests (fallback-attribution tagging, no-ownership no-op) fail because `subagent-stop.js` still gates on `ctx.runDir` and never reads `ctx.ownedRun`, so it appends unconditionally whenever `runDir` is set (the no-ownership case wrongly appends) and never stamps `attribution` (the fallback case has no `attribution` field).

- [ ] **Step 3: Implement the minimal fix**

In `plugin/bin/lib/hooks/subagent-stop.js`, replace:

```javascript
function run(ctx) {
  if (!ctx.runDir) return {};
  const transcriptPath = ctx.input.agent_transcript_path || ctx.input.transcript_path;
  if (typeof transcriptPath !== 'string' || !transcriptPath) return {};
  const text = lastAssistantText(transcriptPath);
  if (typeof text !== 'string') return {}; // unreadable -> best-effort no-op
  if (STATUS_RE.test(text.trim())) return {};
  ctxLib.appendEvent(ctx.runDir, 'contract-violation', { firstLine: text.trim().split('\n')[0].slice(0, 120) });
  return { json: { systemMessage: 'claude-tweaks: a subagent reply is missing the Subagent Contract status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED). Logged to events.jsonl.' } };
}
```

with:

```javascript
function run(ctx) {
  // Scoped to ctx.ownedRun (a session's confirmed identity), not ctx.runDir
  // (possibly a cross-session fallback guess) — mirrors post-tool-use.js's
  // commit-event hardening (#1431). A guessed run still gets the event, but
  // tagged `attribution: 'fallback'` via appendEvent's fourth argument so a
  // reader auditing events.jsonl can filter out lines that may belong to a
  // different, concurrent session's run rather than trusting them silently.
  const ownedRun = ctx.ownedRun || {};
  if (!ownedRun.dir) return {};
  const transcriptPath = ctx.input.agent_transcript_path || ctx.input.transcript_path;
  if (typeof transcriptPath !== 'string' || !transcriptPath) return {};
  const text = lastAssistantText(transcriptPath);
  if (typeof text !== 'string') return {}; // unreadable -> best-effort no-op
  if (STATUS_RE.test(text.trim())) return {};
  ctxLib.appendEvent(ownedRun.dir, 'contract-violation', { firstLine: text.trim().split('\n')[0].slice(0, 120) }, ownedRun.attribution);
  return { json: { systemMessage: 'claude-tweaks: a subagent reply is missing the Subagent Contract status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED). Logged to events.jsonl.' } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-log-modules.test.js`
Expected: PASS (all subtests, including `post-tool-use` coverage in the same file, which is unaffected by this change)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/subagent-stop.js tests/hooks-log-modules.test.js
git commit -m "Scope subagent-stop.js's contract-violation event to ctx.ownedRun, tag fallback attribution (#1431)"
```

---

### Task 2: Audit pre-tool-use.js's ctx.runDir-gated appendEvent call sites

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js` (comments only — no logic change)
  - `stampCheckOutcome` function (currently around lines 881-894)
  - The E1 working-directory loop inside `runInner` (currently around lines 1138-1195, the `for (const target of commandGitTargets || [])` loop)

**Interfaces:**
- Consumes: nothing new — this task adds comments only, no code behavior changes.
- Produces: nothing new — existing test suites (`tests/hooks-pre-tool-use.test.js`, `tests/hooks-bookkeeping-stamps-gate.test.js`, `tests/teardown-gate.test.js`, `tests/hooks-teardown-run.test.js`, `tests/build-worktree-setup-dispatch-stamp.test.js`) must show byte-identical pass/fail results before and after this task, since nothing here changes runtime behavior.

This task has no red/green test cycle of its own (comment-only change) — instead, verify via a before/after diff and a full re-run of the affected suites.

- [ ] **Step 1: Confirm current test baseline (before any edit)**

Run: `node --test tests/hooks-pre-tool-use.test.js tests/hooks-bookkeeping-stamps-gate.test.js tests/teardown-gate.test.js tests/hooks-teardown-run.test.js tests/build-worktree-setup-dispatch-stamp.test.js`
Expected: PASS — record the exact `# tests`/`# pass`/`# fail` summary line to compare against after Step 2.

- [ ] **Step 2: Add the audit comments**

In `plugin/bin/lib/hooks/pre-tool-use.js`, immediately above the `stampCheckOutcome` function (currently just above its existing header comment block that starts "Shared outcome for both stamp checks..."), add:

```javascript
// #1431 audit: both appendEvent calls below deliberately stay on ctx.runDir,
// not ctx.ownedRun — this gate enforces against "the run this worktree is
// currently assigned to" (a session-agnostic fact), and the event IS that
// enforcement outcome (this assigned run got a stamp warning/deny), not a
// guess about which run some session's activity belongs to. Switching to
// ownedRun would drop the event entirely for the exact bystander-session
// case (isForeign) this is meant to capture. Matches the wd-foreign-teardown
// precedent above (checkTeardownGate: "event to the TARGET run's dir —
// enforcement-target, not ownedRun").
```

placed directly above the existing `function stampCheckOutcome(ctx, stamp, wtRoot, warnings, warnText, denyText, isForeign) {` line's existing header comment block (i.e. the new comment becomes part of that same header, not a second separate block).

Then, immediately before the E1 working-directory loop's `for (const target of commandGitTargets || [])` line (right after the `const mainRoot = safeReal(wtDetect.mainCheckoutRoot(assigned));` line that precedes it), add:

```javascript
// #1431 audit: the four appendEvent(ctx.runDir, ...) calls in this loop
// (wd-ambiguous, wd-push-mismatch, wd-foreign-session, wd-deny) all stay on
// ctx.runDir by design, not ctx.ownedRun — this whole loop is E1's
// enforcement of "does this command target the worktree THIS run
// (ctx.runDir) is assigned to," a session-agnostic comparison per this
// file's header, and each event records that enforcement outcome against
// the run being enforced, not a guess about which run the caller's own
// activity belongs to. A caller with no owned run at all (or an unrelated
// one) can still legitimately trip this gate against someone else's
// assigned run — ownedRun would silently drop or misfile those events.
```

- [ ] **Step 3: Verify the edit is comment-only**

Run: `node -c plugin/bin/lib/hooks/pre-tool-use.js`
Expected: no syntax error (exits 0, no output)

Run: `git diff plugin/bin/lib/hooks/pre-tool-use.js`
Expected: every changed/added line starts with `//` (a comment) or is blank — no non-comment line differs from the pre-edit version.

- [ ] **Step 4: Re-run the same suites and confirm identical pass/fail counts**

Run: `node --test tests/hooks-pre-tool-use.test.js tests/hooks-bookkeeping-stamps-gate.test.js tests/teardown-gate.test.js tests/hooks-teardown-run.test.js tests/build-worktree-setup-dispatch-stamp.test.js`
Expected: PASS, with the identical `# tests`/`# pass`/`# fail` summary line recorded in Step 1 — confirms the comment-only change introduced zero behavior change.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js
git commit -m "Document why pre-tool-use.js's wd-* appendEvent calls stay on ctx.runDir, not ctx.ownedRun (#1431)"
```

---

## Self-Review Notes (from plan authoring)

- **Spec coverage:** Deliverable 1 (subagent-stop.js hardening) → Task 1. Deliverable 2 (audit pre-tool-use.js call sites) → Task 2. Acceptance Criterion 1 (fallback-attributed run either tags or doesn't append) → Task 1's two new tests. Acceptance Criterion 2 (each pre-tool-use.js site individually resolved, hardened or commented) → Task 2 (all six identified sites are resolved as "leave as ctx.runDir with a comment," since all six turned out to be the session-agnostic enforcement case, not the event-attribution case). Acceptance Criterion 3 (`tests/hooks-log-modules.test.js` extended with a fallback-attribution case, continues to pass) → Task 1 Steps 1-4.
- **Out of scope, explicitly:** `close-run-state.js`'s `close-without-wrapup` event (spec's own Technical Approach section marks this out of scope — different call path, explicit `--run` or newest-non-terminal fallback).
- **No placeholders:** every step above shows the actual diff/code, not a description of one.
