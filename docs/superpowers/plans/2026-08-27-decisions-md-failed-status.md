# decisions.md FAILED status vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document `FAILED` as a recognized `decisions.md` status and make both readers that currently miss it (`decisions-classifier.js`'s `KIND_RE` and the wrap-up console's Empty-console fast-path condition) count it correctly.

**Architecture:** `FAILED` lines are already emitted by two existing hand-composed writers (`refine-mode.md` Step 5, `apply-refine-labels.js`'s catch block) but are absent from the documented STATUS vocabulary table and from two readers: `decisions-classifier.js`'s `KIND_RE` (feeds `aggregate.js`'s calibration buckets) and the wrap-up Empty-console fast-path's `DECISION_BEARING_STATUSES` list (mirrored in `review-console.md`'s and `multispec-review-console.md`'s prose). This plan adds `FAILED` to the regex, adds a `failedCount` bucket to `aggregate.js`/`calibration-report.js` (named, not silent `'other'`), extends the fast-path's decision-bearing set, and documents the vocabulary — including the explicit decision to keep `append.js`'s `STATUSES` enum unchanged (hand-composition stays the pattern for `FAILED`, per #1072's review finding that extending the enum would touch multiple consumers).

**Tech Stack:** Node.js (`node --test`), no external dependencies.

**Spec:** `work/1407-spec.md` (materialized from GitHub issue #1407) — this plan implements its Deliverables and Acceptance Criteria; read both together.

## Global Constraints

- Test runner: `node --test` — every new/changed assertion must be added to an existing `node --test` suite (no new test framework).
- `plugin/skills/_shared/auto-decision-log.md` is at 16,055 bytes against a 40 KB (40,960 byte) ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) — Task 5's addition (~500 bytes) leaves 24 KB+ of headroom; no split needed.
- Do not change `plugin/bin/lib/log-decision/append.js`'s `STATUSES` array or `formatEntry` — `tests/bin-lib/log-decision/append.test.js` pins `STATUSES` to `['AUTO', 'STAGED', 'KEPT-PROMPT', 'SCANNED', 'REFUSED']` and this plan deliberately keeps `FAILED` hand-composed (see Task 5).
- Commit after each task.

---

### Task 1: Recognize FAILED in decisions-classifier.js's KIND_RE

**Files:**
- Modify: `plugin/bin/lib/calibration/decisions-classifier.js`
- Test: `tests/bin-lib/calibration/readers.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `classifyDecisionLine(line).kind` now returns `'FAILED'` for a line matching `/^-\s+FAILED\b/`. `aggregate.js` (Task 2) relies on this.

- [ ] **Step 1: Write the failing test**

Add to `tests/bin-lib/calibration/readers.test.js`, inside the existing `test('classifyDecisionLine recognizes every entry kind and the terminal-decision line', ...)` block, immediately after the existing `SCANNED` assertion (currently the line `assert.strictEqual(classifyDecisionLine('- SCANNED 09:00:00 — Step 4.5 scan complete, 0 findings.').kind, 'SCANNED');`):

```javascript
  assert.strictEqual(classifyDecisionLine('- FAILED 09:00:00 — apply-refine-labels: priority write failed on #42: HTTP 500.').kind, 'FAILED');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/calibration/readers.test.js`
Expected: FAIL — `classifyDecisionLine(...).kind` is `'other'`, not `'FAILED'`.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/calibration/decisions-classifier.js`, change:

```javascript
const KIND_RE = /^-\s+(AUTO|STAGED|KEPT-PROMPT|REFUSED|SCANNED)\b/;
```

to:

```javascript
const KIND_RE = /^-\s+(AUTO|STAGED|KEPT-PROMPT|REFUSED|SCANNED|FAILED)\b/;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/calibration/readers.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/calibration/decisions-classifier.js tests/bin-lib/calibration/readers.test.js
git commit -m "Recognize FAILED in decisions-classifier.js's KIND_RE

refs #1407"
```

---

### Task 2: Add a failedCount bucket to aggregate.js

**Files:**
- Modify: `plugin/bin/lib/calibration/aggregate.js`
- Test: `tests/bin-lib/calibration/aggregate.test.js`

**Interfaces:**
- Consumes: `classifyDecisionLine(line).kind === 'FAILED'` (Task 1).
- Produces: `aggregate(...)`'s return object gains a `failedCount` field (integer, same shape as the existing `refusedCount`). `calibration-report.js` (Task 3) reads this field.

- [ ] **Step 1: Write the failing test**

Add to `tests/bin-lib/calibration/aggregate.test.js`, after the existing `test('aggregate: console distribution counts terminal decisions and buckets unlogged runs', ...)` block:

```javascript
test('aggregate: failedCount counts FAILED lines across the window, starting at 0', () => {
  const clean = aggregate({ tsv: { rows: [] }, runs: makeRuns(2), rowIds: [], windowN: 20 });
  assert.strictEqual(clean.failedCount, 0);

  const runs = makeRuns(2);
  runs.push({
    runId: '2026-08-05T000000-run',
    decisionLines: [
      '- FAILED 09:00:00 — apply-refine-labels: priority write failed on #42: HTTP 500.',
      '- FAILED 09:00:05 — apply-refine-labels: grant write failed on #43: HTTP 500.',
    ],
    events: { counts: {} },
  });
  const withFailures = aggregate({ tsv: { rows: [] }, runs, rowIds: [], windowN: 20 });
  assert.strictEqual(withFailures.failedCount, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/calibration/aggregate.test.js`
Expected: FAIL — `withFailures.failedCount` is `undefined`, not `2`.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/calibration/aggregate.js`:

1. Add `let failedCount = 0;` alongside the existing `let refusedCount = 0;` declaration:

```javascript
  let refusedCount = 0;
  let failedCount = 0;
  let consoleStops = 0;
```

2. Add a branch alongside the existing `REFUSED` check inside the `for (const line of run.decisionLines || [])` loop:

```javascript
      if (c.kind === 'REFUSED') refusedCount++;
      if (c.kind === 'FAILED') failedCount++;
```

3. Add `failedCount` to the returned object, next to `refusedCount`:

```javascript
    refusedCount,
    failedCount,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/calibration/aggregate.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/calibration/aggregate.js tests/bin-lib/calibration/aggregate.test.js
git commit -m "Add failedCount bucket to aggregate.js's calibration output

refs #1407"
```

---

### Task 3: Render failedCount in calibration-report.js's text and JSON output

**Files:**
- Modify: `plugin/bin/calibration-report.js`
- Test: `tests/bin-lib/calibration/cli.test.js`

**Interfaces:**
- Consumes: `aggregate(...)`'s `failedCount` field (Task 2).
- Produces: `renderText(result, ceiling)`'s text output gains a `### Failed writes: N` section; `--json` output already includes `failedCount` via the passthrough `JSON.stringify(result)` (no separate wiring needed for JSON).

- [ ] **Step 1: Write the failing test**

Add to `tests/bin-lib/calibration/cli.test.js`, after the existing `test('CLI --json round-trips the same numbers as the text report', ...)` block:

```javascript
test('CLI renders a named Failed writes bucket, not silent other', () => {
  const root = makeFixtureRoot();
  const dir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', 'run-1');
  fs.writeFileSync(
    path.join(dir, 'decisions.md'),
    '- AUTO 12:00:00 — Review Console: terminal decision approve-all. Reversibility: n/a.\n' +
    '- FAILED 09:00:00 — apply-refine-labels: priority write failed on #42: HTTP 500.\n',
  );
  const jsonOut = JSON.parse(run(['--json'], root));
  const textOut = run([], root);
  assert.strictEqual(jsonOut.failedCount, 1);
  assert.match(textOut, /Failed writes: 1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/calibration/cli.test.js`
Expected: FAIL — `textOut` does not match `/Failed writes: 1/` (no such section rendered); `jsonOut.failedCount` is `1` already (passthrough), so only the text-output assertion fails.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/calibration-report.js`'s `renderText` function, add a new section immediately after the existing `### Refused proposals: {n}` block:

```javascript
  lines.push(`### Refused proposals: ${result.refusedCount}`);
  lines.push('');
  lines.push(`### Failed writes: ${result.failedCount}`);
  lines.push('');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/calibration/cli.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/calibration-report.js tests/bin-lib/calibration/cli.test.js
git commit -m "Render failedCount as a named Failed writes section in calibration-report.js

refs #1407"
```

---

### Task 4: Treat FAILED as decision-bearing in the wrap-up console's Empty-console fast path

**Files:**
- Modify: `plugin/skills/wrap-up/review-console.md`
- Modify: `plugin/skills/flow/multispec-review-console.md`
- Test: `tests/wrap-up-console-fast-path-scanned-exclusion.test.js`

**Interfaces:**
- Consumes: nothing new (prose + a hand-rolled mirror classifier already local to the test file).
- Produces: the test file's `DECISION_BEARING_STATUSES` array gains `'FAILED'`; `review-console.md`'s and `multispec-review-console.md`'s prose gain `FAILED` in their enumerated decision-bearing list — this is a prose-and-mirror change, not a change to `_shared/auto-decision-log.md`'s reader (that STATUS documentation itself is Task 5).

- [ ] **Step 1: Write the failing test**

Add to `tests/wrap-up-console-fast-path-scanned-exclusion.test.js`, after the existing `test('fixture: a decisions.md with SCANNED plus a real AUTO finding still has a decision-bearing entry (fast path does not fire)', ...)` block:

```javascript
test('fixture: a decisions.md holding only a FAILED line has a decision-bearing entry (fast path does not fire)', () => {
  const decisionsMd = [
    '# Auto-Decision Log — pipeline 2026-08-27T070037-record-1407',
    '',
    '## /backlog',
    '- FAILED 09:00:00 — apply-refine-labels: priority write failed on #42: HTTP 500.',
  ].join('\n');
  assert.equal(hasDecisionBearingEntry(decisionsMd), true, 'a log carrying only a FAILED line must read as decision-bearing');
});

test('review-console.md and multispec-review-console.md name FAILED in the decision-bearing list', () => {
  assert.match(REVIEW_CONSOLE, /`AUTO` \/ `STAGED` \/ `KEPT-PROMPT` \/ `REFUSED` \/ `FAILED`/);
  assert.match(MULTISPEC_CONSOLE, /`AUTO`\/`STAGED`\/`KEPT-PROMPT`\/`REFUSED`\/`FAILED`/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wrap-up-console-fast-path-scanned-exclusion.test.js`
Expected: FAIL — the first new test fails because `DECISION_BEARING_STATUSES` (still `['AUTO', 'STAGED', 'KEPT-PROMPT', 'REFUSED']`) doesn't include `FAILED`, so `hasDecisionBearingEntry` returns `false`; the second new test fails because neither file's prose names `FAILED` yet.

- [ ] **Step 3: Write minimal implementation**

1. In `tests/wrap-up-console-fast-path-scanned-exclusion.test.js`, change:

```javascript
const DECISION_BEARING_STATUSES = ['AUTO', 'STAGED', 'KEPT-PROMPT', 'REFUSED'];
```

to:

```javascript
const DECISION_BEARING_STATUSES = ['AUTO', 'STAGED', 'KEPT-PROMPT', 'REFUSED', 'FAILED'];
```

2. In `plugin/skills/wrap-up/review-console.md`, in the `## Empty-console fast path` section, change:

```
If `decisions.md` holds no decision-bearing entries (`AUTO` / `STAGED` / `KEPT-PROMPT` / `REFUSED` — `SCANNED` audit lines are excluded, see below) AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes, memory updates, or upstream feedback proposals are pending, skip the console entirely.
```

to:

```
If `decisions.md` holds no decision-bearing entries (`AUTO` / `STAGED` / `KEPT-PROMPT` / `REFUSED` / `FAILED` — `SCANNED` audit lines are excluded, see below) AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes, memory updates, or upstream feedback proposals are pending, skip the console entirely.
```

3. In `plugin/skills/flow/multispec-review-console.md`, change:

```
If every per-spec `decisions.md` passes `wrap-up/review-console.md`'s Empty-console fast path decision-bearing-entries test (no `AUTO`/`STAGED`/`KEPT-PROMPT`/`REFUSED` entries — that file's `SCANNED`-exclusion rule applies per spec, cited rather than restated here)
```

to:

```
If every per-spec `decisions.md` passes `wrap-up/review-console.md`'s Empty-console fast path decision-bearing-entries test (no `AUTO`/`STAGED`/`KEPT-PROMPT`/`REFUSED`/`FAILED` entries — that file's `SCANNED`-exclusion rule applies per spec, cited rather than restated here)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/wrap-up-console-fast-path-scanned-exclusion.test.js`
Expected: PASS (all tests in the file, including the pre-existing ones — the pre-existing `assert.match(REVIEW_CONSOLE, /`AUTO` \/ `STAGED` \/ `KEPT-PROMPT` \/ `REFUSED`/);` regex still matches, since it's a substring match and the edited line still contains that exact substring followed by `/ \`FAILED\``).

- [ ] **Step 5: Commit**

```bash
git add tests/wrap-up-console-fast-path-scanned-exclusion.test.js plugin/skills/wrap-up/review-console.md plugin/skills/flow/multispec-review-console.md
git commit -m "Treat FAILED as decision-bearing in the wrap-up console's Empty-console fast path

refs #1407"
```

---

### Task 5: Document FAILED in auto-decision-log.md's STATUS vocabulary table

**Files:**
- Modify: `plugin/skills/_shared/auto-decision-log.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed elsewhere — this is the canonical vocabulary reference readers cite.

This task has no code path to TDD against — it's a documentation-only change pinned by the size-headroom constraint already checked in Global Constraints. No new test is added; the existing `tests/bin-lib/skill-audit/context-cost.test.js` (already in the suite) re-verifies the ceiling isn't crossed.

- [ ] **Step 1: Measure current size**

Run: `wc -c plugin/skills/_shared/auto-decision-log.md`
Expected: `16055` (confirms the pre-edit baseline recorded in Global Constraints hasn't drifted).

- [ ] **Step 2: Edit the STATUS table row**

In `plugin/skills/_shared/auto-decision-log.md`, in the `| Field | Required | Format |` table, change the `STATUS` row from:

```
| `STATUS` | yes | `AUTO` (auto-applied), `STAGED` (logged but not acted; needs Review Console), `KEPT-PROMPT` (auto would not apply; asked user inline), `SCANNED` (scan completed — reports scope/outcome, whether or not anything was found), `REFUSED` (a queue-write proposal blocked at creation — no valid `Defer-reason:`; see `wrap-up/refused-proposals.md`) |
```

to:

```
| `STATUS` | yes | `AUTO` (auto-applied), `STAGED` (logged but not acted; needs Review Console), `KEPT-PROMPT` (auto would not apply; asked user inline), `SCANNED` (scan completed — reports scope/outcome, whether or not anything was found), `REFUSED` (a queue-write proposal blocked at creation — no valid `Defer-reason:`; see `wrap-up/refused-proposals.md`), `FAILED` (a batch write attempt that errored — no "revert" or "no valid Defer-reason" semantics, so it's kept separate from `AUTO`/`REFUSED`; hand-composed by `backlog/refine-mode.md` and `apply-refine-labels.js` rather than gated through `append.js`'s `STATUSES`/`formatEntry`, a deliberate choice from #1072's review that extending that enum would touch multiple consumers; `decisions-classifier.js`'s `KIND_RE` and the wrap-up console's Empty-console fast path both recognize it on the read side) |
```

- [ ] **Step 3: Verify the ceiling still holds**

Run: `wc -c plugin/skills/_shared/auto-decision-log.md`
Expected: a value under `40960` (the added text is ~500 bytes; well within the ~25 KB headroom measured in Step 1).

- [ ] **Step 4: Run the context-cost ceiling test to confirm**

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/auto-decision-log.md
git commit -m "Document FAILED in auto-decision-log.md's STATUS vocabulary table

refs #1407"
```

---

## Acceptance Criteria Verification

After Task 5, run the full suite to confirm both acceptance criteria from `work/1407-spec.md`:

```bash
node --test tests/wrap-up-console-fast-path-scanned-exclusion.test.js tests/bin-lib/calibration/aggregate.test.js tests/bin-lib/calibration/cli.test.js tests/bin-lib/calibration/readers.test.js tests/bin-lib/log-decision/append.test.js tests/bin-lib/skill-audit/context-cost.test.js
```

Expected: all PASS. This exercises:
- "A `decisions.md` file containing only a `FAILED` line ... is treated as decision-bearing by the wrap-up console's fast-path test" — Task 4's new fixture test.
- "`calibration-report.js`'s aggregate output visibly accounts for `FAILED` lines (a named bucket, not silent `'other'`)" — Task 3's new CLI test.
- `append.test.js` still passes unchanged — confirms Task 5's documented decision (no `append.js` STATUSES change) didn't regress the existing pin.
