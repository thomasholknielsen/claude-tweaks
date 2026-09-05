# Fix build-review-context.js Compute-Then-Exit Truncation Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `process.exit(run(...))` with `process.exitCode = run(...)` in `plugin/bin/build-review-context.js` so a piped consumer's read of this CLI's stdout JSON line can never be truncated by an immediate hard-stop.

**Architecture:** No new modules — a one-line change to the file's `require.main === module` entry point, matching the fix already applied to `plugin/bin/release.js` (`process.exitCode = main(process.argv);`) for the identical idiom (#1176, #1313).

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T132303-record-1535/work/1535-spec.md` (materialized from GitHub issue #1535)

## Global Constraints

- Exit code for a representative success case and a representative failure case must be unchanged after the fix.
- `npm test` must pass in full.

---

### Task 1: Replace process.exit with process.exitCode

**Files:**
- Modify: `plugin/bin/build-review-context.js:76`
- Test: `tests/bin-lib/review-context/exit-code.test.js` (new)

**Interfaces:**
- Consumes: `run(argv, deps)` exported from `plugin/bin/build-review-context.js` (already exported at line 83 via `module.exports = { run, parseArgs };`) — returns an integer exit code (`0` on success, `2` on malformed invocation).
- Produces: nothing new for other tasks to consume — this is the only task in the plan.

**Current code (lines 74-81):**

```js
if (require.main === module) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write(`build-review-context.js: ${err.message}\n`);
    process.exitCode = 1;
  }
}
```

The `catch` block already sets `process.exitCode = 1` and never called `process.exit()` itself, so that branch is unaffected by this change. Nothing follows the `if (require.main === module)` block in the file (line 81 is its closing brace, followed only by the `module.exports` line, which does not execute on this path since it already ran before this block at parse time) — so removing the hard stop does not expose any later code to a state it doesn't expect.

- [ ] **Step 1: Write a failing test proving the current exit path still uses `process.exit`**

Since `run()` is already unit-testable directly (it's exported and takes an injectable `deps` object), the exit-code idiom itself — `process.exit` vs `process.exitCode` on the `require.main === module` entry point — is not exercisable through `run()` alone; it has to be exercised by spawning the file as a real subprocess and inspecting its exit code, the same technique a subprocess-based test uses. Create `tests/bin-lib/review-context/exit-code.test.js`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'build-review-context.js');

test('mint with no --run exits 0 and prints a JSON line with a dir key', () => {
  const result = spawnSync(process.execPath, [CLI, 'mint'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(typeof parsed.dir, 'string');
});

test('unknown command exits 2 and prints usage to stderr', () => {
  const result = spawnSync(process.execPath, [CLI, 'bogus-command'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown command: bogus-command/);
});
```

- [ ] **Step 2: Run the test to confirm it currently passes (baseline, not a red step)**

Run: `node --test tests/bin-lib/review-context/exit-code.test.js`
Expected: PASS (both cases) — this step is not TDD-red; `process.exit(code)` and `process.exitCode = code` are observationally identical from a spawned subprocess's exit status when nothing async remains pending after the assignment, which is exactly what Task 1 Step 3 changes. This test's job is to pin that the observable exit-code behavior survives the refactor, not to catch the idiom itself (the idiom risk — stdout truncation under backpressure — is not reliably reproducible in a fast unit test; it is a known-defect-shape fix, not a regression this suite can force red first). Confirm PASS here before proceeding, then re-run after Step 3 to confirm it still passes.

- [ ] **Step 3: Apply the fix**

In `plugin/bin/build-review-context.js`, replace:

```js
    process.exit(run(process.argv.slice(2)));
```

with:

```js
    process.exitCode = run(process.argv.slice(2));
```

(Line 76 only — no other line in the `if (require.main === module)` block changes.)

- [ ] **Step 4: Run the test again to confirm it still passes**

Run: `node --test tests/bin-lib/review-context/exit-code.test.js`
Expected: PASS (both cases, same as Step 2 — proves the fix preserves observable exit-code behavior for both a success and a failure case)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS in full (per this record's Acceptance Criteria #2)

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/build-review-context.js tests/bin-lib/review-context/exit-code.test.js
git commit -m "Fix compute-then-exit truncation risk in build-review-context.js

refs #1535"
```
