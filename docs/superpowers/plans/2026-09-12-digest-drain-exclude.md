# Digest Drain Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/claude-tweaks:specify`'s bare drain from claiming, reading, and refusing the materiality-floor `digest` container issue on every run.

**Architecture:** Add the `digest` label to `plugin/skills/specify/next-mode.md`'s Eligibility query — both the prose exclusion list and the `EXCLUDE` `Set` in its `node -e` fence — plus the Claim-step's live re-read exclusion list, mirroring how `plugin/skills/tidy/step-1-records.md` already exempts `digest` containers from its own sweep. No separate JS-level queue-pull helper mirrors this exclusion (searched `plugin/bin/`); `dispatch`'s own queue is `auto:build`-gated so a `digest` issue is naturally excluded there already.

**Tech Stack:** Markdown skill prose (`plugin/skills/specify/next-mode.md`), `node --test` conformance suite (`tests/specify-next-mode.test.js`).

**Spec:** `.claude-tweaks/pipelines/2026-09-12T042729-record-2218/work/2218-spec.md` (record #2218)

## Global Constraints

- Existing exclusions (`ready`, `parked`, `parent-issue`, `bot:in-progress`, `needs:*`) must remain unchanged — only add `digest`.
- Preserve the "The last is a cheap label-based pre-filter" sentence's referent (`bot:in-progress`) — insert `digest` before `bot:in-progress` in every list, never after.

---

### Task 1: Exclude `digest` from the Eligibility query and Claim re-read

**Files:**
- Modify: `plugin/skills/specify/next-mode.md` (Eligibility query prose ~L135-152, `EXCLUDE` Set ~L187, Claim-step re-read ~L366-367)
- Test: `tests/specify-next-mode.test.js`

**Interfaces:**
- Consumes: nothing new — pure prose/literal edit.
- Produces: nothing consumed by other tasks (single task).

- [x] **Step 1: Write the failing test**

Add to `tests/specify-next-mode.test.js`:

```js
test('next-mode.md eligibility EXCLUDE set and prose exclude digest-labeled container issues (refs #2218)', () => {
  assert.ok(NEXT_MODE_FLAT.includes("new Set(['ready', 'parked', 'parent-issue', 'bot:in-progress', 'digest'])"), 'EXCLUDE Set must include digest so the materiality-floor container is never claimed by bare drain');
  assert.ok(NEXT_MODE_FLAT.includes('`parked`, `parent-issue`, `digest`, and `bot:in-progress`'), 'eligibility predicate prose must also list digest, before bot:in-progress so "The last" still refers to bot:in-progress');
  assert.ok(NEXT_MODE_FLAT.includes('`_shared/materiality-floor.md`'), 'digest exclusion rationale must cite materiality-floor.md');
  assert.ok(NEXT_MODE_FLAT.includes('`parked`, `parent-issue`, `digest`, or `bot:in-progress`'), 'Claim-step re-read predicate must also list digest');
});
```

Also update the two now-stale existing pins in the same file:
- The assertion at (old) line 99 (`'`parked`, `parent-issue`, and `bot:in-progress`.'`) → `'`parked`, `parent-issue`,\n`digest`, and `bot:in-progress`.'` (matches the new prose exactly, including the line wrap).
- The assertion at (old) line 231 (`'now carries `ready`, any `needs:*`-prefixed label, `parked`, `parent-issue`, or `bot:in-progress`'`) → `'now carries `ready`,\nany `needs:*`-prefixed label, `parked`, `parent-issue`, `digest`, or `bot:in-progress`)'` (matches the new re-read sentence).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/specify-next-mode.test.js`
Expected: FAIL — the new test's `EXCLUDE` and prose assertions don't match current file content; the two updated existing assertions also fail against pre-edit prose.

- [ ] **Step 3: Write minimal implementation**

In `plugin/skills/specify/next-mode.md`:

1. Eligibility query prose (~L135-138): change
   ``` `parked`, `parent-issue`, and\n`bot:in-progress`.``` to
   ``` `parked`, `parent-issue`,\n`digest`, and `bot:in-progress`.```
2. Rationale paragraph (~L144-152): after the `parent-issue` rationale sentence, add: "`digest` is excluded for the same reason — an issue carrying it is the materiality floor's rolling container (`_shared/materiality-floor.md`), never a work record at all, the same exemption `/tidy`'s Shape 1 already gives a `parent-issue`-labeled parent (`tidy/step-1-records.md`)."
3. `EXCLUDE` Set (~L187): `const EXCLUDE = new Set(['ready', 'parked', 'parent-issue', 'bot:in-progress', 'digest']);`
4. Claim-step re-read (~L366-367): change `` `parked`, `parent-issue`, or `bot:in-progress`),`` to `` `parked`, `parent-issue`, `digest`, or `bot:in-progress`),``

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/specify-next-mode.test.js`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/specify/next-mode.md tests/specify-next-mode.test.js
git commit -m "Exclude digest-labeled container issues from specify bare-drain eligibility"
```

## Self-Review

**Spec coverage:** Deliverables ("add `digest` to the excluded label set … and any queue-pull helper that mirrors it" + "a conformance assertion that the exclusion list names `digest`") — both covered by Task 1; no second mirroring helper found after search. Acceptance Criteria ("bare drain against a digest-only queue reports remaining 0 without claiming it; existing exclusions unchanged") — covered by the `EXCLUDE` Set change (mechanical: `digest` now short-circuits the `node -e` filter to an empty `eligible` array before Selection ever runs) plus the unchanged-exclusions assertions already pinned in the untouched parts of the test file.

**Placeholder scan:** none — every step shows exact strings/diffs.

**Type consistency:** N/A (prose + one JS literal, no functions/types introduced).
