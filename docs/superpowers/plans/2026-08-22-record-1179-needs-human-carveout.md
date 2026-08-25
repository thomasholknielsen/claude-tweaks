# Merge-Check Needs-Human Carve-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the human-ruled precedence that a `merge-check` verdict of `needs-human` is never overridden by `consoleAutoResolve`'s default-merge — in both Review Console short-circuit files, cross-referenced from the gate that produces the verdict, with a go-red-proven conformance test.

**Architecture:** Three surgical prose additions (one sentence-cluster each in `wrap-up/review-console.md`, `flow/multispec-review-console.md`, `dispatch/settle-and-merge.md`) plus one new live-corpus conformance suite following the `skill-prose-conformance-tests` convention: whitespace-collapsed matching, frozen pre-change excerpts as go-red controls that carry the anchor and lack only the carve-out, one claim per test.

**Tech Stack:** Markdown skill prose; `node --test` (no external deps).

**Spec:** `.claude-tweaks/pipelines/2026-08-22T135220-record-1179/work/1179-spec.md` (materialized from GitHub issue #1179)

## Global Constraints

- Human ruling already made (2026-08-21, run 2026-08-20T194024-record-642 / PR #1156): merge-check's `needs-human` wins. Pin it — do not re-litigate the design.
- The single-spec and multi-spec short-circuits must stay consistent; the multi-spec file explicitly mirrors the single-spec one.
- Existing prose is appended to, never removed — other suites pin sentences in these files (e.g. `tests/auto-mode-flow-two-stop-budget.test.js`); removal risks unrelated reds.
- Commit message references use `refs #1179` — never `closes`/`fixes` (the run's PR body carries the one `Fixes #1179` line).
- New test file lands under `tests/` — `npm test`'s recursive glob picks it up with no registration.

---

### Task 1: Carve-out prose + conformance suite (one TDD cycle)

**Files:**
- Test: `tests/console-autoresolve-needs-human-carveout.test.js` (create)
- Modify: `plugin/skills/wrap-up/review-console.md:82` (the batch-section bullet inside `## Auto-resolution short-circuit (\`consoleAutoResolve\`)`)
- Modify: `plugin/skills/flow/multispec-review-console.md:66` (the "When granted:" paragraph inside `## Auto-resolution short-circuit (\`consoleAutoResolve\`)`)
- Modify: `plugin/skills/dispatch/settle-and-merge.md:204` (the Layer 2 "Content judgment" bullet of `## Auto-merge gate`)

**Interfaces:**
- Consumes: current live prose of the three files (excerpts frozen below as controls).
- Produces: the exact carve-out sentences below — the test's pinned literals are copied from these replacement texts, per the "copy the pinned literal out of the edit's own replacement text" convention.

- [ ] **Step 1: Write the failing conformance test**

Create `tests/console-autoresolve-needs-human-carveout.test.js`:

```js
'use strict';
// Conformance suite for record #1179: a merge-check verdict of `needs-human` is
// authoritative — consoleAutoResolve's default-merge never overrides it.
//
// Live-corpus reads are correct here (skill-prose-conformance-tests decision table:
// "a documented convention this project wants enforced" / the carve-out prose IS the
// declared contract). Go-red proof [IL-105]: each pattern is also run against a frozen
// pre-change excerpt that carries the anchor ("defaults to merge" / the Layer 2 verdict
// sentence) and lacks only the carve-out, so a green result proves the pattern can fail
// for the attributable reason. Whitespace is collapsed on both haystack and needle [IL-66].

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WRAPUP = fs.readFileSync(path.join(ROOT, 'plugin/skills/wrap-up/review-console.md'), 'utf8');
const MULTISPEC = fs.readFileSync(path.join(ROOT, 'plugin/skills/flow/multispec-review-console.md'), 'utf8');
const SETTLE = fs.readFileSync(path.join(ROOT, 'plugin/skills/dispatch/settle-and-merge.md'), 'utf8');

const collapse = (s) => s.replace(/\s+/g, ' ');

// Frozen pre-change excerpts (string literals, never read from history) — the bytes the
// change replaced. Each carries the "defaults to merge" anchor (or, for settle, the
// Layer 2 needs-human sentence) WITHOUT the carve-out, so doesNotMatch/failed-window
// results are attributable to the carve-out's absence, not the anchor's.
const PRE_CHANGE_WRAPUP_BULLET = collapse(
  '- Every batch-section item (Auto-applied through Cleanup actions) resolves as if "Approve all" had been chosen. **The merge half of that decision defaults to merge** (`integration-model: pr-first`\'s "Approve all + merge" variant, never "leave PR open") — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way.'
);
const PRE_CHANGE_MULTISPEC_SENTENCE = collapse(
  '**The merge half of the terminal decision defaults to merge** (`integration-model: pr-first`\'s "Approve all + merge" variant) — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way. Execute via "On approval" below;'
);
const PRE_CHANGE_SETTLE_LAYER2 = collapse(
  '**Every member\'s verdict must be `auto-merge`** for the group to proceed — a single `needs-human` verdict anywhere in the group falls the whole group back to the normal pending-review path.'
);

// The carve-out's load-bearing tokens, one pattern per claim.
const CARVEOUT_HEADING = /Needs-human carve-out \(merge-check precedence\):/;
const CARVEOUT_RESOLUTION = /needs-human[\s\S]{0,320}?leave the PR open[^.]{0,80}never merge/;
const CARVEOUT_PRECEDENCE = /consoleAutoResolve[^.]{0,160}default-merge never overrides/;

// One claim per call: pattern must match the live (collapsed) file AND fail against the
// frozen pre-change excerpt.
function assertPinned(liveCollapsed, pattern, control, label) {
  assert.match(liveCollapsed, pattern, `${label}: carve-out claim missing from live prose`);
  assert.doesNotMatch(control, pattern, `${label}: pattern matches the pre-change text — cannot go red`);
}

// Adjacency helper: every "defaults to merge" occurrence must be followed by the
// carve-out heading within `window` collapsed chars. Returns the count of occurrences
// missing it (0 = compliant). Proved below against the pre-change controls, which carry
// the anchor and lack only the carve-out — the blind-spot rule for adjacency claims.
function occurrencesMissingCarveout(collapsed, window) {
  const anchor = /defaults to merge/g;
  let miss = 0;
  let m;
  while ((m = anchor.exec(collapsed)) !== null) {
    const follow = collapsed.slice(m.index, m.index + window);
    if (!CARVEOUT_HEADING.test(follow)) miss += 1;
  }
  return miss;
}

const WINDOW = 700;

test('single-spec console: carve-out present and go-red-proven', () => {
  assertPinned(collapse(WRAPUP), CARVEOUT_HEADING, PRE_CHANGE_WRAPUP_BULLET, 'wrap-up/review-console.md');
});

test('single-spec console: needs-human resolves the merge half to leave-PR-open, never merge', () => {
  assertPinned(collapse(WRAPUP), CARVEOUT_RESOLUTION, PRE_CHANGE_WRAPUP_BULLET, 'wrap-up/review-console.md');
});

test('single-spec console: consoleAutoResolve default-merge never overrides the verdict', () => {
  assertPinned(collapse(WRAPUP), CARVEOUT_PRECEDENCE, PRE_CHANGE_WRAPUP_BULLET, 'wrap-up/review-console.md');
});

test('single-spec console: no "defaults to merge" without the exception adjacent', () => {
  const collapsed = collapse(WRAPUP);
  assert.ok(/defaults to merge/.test(collapsed), 'anchor vanished — adjacency claim is vacuous');
  assert.strictEqual(occurrencesMissingCarveout(collapsed, WINDOW), 0,
    'wrap-up/review-console.md: a "defaults to merge" statement lacks the needs-human carve-out within its window');
});

test('multi-spec console: carve-out present and go-red-proven', () => {
  assertPinned(collapse(MULTISPEC), CARVEOUT_HEADING, PRE_CHANGE_MULTISPEC_SENTENCE, 'flow/multispec-review-console.md');
});

test('multi-spec console: needs-human resolves the merge half to leave-PR-open, never merge', () => {
  assertPinned(collapse(MULTISPEC), CARVEOUT_RESOLUTION, PRE_CHANGE_MULTISPEC_SENTENCE, 'flow/multispec-review-console.md');
});

test('multi-spec console: consoleAutoResolve default-merge never overrides the verdict', () => {
  assertPinned(collapse(MULTISPEC), CARVEOUT_PRECEDENCE, PRE_CHANGE_MULTISPEC_SENTENCE, 'flow/multispec-review-console.md');
});

test('multi-spec console: no "defaults to merge" without the exception adjacent', () => {
  const collapsed = collapse(MULTISPEC);
  assert.ok(/defaults to merge/.test(collapsed), 'anchor vanished — adjacency claim is vacuous');
  assert.strictEqual(occurrencesMissingCarveout(collapsed, WINDOW), 0,
    'flow/multispec-review-console.md: a "defaults to merge" statement lacks the needs-human carve-out within its window');
});

test('multi-spec carve-out names the single-spec file it mirrors', () => {
  assert.match(collapse(MULTISPEC), /Needs-human carve-out[\s\S]{0,600}?wrap-up\/review-console\.md/,
    'multispec carve-out must cite wrap-up/review-console.md (mirror consistency)');
});

test('settle-and-merge: needs-human verdict survives into the console short-circuit', () => {
  assertPinned(collapse(SETTLE), CARVEOUT_PRECEDENCE, PRE_CHANGE_SETTLE_LAYER2, 'dispatch/settle-and-merge.md');
});

test('adjacency helper is itself discriminating (counting-helper proof)', () => {
  // Control carries the anchor and lacks the carve-out → exactly 1 missing occurrence.
  assert.strictEqual(occurrencesMissingCarveout(PRE_CHANGE_WRAPUP_BULLET, WINDOW), 1,
    'helper failed to flag the pre-change excerpt');
  // Anchor-less input → 0 (no free passes from an empty scan being conflated with compliance
  // is why the live tests assert the anchor separately).
  assert.strictEqual(occurrencesMissingCarveout('no anchor here at all', WINDOW), 0);
  // Synthetic compliant pair: anchor followed by the carve-out heading inside the window → 0.
  const compliant = 'The merge half defaults to merge. **Needs-human carve-out (merge-check precedence):** …';
  assert.strictEqual(occurrencesMissingCarveout(collapse(compliant), WINDOW), 0,
    'helper flags a compliant synthetic pair');
});
```

- [ ] **Step 2: Run the test to verify it fails (the live pre-edit corpus is the red state)**

Run: `node --test tests/console-autoresolve-needs-human-carveout.test.js`
Expected: FAIL — the carve-out claims (`carve-out claim missing from live prose`) and the two adjacency tests fail; the helper-proof test and the pre-change `doesNotMatch` halves pass. Record the failing test names; every carve-out-presence test must be among them.

- [ ] **Step 3: Add the carve-out to `plugin/skills/wrap-up/review-console.md`**

In the `## Auto-resolution short-circuit (\`consoleAutoResolve\`)` section, extend the first bullet of the "resolve every item" list. Replace:

```markdown
- Every batch-section item (Auto-applied through Cleanup actions) resolves as if "Approve all" had been chosen. **The merge half of that decision defaults to merge** (`integration-model: pr-first`'s "Approve all + merge" variant, never "leave PR open") — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way.
```

with:

```markdown
- Every batch-section item (Auto-applied through Cleanup actions) resolves as if "Approve all" had been chosen. **The merge half of that decision defaults to merge** (`integration-model: pr-first`'s "Approve all + merge" variant, never "leave PR open") — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way. **Needs-human carve-out (merge-check precedence):** when an `assess-agent-autonomy` `merge-check` verdict of `needs-human` exists for this run (any member's verdict, for a bundle — `dispatch/settle-and-merge.md`'s Auto-merge gate, Layer 2), the merge half instead resolves to **leave the PR open** (`pending-review`), never merge — `consoleAutoResolve`'s default-merge never overrides the more specific gate's routing to a human. Every non-merge item still auto-resolves exactly as this section states.
```

- [ ] **Step 4: Add the mirrored carve-out to `plugin/skills/flow/multispec-review-console.md`**

In its `## Auto-resolution short-circuit (\`consoleAutoResolve\`)` section's "When granted:" paragraph, replace:

```markdown
**The merge half of the terminal decision defaults to merge** (`integration-model: pr-first`'s "Approve all + merge" variant) — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way. Execute via "On approval" below;
```

with:

```markdown
**The merge half of the terminal decision defaults to merge** (`integration-model: pr-first`'s "Approve all + merge" variant) — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way. **Needs-human carve-out (merge-check precedence):** when an `assess-agent-autonomy` `merge-check` verdict of `needs-human` exists for this run (any member's verdict, for a bundle — `dispatch/settle-and-merge.md`'s Auto-merge gate, Layer 2), the merge half instead resolves to **leave the PR open** (`pending-review`), never merge — `consoleAutoResolve`'s default-merge never overrides the more specific gate's routing to a human; mirrors the single-spec carve-out in `wrap-up/review-console.md`. Every non-merge item still auto-resolves exactly as this section states. Execute via "On approval" below;
```

- [ ] **Step 5: Add the cross-reference to `plugin/skills/dispatch/settle-and-merge.md`**

In `## Auto-merge gate`'s Layer 2 ("Content judgment") bullet, replace:

```markdown
**Every member's verdict must be `auto-merge`** for the group to proceed — a single `needs-human` verdict anywhere in the group falls the whole group back to the normal pending-review path.
```

with:

```markdown
**Every member's verdict must be `auto-merge`** for the group to proceed — a single `needs-human` verdict anywhere in the group falls the whole group back to the normal pending-review path. That verdict is authoritative all the way down: it survives into the Review Console's Auto-resolution short-circuit, where `consoleAutoResolve`'s default-merge never overrides it (the Needs-human carve-out in `wrap-up/review-console.md` and `flow/multispec-review-console.md`).
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tests/console-autoresolve-needs-human-carveout.test.js`
Expected: PASS — all tests green, including the `doesNotMatch` halves against the frozen pre-change excerpts.

- [ ] **Step 7: Verify existing pins on the touched files still pass**

Run: `node --test tests/auto-mode-flow-two-stop-budget.test.js tests/console-execution.test.js tests/console-on-pr.test.js tests/pr-first-merge.test.js tests/multi-agent-coordination.test.js tests/wrap-up-console-fast-path-scanned-exclusion.test.js`
Expected: PASS (these suites pin other sentences in the three touched files; the edits are append-only, so they must stay green).

- [ ] **Step 8: Commit**

```bash
git add tests/console-autoresolve-needs-human-carveout.test.js plugin/skills/wrap-up/review-console.md plugin/skills/flow/multispec-review-console.md plugin/skills/dispatch/settle-and-merge.md
git commit -m "Pin merge-check needs-human precedence over consoleAutoResolve default-merge — refs #1179"
```

---

## Self-Review Notes

- **Spec coverage:** Deliverable 1 → Steps 3-4 (both short-circuits, non-merge items explicitly unaffected). Deliverable 2 → Step 5 (stated where the verdict is produced). Deliverable 3 → Steps 1-2 (live-corpus scan, go-red proven by the pre-edit red run AND the frozen-excerpt `doesNotMatch` halves). AC 1 → the adjacency tests (`no "defaults to merge" without the exception`). AC 2 → the settle-and-merge test. AC 3 → removing either file's carve-out re-creates the pre-change shape the frozen controls prove the patterns fail on.
- **Pinned-literal consistency:** every pattern token (`Needs-human carve-out (merge-check precedence):`, `leave the PR open`, `never merge`, `default-merge never overrides`, `wrap-up/review-console.md`) appears verbatim in Steps 3-5's replacement text — copied from the edits, not from memory.
- **Ceiling headroom:** review-console.md ~20.0KB, multispec-review-console.md ~33.2KB, settle-and-merge.md ~33.3KB against the 40KB ceiling; additions are ≤600 bytes each.
