# Specify Range-Form + Read-Back Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `#A-#B`/`#A–#B` inclusive-range input form to `/claude-tweaks:specify`'s shaping mode, and a mandatory read-back verification step to `shaping-mode.md`'s per-record write loop.

**Architecture:** Both changes are additive prose edits to two existing skill markdown files — no runtime code, no new modules. The range form expands to the already-shipped comma-list form before any of that form's own resolution logic runs, so it inherits the existing batch machinery (per-element resolution, mixed-list/empty-element errors, all-or-nothing resolve) with zero new code paths to design. The read-back step is a new subsection inserted into the existing write procedure, re-fetching each record immediately after its own write and asserting the labels/sections/placeholder-absence contract, without rolling back the write on failure (same failure-isolation posture the file already uses for write failures).

**Tech Stack:** Markdown (skill prose), Node's built-in `node --test` for the two new prose-pin tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T145819-spec-705-782-785/spec-705/work/705-spec.md` (record #705, narrowed build-time scope — see that file's "Build-time note"). Only the range-form and read-back-verification deliverables/acceptance-criteria are in scope; the comma-list batch form and the Next Actions batch row are already shipped (#695/#702) and must not be touched.

## Global Constraints

- Never write the literal placeholder tokens `TBD`, `TODO`, or `<!-- ambiguity:` in any composed prose (repo-wide skill-authoring rule — a stray mention trips the grep-based spec-shaped-body check elsewhere in the plugin; not directly relevant to these two files' own prose, but stated once since both files discuss that exact check).
- Every edit must preserve the exact literal substrings pinned by `tests/specify-batch-input.test.js` and `tests/batch-ref-argument.test.js` — both are whitespace-flattened substring pins over `skills/specify/SKILL.md` and `skills/specify/shaping-mode.md`. Insert new prose alongside the pinned text; never rewrite a pinned sentence.
- Match the surrounding prose density/style — these two files write long, precise paragraphs with inline parenthetical cross-references; short bullet-only prose would look out of place.

---

### Task 1: SKILL.md — range-form input

**Files:**
- Modify: `skills/specify/SKILL.md:42` (insert new paragraph immediately after the existing comma-list batch paragraph, which ends at line 42)
- Modify: `skills/specify/SKILL.md:69` (the "Batch branch:" bullet inside Resolve-the-input case 1)
- Test: `tests/specify-batch-input.test.js`, `tests/batch-ref-argument.test.js` (existing — must still pass unmodified)

**Interfaces:**
- Consumes: nothing from another task — this is a standalone prose insertion.
- Produces: a documented range-form input contract that Task 3's new test pins. The literal marker phrase downstream readers key on: `**Range form (`#A-#B`/`#A–#B` — shaping-mode-only).**`.

- [ ] **Step 1: Insert the Range form paragraph**

Read `skills/specify/SKILL.md` and confirm line 42 is still the end of the comma-list batch paragraph (it ends `...that contract does not change here.`) and line 44 still opens `Three optional flags may appear anywhere after the first argument...`. If the line numbers have drifted (a concurrent edit landed first), locate the same two anchor sentences by text instead of line number.

Insert this new paragraph immediately after the comma-list paragraph, before the "Three optional flags" paragraph:

```markdown
**Range form (`#A-#B`/`#A–#B` — shaping-mode-only).** An inclusive range of record references — `#701-#705` or `#701–#705` (hyphen or en-dash) — expands to the equivalent comma-joined list (`#701,#702,#703,#704,#705`) before any of the comma-list batch form's own resolution logic above runs; from that point on it is indistinguishable from a comma list typed directly, including the mixed-list/empty-element error handling, the all-or-nothing resolve, and the `phase-N`/`--granularity`/`--chained` ignore-or-reject rules. `A` and `B` are bare integers under `work-backend: github-issues` (`#701-#705`) or bare record ids under `work-backend: local-files` (`701-705`); `A` must be less than or equal to `B`, or the input is a hard error (`"'{input}' is not a valid range — {A} must be ≤ {B}"`) before expansion is attempted. A range with more than one hyphen/en-dash, or a non-numeric bound, does not parse as a range and falls through to case 1's normal record-reference check (so it is rejected the same way any other malformed reference is, not with a range-specific error).
```

- [ ] **Step 2: Wire range expansion into the Batch branch bullet**

In the same file, find case 1's "**Batch branch:**" sentence (inside "### Resolve the input:", item 1 — the long paragraph about `gh issue view`/`readRecord`). It currently opens:

```
**Batch branch:** when the first argument contains a comma (the `#N[,#M...]` form in `## Input`), split on `,`, resolve every element through this same case independently (parallel fetches), and — if any element fails to resolve — ...
```

Replace only the opening clause (everything after it, starting at "split on `,`", is unchanged):

```
**Batch branch:** first, expand a range-form first argument (`#A-#B`/`#A–#B` — see `## Input`'s Range form paragraph) to its equivalent comma-joined list; then, when the (possibly range-expanded) first argument contains a comma (the `#N[,#M...]` form in `## Input`), split on `,`, resolve every element through this same case independently (parallel fetches), and — if any element fails to resolve — ...
```

Do not touch anything else in this sentence or paragraph — the rest of the bullet (`report every unresolvable element in one message and stop, shaping nothing; only when every element resolves, enter shaping mode with the full set...` through the end) is pinned by `tests/batch-ref-argument.test.js` and must survive verbatim.

- [ ] **Step 3: Run the existing pinned tests to confirm no breakage**

Run: `node --test tests/specify-batch-input.test.js tests/batch-ref-argument.test.js`
Expected: PASS, all tests — these files pin substrings this task's edits must not have touched (verified in Step 2's instruction above; this run is the mechanical confirmation).

- [ ] **Step 4: Commit**

```bash
git add skills/specify/SKILL.md
git commit -m "specify: document the #A-#B/#A–#B range form for shaping-mode batch input (refs #705)"
```

---

### Task 2: shaping-mode.md — mandatory read-back verification

**Files:**
- Modify: `skills/specify/shaping-mode.md:142` (insert new `### Read-back verification` subsection between the end of "Compose-then-write-once" and the start of "### Actions Performed")
- Modify: `skills/specify/shaping-mode.md:146` (extend the write-failure sentence to also cover read-back failures)
- Test: `tests/specify-batch-input.test.js`, `tests/batch-ref-argument.test.js` (existing — must still pass unmodified)

**Interfaces:**
- Consumes: nothing from Task 1 — independent file, independent prose.
- Produces: a documented read-back step Task 3's new test pins. The literal marker phrase downstream readers key on: `### Read-back verification`.

- [ ] **Step 1: Insert the Read-back verification subsection**

Read `skills/specify/shaping-mode.md` and confirm the "### Compose-then-write-once" subsection still ends with the sentence `Nothing to commit on the \`github-issues\` driver — the edit above already landed via the API.` immediately before `### Actions Performed`. If drifted, locate by text.

Insert this new subsection between them:

```markdown
### Read-back verification

Immediately after each record's write lands — the `gh issue edit`/`writeRecord` call above, for that record specifically, before moving to the next record in the batch — re-fetch the record fresh (never trust the write call's own response) and assert it landed correctly:

- **`work-backend: github-issues`:** `gh issue view {n} --json labels,body`.
- **`work-backend: local-files`:** `readRecord(path)` (`bin/lib/issues/local-store.js`), re-reading from disk.

Assert, against the re-fetched result:
- `ready` is present, plus every scoring label this record's stamp step (above) added or already carried (`risk:*`, `size:*`, `ceremony:*`, Type).
- The five spec-shaped sections (`## Current State`, `## Deliverables`, `## Acceptance Criteria`, `## Technical Approach`, `## Gotchas`) plus `## Original request` are all present in the re-fetched body.
- No unresolved placeholder marker (`TBD`, `TODO`, `<!-- ambiguity:`) survived into the written body.

A read-back failure does **not** roll back the write or stop the batch — it follows the same per-record failure-isolation posture as a write failure (above): note the specific assertion(s) that failed, keep shaping the rest of the batch, and surface every record's read-back failure together in Actions Performed below rather than stopping on the first one (`flow/materialize.md`'s Materialization hard gate uses the same all-at-once reporting convention for its own record-level failures).
```

- [ ] **Step 2: Extend the Actions Performed write-failure sentence**

Immediately below, `### Actions Performed` opens with:

```
One row per record — a single-record run renders one row, a comma-list batch renders one row per shaped record (a record whose write failed renders its row with the failure in the Detail cell instead of the stamps):
```

Replace only the parenthetical:

```
One row per record — a single-record run renders one row, a comma-list batch renders one row per shaped record (a record whose write failed, or whose read-back verification (above) failed, renders its row with the failure in the Detail cell instead of the stamps):
```

Do not touch the table or any other sentence in this section — `tests/batch-ref-argument.test.js` pins the `no \`skipped\` outcome` sentence later in this same section verbatim.

- [ ] **Step 3: Run the existing pinned tests to confirm no breakage**

Run: `node --test tests/specify-batch-input.test.js tests/batch-ref-argument.test.js`
Expected: PASS, all tests.

- [ ] **Step 4: Commit**

```bash
git add skills/specify/shaping-mode.md
git commit -m "specify shaping-mode: add mandatory read-back verification after each record's write (refs #705)"
```

---

### Task 3: Prose-pin tests for the range form and read-back verification

**Files:**
- Create: `tests/specify-range-form-readback.test.js`

**Interfaces:**
- Consumes: the exact marker phrases Task 1 Step 1 (`**Range form (`) and Task 2 Step 1 (`### Read-back verification`) introduce.
- Produces: nothing consumed by a later task — this is the terminal verification task.

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';

// Prose-pin for /specify's range-form input and shaping-mode's read-back
// verification step (refs #705). Both are documented in prose only (skill
// markdown), so a later slimming pass could silently drop either without any
// test noticing — mirrors tests/specify-batch-input.test.js's rationale for
// the comma-list form these two build on.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

test('specify SKILL.md documents the #A-#B/#A–#B range form and its expansion rule', () => {
  const src = readFlat('skills/specify/SKILL.md');
  assert.ok(src.includes('**Range form (`#A-#B`/`#A–#B` — shaping-mode-only).**'), 'Range form paragraph marker missing from SKILL.md');
  assert.ok(src.includes('expands to the equivalent comma-joined list'), 'range-to-comma-list expansion rule missing from SKILL.md');
  assert.ok(src.includes('A` must be less than or equal to `B`'), 'A <= B validation rule missing from SKILL.md');
});

test('specify SKILL.md wires range expansion into the batch-branch resolution bullet', () => {
  const src = readFlat('skills/specify/SKILL.md');
  assert.ok(src.includes('first, expand a range-form first argument'), 'batch-branch bullet does not mention range expansion');
  // The pre-existing sequential-per-element rule this task must not disturb:
  assert.ok(src.includes('a loop never a fan-out (no Task dispatch, one record at a time)'), 'pre-existing sequential-per-element rule was disturbed');
});

test('shaping-mode.md documents mandatory read-back verification after each record write', () => {
  const src = readFlat('skills/specify/shaping-mode.md');
  assert.ok(src.includes('### Read-back verification'), 'Read-back verification subsection missing from shaping-mode.md');
  assert.ok(src.includes('re-fetch the record fresh'), 'read-back re-fetch rule missing');
  assert.ok(src.includes('does **not** roll back the write or stop the batch'), 'read-back failure-isolation rule missing');
  for (const token of ['`ready` is present', 'five spec-shaped sections', 'No unresolved placeholder marker']) {
    assert.ok(src.includes(token), `read-back assertion "${token}" missing`);
  }
  // The pre-existing outcome vocabulary this task must not disturb:
  assert.ok(src.includes('no `skipped` outcome'), 'pre-existing stop-all rationale for the missing skipped outcome was disturbed');
});
```

- [ ] **Step 2: Run the new test to verify it passes**

Run: `node --test tests/specify-range-form-readback.test.js`
Expected: PASS, 3/3 tests (this is a prose pin against text Tasks 1-2 already wrote — it should pass immediately, not go red-then-green; that is expected for a documentation-only pin written after its target prose exists).

- [ ] **Step 3: Run the full targeted suite plus the pre-existing pins**

Run: `node --test tests/specify-batch-input.test.js tests/batch-ref-argument.test.js tests/specify-range-form-readback.test.js tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js`
Expected: PASS, all tests — confirms Task 1/2's edits did not disturb argument-hint sync (untouched by this plan) or any other pinned specify prose.

- [ ] **Step 4: Commit**

```bash
git add tests/specify-range-form-readback.test.js
git commit -m "Add prose-pin tests for specify's range form and shaping-mode's read-back verification (refs #705)"
```

---

### Task 4: Full suite verification

**Files:** none (verification-only task, no changes)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, 0 failures (per CLAUDE.md, a run-to-run failure-count variance on identical code tracks machine load from sibling concurrent sessions, not a regression — re-run only the affected file(s) in isolation before concluding anything is actually broken).
