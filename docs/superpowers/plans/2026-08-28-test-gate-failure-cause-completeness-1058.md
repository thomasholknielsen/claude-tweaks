# Test-Gate Failure-Cause Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require that a `decisions.md` test-gate entry naming specific failure causes for a stated failure count either names every failure or explicitly signals the enumeration is partial, so a reader can never mistake a partial named list for a complete one.

**Architecture:** Pure documentation/policy change — add a new subsection to `plugin/skills/_shared/auto-decision-log.md`'s Entry schema section stating the completeness rule, with a worked negative example drawn from the #994 incident. Pin the new prose with a `node --test` conformance test, following the existing pattern in `tests/auto-decision-log-worktree-gate.test.js` (content-pattern assertions, not line-number pins).

**Tech Stack:** Markdown (skill file), Node's built-in `node:test` + `node:assert` (conformance test), `npm test` (`node --test` glob runner).

**Spec:** `work/1058-spec.md`

## Global Constraints

- Documentation/policy only — no code or behavioral surface change (spec's Technical Approach).
- The edited file (`plugin/skills/_shared/auto-decision-log.md`) must stay under the repo's 40KB skill-file ceiling (CLAUDE.md's Working Approach / `tests/bin-lib/skill-audit/context-cost.test.js`) — file is ~16KB before this change, the added subsection is ~10 lines, well within headroom.
- Full `npm test` suite must pass after the edit — byte-pinned prose conformance suites exist repo-wide (spec's Gotchas).

---

### Task 1: Add the failure-cause completeness rule to auto-decision-log.md

**Files:**
- Modify: `plugin/skills/_shared/auto-decision-log.md` (insert a new `## Failure-cause completeness (test-gate entries)` subsection immediately after the `## Entry schema` table, before `## Lever attribution (optional trailing field)`)
- Test: `tests/auto-decision-log-test-gate-completeness.test.js`

**Interfaces:**
- Consumes: nothing (prose-only file; no code interfaces)
- Produces: nothing consumed by later tasks — this is the only task

- [ ] **Step 1: Write the failing test**

Create `tests/auto-decision-log-test-gate-completeness.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #1058: auto-decision-log.md's canonical entry schema did not require a
// test-gate entry that names specific failure causes to account for every
// failure in a stated count — a partial named list (e.g. "8 fail: {6 named
// categories}") could be mistaken for a complete enumeration. Observed on
// #994's wrap-up: a decisions.md entry named 6 of 8 failure categories,
// silently omitting 2.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const AUTO_DECISION_LOG = read('plugin', 'skills', '_shared', 'auto-decision-log.md');

test('auto-decision-log.md requires test-gate failure-cause enumeration completeness', () => {
  assert.match(AUTO_DECISION_LOG, /Failure-cause completeness/);
});

test('auto-decision-log.md requires every failure be named or an explicit partial signal', () => {
  assert.match(AUTO_DECISION_LOG, /see full log at/);
});

test('auto-decision-log.md warns against an unsignaled partial named list', () => {
  assert.match(AUTO_DECISION_LOG, /Never write a partial named list/);
});

test('auto-decision-log.md cites the #994 incident that motivated this rule', () => {
  assert.match(AUTO_DECISION_LOG, /#994/);
});

test('the completeness rule appears between Entry schema and Lever attribution', () => {
  const entrySchemaIdx = AUTO_DECISION_LOG.indexOf('## Entry schema');
  const completenessIdx = AUTO_DECISION_LOG.indexOf('## Failure-cause completeness');
  const leverIdx = AUTO_DECISION_LOG.indexOf('## Lever attribution');
  assert.ok(entrySchemaIdx > -1 && completenessIdx > -1 && leverIdx > -1, 'all three sections must exist');
  assert.ok(entrySchemaIdx < completenessIdx, 'completeness rule must follow Entry schema');
  assert.ok(completenessIdx < leverIdx, 'completeness rule must precede Lever attribution');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auto-decision-log-test-gate-completeness.test.js`
Expected: FAIL — 4 of 5 assertions fail (no `Failure-cause completeness` heading, no `see full log at` phrase, no `Never write a partial named list` phrase, no `#994` citation); the fifth test also fails since `completenessIdx` is `-1`.

- [ ] **Step 3: Add the subsection to auto-decision-log.md**

In `plugin/skills/_shared/auto-decision-log.md`, insert the following new subsection immediately after the Entry schema table's last row (`| Commit ref / stage path | when reversible | ... |`) and before the `## Lever attribution (optional trailing field)` heading:

```markdown

## Failure-cause completeness (test-gate entries)

A test-gate entry (any entry reporting a check-suite outcome — `/test`'s verification report, `/review` Step 1.5's standalone gate, or a multi-spec pre-flight sweep) that states a failure count and names specific failure causes must account for **every** failure in that count, not a subset that reads as complete. Two shapes satisfy this:

- **Full enumeration** — name every failure (by test file, category, or root cause) until the named list's count matches the stated total.
- **Explicit partial signal** — when full enumeration is impractical, state the count and point to the full log instead of a partial named list: `{N} failures — see full log at {path}`.

Never write a partial named list (e.g. "8 fail: {6 named categories}") with no signal that 2 are omitted — a reader has no way to distinguish a complete enumeration from a partial one. This bit `/wrap-up` on #994: a first `/flow` call's Step-4 test-gate entry named 6 of 8 failure categories, silently omitting 2; the gap surfaced only because a second, independent pass re-derived from raw output rather than trusting the entry.
```

The exact insertion point: the line `| Commit ref / stage path | when reversible | \`commit abc1234\` or \`stage path: staged/...\` |` is immediately followed by a blank line and then `## Lever attribution (optional trailing field)` in the current file. Replace that blank line + heading with the new subsection (ending in its own blank line) followed by the `## Lever attribution` heading, so the table row is unchanged and only the material between it and `## Lever attribution` grows.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auto-decision-log-test-gate-completeness.test.js`
Expected: PASS — all 5 assertions pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions in other prose-conformance suites (e.g. `tests/auto-decision-log-worktree-gate.test.js`, `tests/bin-lib/skill-audit/context-cost.test.js`'s size ceiling check). If `pr-state.test.js` shows a flake under load, re-run it in isolation (`node --test tests/pr-state.test.js`) per CLAUDE.md's flake-tolerance rule before treating it as a regression.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/_shared/auto-decision-log.md tests/auto-decision-log-test-gate-completeness.test.js
git commit -m "Add test-gate failure-cause completeness rule to auto-decision-log.md (refs #1058)"
```
