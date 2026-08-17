# Backlog Refine — Pre-Write Reverify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:backlog refine`'s Step 5 (Apply) re-check a row's premise against live label state immediately before writing it, so a stale multi-hour confirmation can no longer overwrite a concurrent session's grant/claim.

**Architecture:** Insert one new prose subsection into `skills/backlog/refine-mode.md` Step 5, immediately after the narration-allowance line and before the first write block (`**Priority/Related rows:**`). It states the pre-write reverify procedure once (re-fetch live labels, compare against the Step 1 premise, skip-and-report on mismatch) and states the general cross-skill rule, cross-referencing `/claude-tweaks:tidy`'s `step-6-auto.md`, which already applies the identical pattern to its own gated `[parent-gate]` finding. A `node --test` conformance test pins the new claims into the file the same way `tests/backlog-refine-closing-render.test.js` already pins Step 5's closing-summary requirements — regex assertions against the live prose, each proven to fail against the pre-change text.

**Tech Stack:** Markdown skill prose (this repo's skills are LLM-executed procedures, not runtime code); `node --test` for the conformance test.

**Spec:** `.claude-tweaks/pipelines/20260817T173343-spec-764/work/764-spec.md` (record #764)

## Global Constraints

- No behavioral code exists to change — `skills/backlog/refine-mode.md` is prose the agent follows at runtime. "Implementation" here means editing that prose precisely enough that a fresh reader (or a conformance test) can verify the new behavior is actually specified, not just gestured at.
- Acceptance Criterion 1 requires `grep -n "re-fetch\|live label" skills/backlog/refine-mode.md` to show the pre-write reverify step in Step 5 — the new text must literally contain one of those two phrases inside Step 5.
- Acceptance Criterion 2 requires a test or worked trace demonstrating a stale-premise row is skipped at write time. This plan satisfies it with an executable `node --test` conformance test (matches this project's existing `tests/backlog-refine-closing-render.test.js` convention) rather than a runtime harness, since `refine-mode.md` has no executable code path to unit-test directly.
- Deliverable 2 ("state this as a general rule... cross-reference from a sibling skill with the same pattern if one is identified during the build") is already resolved: `skills/tidy/step-6-auto.md`'s `[parent-gate]` row already states "Once approved, this action re-verifies the gate is still `due` with freshly read state before doing anything — never trusts the scan's own snapshot, which may be stale by the time Step 7 runs." — the identical shape. Cite it; do not restate its rationale or modify that file (out of scope — it already does the right thing).
- Do not touch **Dependency-repair rows** — the spec's Deliverable 1 names only priority/related, grant, and flag-back rows. Dependency-repair wires a `blocked-by` link rather than reading a grant/`ready` gate, so it is not the same race and stays out of scope.

---

### Task 1: Write the failing conformance test

**Files:**
- Create: `tests/backlog-refine-reverify-before-write.test.js`
- Read (no changes yet): `skills/backlog/refine-mode.md`

**Interfaces:**
- Consumes: nothing from other tasks — this is the first task.
- Produces: a `node --test` file the project's `npm test` glob (`tests/`) picks up automatically. Task 2 makes its assertions pass.

- [ ] **Step 1: Read the current Step 5 text to build the pre-change fixture**

Run:
```bash
sed -n '309,313p' skills/backlog/refine-mode.md
```
Expected output (this is the exact pre-change text the test's fixture must reproduce verbatim):
```
## Step 5: Apply

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line; the closing summary below is the report, not narration.)*

**Priority/Related rows:** For every record the priority decision resolved to apply:
```

- [ ] **Step 2: Write the test file**

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REFINE_MODE_PATH = path.join(__dirname, '..', 'skills', 'backlog', 'refine-mode.md');
const refineModeProse = fs.readFileSync(REFINE_MODE_PATH, 'utf8');

// The pre-change Step 5 opening (#764) — narration-allowance line followed directly by the
// Priority/Related write block, no reverify subsection between them. Used below to prove each
// regex actually goes red on the text this change replaces, not just green on the new text.
const PRE_CHANGE_STEP_5_HEAD = `## Step 5: Apply

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line; the closing summary below is the report, not narration.)*

**Priority/Related rows:** For every record the priority decision resolved to apply:
`;

// One claim per call: the pattern must match the shipped prose AND fail against the
// pre-change text, so a green result proves the regex can actually go red [IL-105].
function assertClaimPinned(pattern, missingMessage) {
  assert.match(refineModeProse, pattern, missingMessage);
  assert.doesNotMatch(PRE_CHANGE_STEP_5_HEAD, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
}

test('Step 5 re-fetches live labels immediately before writing a row', () => {
  assertClaimPinned(
    /re-fetch that record's live labels/,
    'pre-write live-label re-fetch missing from refine-mode.md Step 5',
  );
});

test('Step 5 compares live state against the row\'s Step 1 premise, not a re-derived value', () => {
  assertClaimPinned(
    /compare against the row's own premise/,
    'premise-comparison requirement missing from refine-mode.md Step 5',
  );
});

test('Step 5 drops a row whose premise no longer holds instead of writing it', () => {
  assertClaimPinned(
    /drop it from this write/,
    'drop-on-stale-premise requirement missing from refine-mode.md Step 5',
  );
});

test('Step 5 states this as a general rule for other batch-confirm-then-apply flows', () => {
  assertClaimPinned(
    /[Aa]ny batch-confirm-then-apply flow with a long-lived `AskUserQuestion` gate/,
    'general-rule statement missing from refine-mode.md Step 5',
  );
});

test('Step 5 cross-references tidy\'s existing identical pattern', () => {
  assertClaimPinned(
    /tidy.*step-6-auto\.md/s,
    'cross-reference to skills/tidy/step-6-auto.md missing from refine-mode.md Step 5',
  );
});

test('refine-mode.md Step 5 satisfies the #764 acceptance-criterion grep', () => {
  assert.match(refineModeProse, /re-fetch|live label/, '#764 AC1 grep pattern must match somewhere in the file');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/backlog-refine-reverify-before-write.test.js`
Expected: FAIL — every `assertClaimPinned` call's first `assert.match` fails (the live file has no reverify subsection yet). The last test (`satisfies the #764 acceptance-criterion grep`) also fails for the same reason.

- [ ] **Step 4: Commit**

```bash
git add tests/backlog-refine-reverify-before-write.test.js
git commit -m "Add failing conformance test for #764 pre-write reverify"
```

---

### Task 2: Add the pre-write reverify subsection and make the test pass

**Files:**
- Modify: `skills/backlog/refine-mode.md:309-313`
- Test: `tests/backlog-refine-reverify-before-write.test.js` (from Task 1 — must go green)

**Interfaces:**
- Consumes: nothing new — this task only edits prose the test file (Task 1) already reads by path.
- Produces: nothing further tasks depend on — this is the last task.

- [ ] **Step 1: Insert the reverify subsection**

In `skills/backlog/refine-mode.md`, locate this exact text (the narration-allowance line immediately followed by the Priority/Related write block):

```
*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line; the closing summary below is the report, not narration.)*

**Priority/Related rows:** For every record the priority decision resolved to apply:
```

Replace it with (same narration-allowance line, unchanged, plus the new subsection inserted before the existing Priority/Related line):

```
*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line; the closing summary below is the report, not narration.)*

**Pre-write reverify (every write below).** Row confirmation happened at Step 4's `AskUserQuestion` render, which may have sat unanswered for hours — long enough for a concurrent session to grant, claim, or flag back the same record. Immediately before writing any row below (priority/related, grant, flag-back — never dependency-repair, which wires a `blocked-by` link rather than reading a grant/`ready` gate and is not this same race), re-fetch that record's live labels (`gh issue view $ISSUE --json labels -q '.labels[].name'`) and compare against the row's own premise — the facets already captured at Step 1's fetch (`{tmp-faceted-file}`), not re-derived. A grant row whose live labels lost `ready`, or a flag-back row whose live labels gained `risk:*`/`size:*`/`auto:build`/`bot:in-progress` since Step 1, has had its premise invalidated by a concurrent write: drop it from this write, add one line to the closing summary's report (`#{n} — skipped: premise changed since confirmation ({what changed})`), and do not call any of the `gh edit`/`writeRecord` calls below for that row. A priority/related row has no grant/`ready` gate to invalidate — re-fetch and compare its current `priority:*`/`**Related:**` state the same way, skipping only when the record already matches what would be written (a genuine no-op) or when a concurrent write already set a different value (log and skip rather than overwrite a fresher decision).

Local-files driver: the equivalent re-read is `readRecord(path).facets` immediately before `writeRecord` — same skip-on-mismatch rule, since a concurrent session's edit to the tracked file is exactly the same class of stale-premise race as a concurrent GitHub label write.

**General rule.** Any batch-confirm-then-apply flow with a long-lived `AskUserQuestion` gate between building a row's premise and writing it needs this same pre-write reverify — the gate's wait time is unbounded and nothing else in this plugin guards the window. `/claude-tweaks:tidy`'s Step 6 auto-apply table already applies the identical rule to its own gated `[parent-gate]` finding (`skills/tidy/step-6-auto.md`: "Once approved, this action re-verifies the gate is still `due` with freshly read state before doing anything — never trusts the scan's own snapshot, which may be stale by the time Step 7 runs.") — this is the same shape, not a new one.

**Priority/Related rows:** For every record the priority decision resolved to apply:
```

- [ ] **Step 2: Run the conformance test to verify it passes**

Run: `node --test tests/backlog-refine-reverify-before-write.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 3: Run the AC1 grep directly**

Run: `grep -n "re-fetch\|live label" skills/backlog/refine-mode.md`
Expected: at least one matching line inside the new Step 5 subsection (satisfies #764 Acceptance Criterion 1 directly, independent of the test).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, 0 failures (satisfies #764 Acceptance Criterion 3). If any *unrelated* file's test fails, stop and follow `_shared/reproduce-first-discipline.md` before touching anything — do not assume it's pre-existing without reproducing it in isolation.

- [ ] **Step 5: Commit**

```bash
git add skills/backlog/refine-mode.md
git commit -m "Backlog refine: reverify live label state before writing each row (#764)"
```

## Self-Review Notes

- **Spec coverage:** Deliverable 1 (pre-write reverify) → Task 2 Step 1. Deliverable 2 (general rule + cross-reference) → Task 2 Step 1's "General rule" paragraph, citing the already-existing `tidy/step-6-auto.md` pattern (found during plan authoring — no new sibling file needed). AC1 → Task 2 Step 3. AC2 → Task 1 + Task 2 Step 2 (the conformance test is the worked trace: it pins the drop-on-mismatch behavior and proves the pattern goes red on the pre-change text, i.e. would have caught the #764 incident). AC3 → Task 2 Step 4.
- **Placeholder scan:** none — every step has literal text/commands, no "TBD"/"handle edge cases".
- **Type consistency:** n/a (prose-only change, no functions/signatures introduced).
