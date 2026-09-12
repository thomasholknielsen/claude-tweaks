# Friction Friction-Lens contract-violation dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Friction Lens from surfacing a `contract-violation` per intermediate SubagentStop firing during a multi-turn async-wait dispatch — collapse them to at most one, re-verified against the dispatch's true final reply.

**Architecture:** `bin/lib/hooks/subagent-stop.js` keeps logging every SubagentStop firing exactly as it does today (write-time detection cannot know whether a given firing is truly final — removing that detection loses real signal and would revert the `#1329` regression guard). Instead, tag each logged event with the `agent_transcript_path` it was read from, and move deduplication to the read side: `bin/friction-events.js` — the sanctioned aggregation point the Friction Lens actually consumes (`skills/reflect/full-mode.md`'s Input section) — groups `contract-violation` events by `transcriptPath` and re-checks each group's transcript file fresh, at read time, when the file has had a chance to accumulate the dispatch's real final turn. A transcript that now shows a compliant status line means every event in that group was interim narration — drop the group. A transcript still non-compliant collapses the group to one event. This mirrors two filters `friction-events.js` already applies at the aggregation layer (`#1337`'s test-tagged gate-denial drop, `#1402`'s fallback-attribution drop) rather than inventing a new mechanism.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** Record #2041 (materialized at `.claude-tweaks/pipelines/2026-09-12T125233-record-2041/work/2041-spec.md`)

## Global Constraints

- Never remove or weaken the existing `#1329` regression-guard test (`tests/hooks-log-modules.test.js`, "subagent-stop still flags genuine prose-only LAST turn with no tool call as a contract violation") — a genuinely malformed final reply must still be flagged. This plan changes only where the corresponding intermediate-turn *duplicates* get filtered (the read side), never the write-time detection itself.
- Backward compatibility: an already-written `contract-violation` event with no `transcriptPath` field (logged before this change ships) must pass through `friction-events.js` unchanged — never dropped, never crash the read path.
- Follow the existing `run(argv, deps)` injectable-runner seam in `bin/friction-events.js` (per `gh-api-module-pattern`) — the new transcript re-check goes through `deps`, never a bare `fs` call inline in `run()`, so tests never touch the real filesystem for this new logic.

---

### Task 1: Tag the logged event with its transcript path, and export the reusable compliance check

**Files:**
- Modify: `plugin/bin/lib/hooks/subagent-stop.js:106-121`
- Test: `tests/hooks-log-modules.test.js`

**Interfaces:**
- Consumes: nothing new — reuses this file's own existing `transcriptPath` local variable (already computed at line 110) and `STATUS_RE` (already defined at line 29).
- Produces: `module.exports.lastAssistantText(transcriptPath) -> string|null` and `module.exports.STATUS_RE` (both already-existing internals, now exported for reuse by Task 2's `friction-events.js` change). The logged `contract-violation` event gains a `transcriptPath: string` field alongside its existing `firstLine` field.

- [ ] **Step 1: Write the failing test — event carries `transcriptPath`**

Add this test to `tests/hooks-log-modules.test.js`, immediately after the existing test `'subagent-stop flags a missing status line as contract violation (warn, non-blocking)'` (around line 81):

```javascript
test('subagent-stop tags the logged contract-violation event with the transcript path it was read from', () => {
  const run = mkRun();
  const t = transcript('I did some things.');
  substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.strictEqual(readEvents(run)[0].transcriptPath, t);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-log-modules.test.js`
Expected: FAIL — `readEvents(run)[0].transcriptPath` is `undefined`, not the transcript path.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/hooks/subagent-stop.js`, change the `appendEvent` call (currently line 116) from:

```javascript
  ctxLib.appendEvent(ownedRun.dir, 'contract-violation', { firstLine: trimmedText.split('\n')[0].slice(0, 120) }, ownedRun.attribution);
```

to:

```javascript
  ctxLib.appendEvent(ownedRun.dir, 'contract-violation', { firstLine: trimmedText.split('\n')[0].slice(0, 120), transcriptPath }, ownedRun.attribution);
```

Then change the final export line (currently line 120):

```javascript
module.exports = { run, isExemptAgentType };
```

to:

```javascript
module.exports = { run, isExemptAgentType, lastAssistantText, STATUS_RE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks-log-modules.test.js`
Expected: PASS — all existing subagent-stop tests in this file continue to pass unchanged (they assert only `.type`/`.systemMessage`, never the full event shape), plus the new test from Step 1.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/subagent-stop.js tests/hooks-log-modules.test.js
git commit -m "Tag logged contract-violation events with their transcript path, export lastAssistantText/STATUS_RE"
```

---

### Task 2: Dedupe contract-violation events at the friction-events.js aggregation layer

**Files:**
- Modify: `plugin/bin/friction-events.js:1-135`
- Test: `tests/friction-events-cli.test.js`

**Interfaces:**
- Consumes: `substop.lastAssistantText(transcriptPath) -> string|null` and `substop.STATUS_RE` from Task 1's export (`require('./lib/hooks/subagent-stop')`).
- Produces: `dedupeContractViolations(events, deps) -> events` (new internal helper, exported alongside the existing `run, parseArgs, readEvents, FRICTION_EVENT_TYPES` for direct unit testing). `realDeps` gains `readTranscriptText: substop.lastAssistantText`. `run()`'s friction-filtering line now pipes its output through `dedupeContractViolations`.

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/friction-events-cli.test.js`, after the existing `'#2016: a run dir whose events.jsonl holds only commit rows prints []'` test (end of file). First, extend `fakeDeps` (top of file) to include a default `readTranscriptText` stub so existing tests (which never set it) keep working unchanged:

```javascript
function fakeDeps(overrides = {}) {
  const calls = { findRunsByWorktreePath: [], stdout: [], stderr: [] };
  return {
    calls,
    isDirectory: () => true,
    cwd: () => '/wt/current',
    readEvents: (runDir, source) => (runDir === '/run/primary' ? [{ type: 'gate-denial', ts: 't1', _tag: 'primary-fixture' }] : []),
    findRunsByWorktreePath: (cwd, target, excludeDir) => { calls.findRunsByWorktreePath.push({ cwd, target, excludeDir }); return []; },
    readTranscriptText: () => null,
    stdout: (s) => calls.stdout.push(s),
    stderr: (s) => calls.stderr.push(s),
    ...overrides,
  };
}
```

(This replaces the existing `fakeDeps` definition at the top of the file — same body, plus the new `readTranscriptText: () => null` default line.)

Then add:

```javascript
// --- contract-violation dedup (record #2041) --------------------------------
//
// A dispatched agent that itself waits on nested background work re-fires
// SubagentStop once per "still waiting" narration turn, each one logged as its
// own contract-violation event sharing the SAME transcriptPath (Task 1). The
// Friction Lens reads this file's output, not events.jsonl directly, so
// dedup belongs here — re-check each transcriptPath's CURRENT last-assistant
// text (by read time the dispatch has usually produced its real final reply)
// rather than trusting the write-time snapshot.

test('#2041: a transcriptPath group that is now compliant drops every event for that transcript', () => {
  const deps = fakeDeps({
    readEvents: (runDir) => (runDir === '/run/primary' ? [
      { type: 'contract-violation', ts: 't1', firstLine: 'Still waiting on 3 of 5...', transcriptPath: '/tmp/agent-a.jsonl' },
      { type: 'contract-violation', ts: 't2', firstLine: 'Still waiting on 1 of 5...', transcriptPath: '/tmp/agent-a.jsonl' },
    ] : []),
    readTranscriptText: (p) => (p === '/tmp/agent-a.jsonl' ? 'DONE\nAll checks green.' : null),
  });
  const code = run(['--run', '/run/primary'], deps);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), []);
});

test('#2041: a transcriptPath group still non-compliant collapses to one event with a refreshed firstLine', () => {
  const deps = fakeDeps({
    readEvents: (runDir) => (runDir === '/run/primary' ? [
      { type: 'contract-violation', ts: 't1', firstLine: 'Still waiting on 3 of 5...', transcriptPath: '/tmp/agent-b.jsonl' },
      { type: 'contract-violation', ts: 't2', firstLine: 'Still waiting on 1 of 5...', transcriptPath: '/tmp/agent-b.jsonl' },
      { type: 'contract-violation', ts: 't3', firstLine: 'I think I finished most of it.', transcriptPath: '/tmp/agent-b.jsonl' },
    ] : []),
    readTranscriptText: (p) => (p === '/tmp/agent-b.jsonl' ? 'I think I finished most of it.' : null),
  });
  const code = run(['--run', '/run/primary'], deps);
  assert.equal(code, 0);
  const out = JSON.parse(deps.calls.stdout[0]);
  assert.equal(out.length, 1);
  assert.equal(out[0].ts, 't1', 'keeps the earliest event as the carrier');
  assert.equal(out[0].firstLine, 'I think I finished most of it.');
});

test('#2041: an event with no transcriptPath (pre-fix legacy log line) passes through unchanged', () => {
  const deps = fakeDeps({
    readEvents: (runDir) => (runDir === '/run/primary' ? [
      { type: 'contract-violation', ts: 't1', firstLine: 'I did some things.' },
    ] : []),
    readTranscriptText: () => { throw new Error('must not be called for an event with no transcriptPath'); },
  });
  const code = run(['--run', '/run/primary'], deps);
  assert.equal(code, 0);
  const out = JSON.parse(deps.calls.stdout[0]);
  assert.equal(out.length, 1);
  assert.equal(out[0].firstLine, 'I did some things.');
});

test('#2041: an unreadable transcript (file gone by read time) fails open — keeps every event in the group unchanged', () => {
  const deps = fakeDeps({
    readEvents: (runDir) => (runDir === '/run/primary' ? [
      { type: 'contract-violation', ts: 't1', firstLine: 'Still waiting on 3 of 5...', transcriptPath: '/tmp/gone.jsonl' },
      { type: 'contract-violation', ts: 't2', firstLine: 'Still waiting on 1 of 5...', transcriptPath: '/tmp/gone.jsonl' },
    ] : []),
    readTranscriptText: () => null,
  });
  const code = run(['--run', '/run/primary'], deps);
  assert.equal(code, 0);
  const out = JSON.parse(deps.calls.stdout[0]);
  assert.equal(out.length, 2, 'never lose evidence when the transcript cannot be re-verified');
  assert.deepEqual(out.map((e) => e.ts), ['t1', 't2']);
});

test('#2041: a single-fire transcriptPath group still non-compliant is kept, with firstLine refreshed to the current read', () => {
  const deps = fakeDeps({
    readEvents: (runDir) => (runDir === '/run/primary' ? [
      { type: 'contract-violation', ts: 't1', firstLine: 'stale snapshot text', transcriptPath: '/tmp/agent-c.jsonl' },
    ] : []),
    readTranscriptText: (p) => (p === '/tmp/agent-c.jsonl' ? 'current final malformed text' : null),
  });
  const code = run(['--run', '/run/primary'], deps);
  assert.equal(code, 0);
  const out = JSON.parse(deps.calls.stdout[0]);
  assert.equal(out.length, 1);
  assert.equal(out[0].firstLine, 'current final malformed text');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/friction-events-cli.test.js`
Expected: FAIL on all five new `#2041` tests — `dedupeContractViolations` does not exist yet, so `contract-violation` events currently pass straight through un-deduped (the first test would see 2 events instead of `[]`; the others would see un-collapsed/un-refreshed output or a thrown error propagating from the `readTranscriptText` stub being called when it shouldn't be).

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/friction-events.js`, add the `subagent-stop` require near the top (after the existing `ctxLib`/`FRICTION_EVENT_TYPES` requires, currently lines 42-43):

```javascript
const substop = require('./lib/hooks/subagent-stop');
```

Add the new helper function after `readEvents` (currently ends at line 99), before `const realDeps = {`:

```javascript
// #2041: a dispatched agent that itself orchestrates nested background work
// re-fires SubagentStop once per "still waiting" narration turn, each one
// logged (subagent-stop.js) as its own contract-violation event sharing the
// same transcriptPath. By the time this aggregation layer runs, the
// transcript has usually had a chance to accumulate the dispatch's real
// final reply — re-check it fresh here rather than trusting the write-time
// snapshot. Grouped by transcriptPath; an event with no transcriptPath
// (logged before this field existed) is left untouched. An unreadable
// transcript (deleted, moved) fails open — never drop evidence we can't
// re-verify.
function dedupeContractViolations(events, deps) {
  const groups = new Map();
  events.forEach((e, i) => {
    if (e.type === 'contract-violation' && typeof e.transcriptPath === 'string' && e.transcriptPath) {
      if (!groups.has(e.transcriptPath)) groups.set(e.transcriptPath, []);
      groups.get(e.transcriptPath).push(i);
    }
  });
  const drop = new Set();
  const refreshed = new Map();
  for (const [transcriptPath, indices] of groups) {
    let text;
    try { text = deps.readTranscriptText(transcriptPath); } catch { text = undefined; }
    if (typeof text !== 'string') continue; // unreadable -> fail open, keep as logged
    const trimmed = text.trim();
    if (substop.STATUS_RE.test(trimmed)) {
      indices.forEach((i) => drop.add(i));
      continue;
    }
    const [keep, ...rest] = indices;
    rest.forEach((i) => drop.add(i));
    refreshed.set(keep, trimmed.split('\n')[0].slice(0, 120));
  }
  return events
    .map((e, i) => (refreshed.has(i) ? { ...e, firstLine: refreshed.get(i) } : e))
    .filter((_, i) => !drop.has(i));
}
```

Add `readTranscriptText: substop.lastAssistantText,` to `realDeps` (currently lines 101-108), e.g. immediately after the `readEvents,` line.

Change `run()`'s friction-filtering line (currently `const friction = events.filter((e) => FRICTION_TYPES.has(e.type));`) to:

```javascript
  const friction = dedupeContractViolations(events.filter((e) => FRICTION_TYPES.has(e.type)), deps);
```

Finally, update the module export line (currently `module.exports = { run, parseArgs, readEvents, FRICTION_EVENT_TYPES };`) to:

```javascript
module.exports = { run, parseArgs, readEvents, FRICTION_EVENT_TYPES, dedupeContractViolations };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/friction-events-cli.test.js`
Expected: PASS — all five new `#2041` tests, plus every pre-existing test in this file (none of them set `transcriptPath` on their fixtures, so `dedupeContractViolations` finds no groups to touch and passes every event through unchanged).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/friction-events.js tests/friction-events-cli.test.js
git commit -m "Dedupe contract-violation events by transcript path at the friction-events.js aggregation layer"
```

---

## Out of scope (verified during planning, not a gap left behind)

- **No change to `bin/lib/hooks/subagent-stop.js`'s write-time detection logic itself.** The record's Deliverables offered "investigate scoping to the terminal reply, OR document the false-positive pattern more prominently" as alternatives. Investigation found no reliable write-time signal distinguishing an intermediate "waiting" narration turn from a genuinely malformed final reply — both are, by construction, text-only turns with no tool call at the moment SubagentStop fires. `tests/hooks-log-modules.test.js`'s existing regression-guard test (`'subagent-stop still flags genuine prose-only LAST turn with no tool call as a contract violation (#1329 regression guard)'`) locks in exactly this ambiguity as intentional: a write-time suppression broad enough to cover the async-wait case would also suppress real malformed-final-reply violations, undoing `#1329`'s fix. Moving the fix to the read side (this plan) achieves the record's actual Acceptance Criteria — a dispatch using the async-wait pattern no longer *surfaces* a contract-violation for its intermediate turns, only for a real malformed final reply — without weakening detection or reverting a pinned regression guard.
- **The record's own citations do not fully hold up and are not restated as fact in this plan's rationale.** `_shared/subagent-output-contract.md` contains no "async dispatch guidance" section documenting a fixed wording for intermediate wait narration (verified by grep — no match for "async" anywhere in that file); the actual documented false-positive case (line 111) is a **background-job-orchestrated session's own interim narration**, which is the same category of misfire but not textually "documented" the way the record's Current State implies. This plan's design is grounded in the real code (`subagent-stop.js`, its tests) and the real doc line found, not in the record's unverified citations.
