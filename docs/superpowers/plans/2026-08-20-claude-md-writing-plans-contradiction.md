# CLAUDE.md writing-plans contradiction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the self-contradicting sentence in `skills/init/claude-md-template.md`'s "claude-tweaks Pipeline" section (and its dogfooded copy in this repo's own root `CLAUDE.md`) that currently claims `/superpowers:writing-plans` is skipped outright, when `/claude-tweaks:build`'s Spec Step 3 invokes it for every record — and pin the corrected wording with a conformance test.

**Architecture:** Two plain-text sentence edits (template + root CLAUDE.md, kept byte-identical for the sentence in question) plus one new `node --test` assertion in the existing conformance suite that reads the live template file and fails on the old wording, passes on the new.

**Tech Stack:** Markdown (skill/config prose), `node --test` (existing conformance test harness — `bin/lib/init/claude-md-conformance.js`'s `splitSections`/`extractTemplateBody`).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T061529-record-643/work/643-spec.md` (materialized from GitHub issue #643)

## Global Constraints

- The fix is a narrow wording change, not a rewrite of the "claude-tweaks Pipeline" section — keep the sentence concise and consistent with the surrounding paragraph's style (spec Gotchas).
- Both `skills/init/claude-md-template.md` and the root `CLAUDE.md` need the identical corrected sentence — a fix to only one leaves the dogfooded copy stale (spec Gotchas).
- Re-verify exact line numbers before editing — the spec's cited line 81/129 are as observed at filing time (2026-08-17) and may have shifted (spec Gotchas). Confirmed at plan-authoring time (2026-08-20): both files currently carry the sentence at `skills/init/claude-md-template.md:81` and `CLAUDE.md:129`, byte-identical.
- Reuse the accurate rule's existing phrasing from `skills/specify/SKILL.md`'s Background section (line ~141: "`/superpowers:writing-plans` produces multi-phase plan files (`*-P1.md`, `*-P2.md`, …) that exceed `/flow`'s envelope") rather than inventing new language (spec Technical Approach).

---

### Task 1: Add the failing conformance test, then fix the template sentence

**Files:**
- Modify: `tests/bin-lib/init/claude-md-conformance.test.js` (add one test, after the existing `'the live template still ends with Don\'ts...'` test around line 137)
- Modify: `plugin/skills/init/claude-md-template.md:81`

**Interfaces:**
- Consumes: `splitSections`, `extractTemplateBody` (already imported in the test file from `../../../plugin/bin/lib/init/claude-md-conformance`), and the existing `TEMPLATE` path constant (already defined in the test file, resolving to `plugin/skills/init/claude-md-template.md`).
- Produces: nothing new for later tasks — Task 2 only needs to know the corrected sentence text (below), which it applies verbatim to a second file.

The exact corrected sentence (identical in both files, replacing the last sentence of the `**Artifacts:**` line):

```
No multi-phase plan files (`*-P1.md`, `*-P2.md`, …); a single plan per spec via `/superpowers:writing-plans`, stopped before its execution-choice offer, is expected and normal.
```

Full corrected line (replaces the current line verbatim, keeping the first sentence unchanged):

```
**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No multi-phase plan files (`*-P1.md`, `*-P2.md`, …); a single plan per spec via `/superpowers:writing-plans`, stopped before its execution-choice offer, is expected and normal.
```

- [ ] **Step 1: Write the failing test**

Open `tests/bin-lib/init/claude-md-conformance.test.js`. Immediately after the existing test block:

```js
test('the live template still ends with Don\'ts — the fence is unambiguous', () => {
  // Guards the Plan A dependency: while the Project Defaults block existed, its
  // same-length inner fence truncated extraction here and Don'ts never appeared.
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const names = [...splitSections(extractTemplateBody(src)).keys()];
  assert.strictEqual(names[names.length - 1], "Don'ts");
});
```

add this new test:

```js
test('claude-tweaks Pipeline section does not forbid /superpowers:writing-plans outright — only multi-phase plan files', () => {
  // #643: the sentence used to read "No phase-plan files; skip
  // `/superpowers:writing-plans`." — read literally, that forbids the skill
  // /claude-tweaks:build's own Spec Step 3 invokes for every record. The
  // accurate rule (skills/specify/SKILL.md's Background section) only
  // forbids *multi-phase* plan files (*-P1.md, *-P2.md, ...); a single plan
  // per spec is normal. This pins the corrected wording so the contradiction
  // cannot silently regress.
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const sections = splitSections(extractTemplateBody(src));
  const pipeline = sections.get('claude-tweaks Pipeline');
  assert.ok(pipeline, 'claude-tweaks Pipeline section must exist in the live template');
  assert.doesNotMatch(
    pipeline,
    /no phase-plan files;\s*skip/i,
    'must not claim /superpowers:writing-plans is skipped/forbidden outright',
  );
  assert.match(
    pipeline,
    /multi-phase plan files/i,
    'must state the narrower multi-phase-file restriction instead',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/init/claude-md-conformance.test.js`
Expected: FAIL — the new test's `assert.doesNotMatch` assertion fails, because the live template still reads "No phase-plan files; skip `/superpowers:writing-plans`." at line 81 (matches the forbidden pattern; also lacks "multi-phase plan files").

- [ ] **Step 3: Fix the template sentence**

In `plugin/skills/init/claude-md-template.md`, replace line 81 (re-verify the line number with `grep -n "No phase-plan files" plugin/skills/init/claude-md-template.md` before editing, in case it has shifted):

Replacing:
```
**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No phase-plan files; skip `/superpowers:writing-plans`.
```

With:
```
**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No multi-phase plan files (`*-P1.md`, `*-P2.md`, …); a single plan per spec via `/superpowers:writing-plans`, stopped before its execution-choice offer, is expected and normal.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/init/claude-md-conformance.test.js`
Expected: PASS — all tests in the file green, including the new one.

- [ ] **Step 5: Commit**

```bash
git add tests/bin-lib/init/claude-md-conformance.test.js plugin/skills/init/claude-md-template.md
git commit -m "Fix claude-md-template.md's writing-plans contradiction — narrow to multi-phase files only

refs #643"
```

---

### Task 2: Apply the identical fix to this repo's own root CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:129`

**Interfaces:**
- Consumes: the corrected sentence text produced by Task 1, applied verbatim (byte-identical) to this second file.
- Produces: nothing for later tasks — this is the last task.

- [ ] **Step 1: Locate and replace the sentence**

Re-verify the line number first: `grep -n "No phase-plan files" CLAUDE.md`. Replace that line (the same sentence, in the root CLAUDE.md's own "claude-tweaks Pipeline" section — this file is a generated/dogfooded copy of the template, not imported at runtime, so it needs its own edit):

Replacing:
```
**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No phase-plan files; skip `/superpowers:writing-plans`.
```

With:
```
**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No multi-phase plan files (`*-P1.md`, `*-P2.md`, …); a single plan per spec via `/superpowers:writing-plans`, stopped before its execution-choice offer, is expected and normal.
```

- [ ] **Step 2: Confirm no residual self-contradiction**

Run: `grep -n "No phase-plan files; skip" CLAUDE.md plugin/skills/init/claude-md-template.md`
Expected: no matches in either file (empty output).

- [ ] **Step 3: Run the full conformance test file once more**

Run: `node --test tests/bin-lib/init/claude-md-conformance.test.js`
Expected: PASS (unaffected by this task — root `CLAUDE.md` is not read by this suite — but confirms Task 1's fix is still intact).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions elsewhere (root `CLAUDE.md` is not directly asserted against by any test as far as this plan's grep in Task 1/Step 2 shows, but the acceptance criteria require the full suite green).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Fix root CLAUDE.md's writing-plans contradiction to match the corrected template

refs #643"
```

---

## Self-Review Notes

- **Spec coverage:** Deliverable 1 (template wording) → Task 1. Deliverable 2 (root CLAUDE.md) → Task 2. Deliverable 3 (conformance test) → Task 1 Step 1. Acceptance criteria 1-2 (no self-contradiction, either file) → Task 1 Step 3 + Task 2 Step 1-2. Acceptance criterion 3 (test fails pre-fix, passes post-fix) → Task 1 Steps 2 and 4. Acceptance criterion 4 (`npm test` passes) → Task 2 Step 4.
- **Placeholder scan:** none — every step has literal, runnable content.
- **Type consistency:** n/a (prose/test-only change, no shared function signatures across tasks).
