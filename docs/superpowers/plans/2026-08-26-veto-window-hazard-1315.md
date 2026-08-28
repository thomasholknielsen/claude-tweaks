# Veto-Window-Hours Resolver-Failure Hazard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `grant-maturation.js`'s `evaluateMaturation` so a non-positive or non-finite `vetoWindowHours` (including the `0` that `Number('')` produces on a resolver-failure empty string) falls back to the 24h default instead of silently defeating the veto window.

**Architecture:** One-line guard change in the single shared pure module both Auto-merge gate call sites (`dispatch/grant-maturation-gate.md`, `wrap-up/auto-merge-short-circuit.md`) already depend on — `vetoWindowHours >= 0` becomes `vetoWindowHours > 0`. No call-site changes needed: neither site does its own validation before calling `evaluateMaturation`, so hardening the one shared function covers both automatically.

**Tech Stack:** Node.js (`node --test`), existing `bin/lib/issues/grant-maturation.js` pure-module conventions.

**Spec:** `.claude-tweaks/pipelines/2026-08-26T042502-record-1315/work/1315-spec.md` (materialized from GitHub issue #1315) — this plan implements its Deliverables/Acceptance Criteria in full; the spec travels with this plan, executors read both.

## Global Constraints

- Single shared-module fix, not a per-call-site fix — `plugin/bin/lib/issues/grant-maturation.js`'s `evaluateMaturation` is the only file touched; neither `plugin/skills/dispatch/grant-maturation-gate.md` nor `plugin/skills/wrap-up/auto-merge-short-circuit.md` needs an edit, since both already just forward `Number($GRANT_VETO_WINDOW_HOURS)` straight into this function with no validation of their own.
- No change to the intentional, already-correct behavior for a real positive numeric `vetoWindowHours` (e.g. `24`, `48`) — only the classification of non-positive/non-finite input changes.
- The existing boundary test (`matures exactly at the window boundary (>=, not >)`, using a real 24h window) must keep passing unmodified.
- Add new test case(s) to the existing `tests/bin-lib/issues/grant-maturation.test.js` file — do not replace or duplicate its existing 11 tests.

---

### Task 1: Harden `evaluateMaturation`'s `vetoWindowHours` guard against zero/negative input

**Files:**
- Modify: `plugin/bin/lib/issues/grant-maturation.js:75` (the `windowHours` guard inside `evaluateMaturation`)
- Test: `tests/bin-lib/issues/grant-maturation.test.js` (append new test cases after the existing `defaults vetoWindowHours to 24 when absent or invalid` test at line 55)

**Interfaces:**
- Consumes: nothing new — `evaluateMaturation`'s existing signature (`{ hasPendingLabel, hasMergeLabel, pendingSince, vetoWindowHours, now }`) and return shape (`{ mature, state, reason, ageHours?, windowHours? }`) are unchanged.
- Produces: the same `evaluateMaturation` export, with the `windowHours` fallback now also engaging for `0` and negative numbers (previously only for non-finite/absent values). No new exports.

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/issues/grant-maturation.test.js`, insert two new test cases immediately after the existing test ending at line 55 (`test('evaluateMaturation: defaults vetoWindowHours to 24 when absent or invalid', ...)`), before the blank line that precedes the `extractPendingGrantedAt` tests:

```js
test('evaluateMaturation: does not treat an empty-string-derived 0 as a valid veto window', () => {
  const pendingSince = new Date('2026-08-23T11:59:00Z'); // 1 minute before NOW
  // Number('') === 0 — the exact resolver-failure hazard: a finite, non-NaN
  // value that must still hit the 24h fallback, not be honored as a real window.
  const result = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince, vetoWindowHours: Number(''), now: NOW });
  assert.strictEqual(result.mature, false);
  assert.strictEqual(result.state, 'within-veto-window');
  assert.strictEqual(result.windowHours, 24);
});

test('evaluateMaturation: does not treat a negative vetoWindowHours as valid', () => {
  const pendingSince = new Date('2026-08-23T11:59:00Z'); // 1 minute before NOW
  const result = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince, vetoWindowHours: -5, now: NOW });
  assert.strictEqual(result.mature, false);
  assert.strictEqual(result.state, 'within-veto-window');
  assert.strictEqual(result.windowHours, 24);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/grant-maturation.test.js`
Expected: FAIL — both new tests report `result.state` as `'matured'` (not `'within-veto-window'`) and `result.windowHours` as `0`/`-5` (not `24`), because the current guard (`vetoWindowHours >= 0`) accepts `0` and rejects only negative-or-non-finite values incorrectly (a negative value like `-5` fails `>= 0` today and already falls back correctly — confirm which of the two new tests actually fails before assuming both do; the `0` case is the one guaranteed to fail against the live `>= 0` guard).

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/issues/grant-maturation.js`, change line 75 from:

```js
  const windowHours = Number.isFinite(vetoWindowHours) && vetoWindowHours >= 0
    ? vetoWindowHours
    : DEFAULT_VETO_WINDOW_HOURS;
```

to:

```js
  const windowHours = Number.isFinite(vetoWindowHours) && vetoWindowHours > 0
    ? vetoWindowHours
    : DEFAULT_VETO_WINDOW_HOURS;
```

(Single-character change: `>=` becomes `>`, so a `0` window — finite and previously accepted — now falls through to the same 24h default as `NaN`/`undefined`/negative values.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/grant-maturation.test.js`
Expected: PASS (13 tests: the original 11 plus the 2 new ones).

- [ ] **Step 5: Run the full suite**

Run: `node --test tests/`
Expected: PASS — confirms no other suite depends on the old `>= 0` behavior (a repo-wide grep during planning found no other call site or test asserting a `0`-hour veto window is honored).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/grant-maturation.js tests/bin-lib/issues/grant-maturation.test.js
git commit -m "fix: grant-maturation treats a zero/negative veto window as invalid (#1315)"
```

---

## Acceptance Criteria Cross-Check (self-review)

- **"A test exists asserting evaluateMaturation does not treat an empty-string-derived 0 as a valid, sub-24h veto window"** — Task 1 Step 1's first new test (`vetoWindowHours: Number('')`).
- **"Both settle-and-merge.md's Auto-merge gate (via grant-maturation-gate.md) and auto-merge-short-circuit.md's Authorization layer are covered by the fix"** — true by construction: both files (read during planning) forward `Number($GRANT_VETO_WINDOW_HOURS)` straight into `evaluateMaturation` with no validation of their own, so Task 1's single-module fix covers both without touching either file.
- **"No change to the intentional, already-correct behavior when the resolver returns a real numeric string"** — Task 1's guard only narrows what counts as a valid *window*; a real positive value (e.g. `Number('24')` = `24`) still passes `> 0` exactly as it passed `>= 0` before.
- **"The existing boundary test ... must still pass unmodified"** — Task 1 Step 5's full-suite run confirms the existing `matures exactly at the window boundary (>=, not >)` test (which uses a real `vetoWindowHours: 24`, untouched by this change) still passes.
