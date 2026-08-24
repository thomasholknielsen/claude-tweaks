# framing-check: weigh supplied ## Gotchas evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `framing-check`'s Step 1 (Gather) read the record body's `## Gotchas` evidence bullets (written by the bare-`#N` supply-evidence action) and Step 2 (Judge) treat a `supported` evidence bullet's cited `file:line` as signal toward `open`, so re-shaping a record whose framing text is unchanged no longer blindly re-derives `solution-baked` once justifying evidence has been supplied.

**Architecture:** Two prose edits to `plugin/skills/challenge/SKILL.md`'s `framing-check` mode (Step 1 gains a bullet naming `## Gotchas` evidence bullets; Step 2 gains a paragraph that weighs a `supported` bullet toward `open`, strictly one-directional), pinned by one new conformance test asserting the exact wording landed and that the existing ambiguity-resolves-to-`open` rule is untouched.

**Tech Stack:** Markdown skill prose; `node --test` conformance test (plain `fs.readFileSync` + `assert.ok(...includes(...))`, this repo's `skill-prose-conformance-tests` convention).

**Spec:** GitHub issue #772 (materialized at `.claude-tweaks/pipelines/2026-08-24T055753-record-772/work/772-spec.md` in this worktree)

## Global Constraints

- Widening what counts as evidence must stay strictly one-directional: it may only move a verdict toward `open`, never manufacture or strengthen a `solution-baked` flag (issue's Gotchas section; SKILL.md's own Anti-Patterns table row "Resolving `framing-check` ambiguity toward `solution-baked` \"to be conservative\"").
- The evidence-bullet shape (`- evidence ({YYYY-MM-DD}): {classification} — {citation}`) and its classification vocabulary (`supported`, `contradicted`, `no evidence found`) are already defined by the bare-`#N` mode's Step 3/Step 4 (`plugin/skills/challenge/SKILL.md` lines ~80, ~91) — reuse them verbatim, do not invent new terms.
- `npm test` must stay green (issue Acceptance Criterion 3).

---

### Task 1: Add `## Gotchas` evidence-bullet reading to `framing-check` Step 1 (Gather)

**Files:**
- Modify: `plugin/skills/challenge/SKILL.md:36-41` (the `### Step 1: Gather` block)
- Test: `tests/framing-check-gotchas-evidence-conformance.test.js` (new)

**Interfaces:**
- Consumes: nothing — this is a standalone prose edit to an existing, already-shipped section.
- Produces: the literal substring `The body's \`## Gotchas\` section, when present` inside `framing-check`'s Step 1 text — Task 2's edit and the conformance test both key off Step 1 preceding Step 2 in file order, not off this exact string, so no other task consumes this string directly.

- [ ] **Step 1: Write the failing test**

Create `tests/framing-check-gotchas-evidence-conformance.test.js`:

```javascript
// tests/framing-check-gotchas-evidence-conformance.test.js
// Pins the framing-check mode's evidence-aware Gather/Judge wording added for #772:
// Step 1 (Gather) now names the body's ## Gotchas evidence bullets, and Step 2 (Judge)
// weighs a `supported` evidence bullet toward `open`, one-directionally only. See #772.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const CHALLENGE = fs.readFileSync(path.join(REPO_ROOT, 'plugin/skills/challenge/SKILL.md'), 'utf8');

const step1Idx = CHALLENGE.indexOf('### Step 1: Gather');
const step2Idx = CHALLENGE.indexOf('### Step 2: Judge');
const step3Idx = CHALLENGE.indexOf('### Step 3: Render');

test('framing-check Step 1 (Gather) names the body\'s ## Gotchas evidence bullets', () => {
  assert.ok(step1Idx >= 0 && step2Idx > step1Idx, 'Step 1 and Step 2 headings must both be present and in order');
  const step1Text = CHALLENGE.slice(step1Idx, step2Idx);
  assert.ok(
    step1Text.includes('## Gotchas'),
    'Step 1 (Gather) must name the ## Gotchas section as something it reads'
  );
  assert.ok(
    step1Text.includes('- evidence ({date}): {classification} — {citation}'),
    'Step 1 (Gather) must name the evidence-bullet shape the bare-#N mode writes'
  );
  assert.ok(
    step1Text.includes('Missing section or no matching bullets: no signal'),
    'Step 1 (Gather) must state the no-signal fallback so a record with no evidence bullets is unaffected'
  );
});

test('framing-check Step 2 (Judge) weighs a supported evidence bullet toward open, one-directionally', () => {
  assert.ok(step2Idx >= 0 && step3Idx > step2Idx, 'Step 2 and Step 3 headings must both be present and in order');
  const step2Text = CHALLENGE.slice(step2Idx, step3Idx);
  assert.ok(
    step2Text.includes('Weighing supplied `## Gotchas` evidence'),
    'Step 2 (Judge) must state the evidence-weighing rule'
  );
  assert.ok(
    step2Text.includes('classified `supported` with a real `file:line` citation'),
    'Step 2 (Judge) must key the weighing rule on the supported classification with a real citation'
  );
  assert.ok(
    step2Text.includes('it counts toward `open`'),
    'Step 2 (Judge) must state the supported bullet counts toward open'
  );
  assert.ok(
    step2Text.includes('This only ever moves a verdict toward `open`'),
    'Step 2 (Judge) must state the one-directional constraint explicitly'
  );
  assert.ok(
    step2Text.includes('a `contradicted` or `no evidence found` bullet') &&
    step2Text.includes('adds no signal'),
    'Step 2 (Judge) must state that a contradicted/no-evidence-found bullet, or no bullet at all, adds no signal'
  );
});

test('framing-check Step 2 (Judge) still states the ambiguity-resolves-to-open rule, after the new weighing paragraph', () => {
  const weighIdx = CHALLENGE.indexOf('Weighing supplied `## Gotchas` evidence');
  const ambiguityIdx = CHALLENGE.indexOf('**Ambiguity resolves to `open`.**');
  assert.ok(weighIdx >= 0, 'the weighing paragraph must be present');
  assert.ok(ambiguityIdx >= 0, 'the pre-existing ambiguity-resolves-to-open rule must still be present, untouched');
  assert.ok(weighIdx < ambiguityIdx, 'the weighing paragraph must precede the untouched ambiguity rule, per the plan\'s insertion point');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/framing-check-gotchas-evidence-conformance.test.js`
Expected: FAIL — none of the new substrings exist yet in `plugin/skills/challenge/SKILL.md` (all three tests fail their first `assert.ok`).

- [ ] **Step 3: Edit `plugin/skills/challenge/SKILL.md`'s Step 1 (Gather)**

Find this exact block (currently lines 36-41):

```markdown
### Step 1: Gather

No fetch. Read what the caller already has in memory:

- The composed record body — `## Current State`, `## Deliverables`, `## Acceptance Criteria`.
- In shaping mode, the preserved `## Original request` block. This is the un-reframed source text and is the stronger framing signal, because shaping may already have laundered solution-baked phrasing into neutral spec prose. Judge both; weight the original request higher where they disagree.
```

Replace it with (adds one bullet, everything else unchanged):

```markdown
### Step 1: Gather

No fetch. Read what the caller already has in memory:

- The composed record body — `## Current State`, `## Deliverables`, `## Acceptance Criteria`.
- In shaping mode, the preserved `## Original request` block. This is the un-reframed source text and is the stronger framing signal, because shaping may already have laundered solution-baked phrasing into neutral spec prose. Judge both; weight the original request higher where they disagree.
- The body's `## Gotchas` section, when present — specifically any evidence bullets matching `- evidence ({date}): {classification} — {citation}` (the shape the bare-`#N` mode's supply-evidence action writes; see that mode's Step 4). Missing section or no matching bullets: no signal, proceed exactly as before this bullet existed.
```

- [ ] **Step 4: Edit `plugin/skills/challenge/SKILL.md`'s Step 2 (Judge)**

Find this exact paragraph (currently mid Step 2, right after the three-bullet `solution-baked` checklist):

```markdown
Naming a solution is not itself the defect. A record that names a technology **and** justifies it from observed evidence is `open`. What makes a framing baked is a solution that was never traded off.

**Ambiguity resolves to `open`.**
```

Replace it with (inserts one new paragraph between the two; the `**Ambiguity resolves to \`open\`.**` sentence and everything after it on that line is unchanged — only reproduced here to anchor the insertion point):

```markdown
Naming a solution is not itself the defect. A record that names a technology **and** justifies it from observed evidence is `open`. What makes a framing baked is a solution that was never traded off.

**Weighing supplied `## Gotchas` evidence.** When Step 1 gathered an evidence bullet classified `supported` with a real `file:line` citation for a named assumption underpinning the framing's solution, treat that citation as the observed evidence the checks above ask for — it counts toward `open`, the same as if the Current State itself had cited it. This only ever moves a verdict toward `open`: a `contradicted` or `no evidence found` bullet, an accepted-risk bullet, or the complete absence of any evidence bullet adds no signal and leaves the checks above exactly as they read without this paragraph.

**Ambiguity resolves to `open`.**
```

(Leave the rest of that sentence and the remainder of Step 2 exactly as it already reads — this task only inserts the one new paragraph between the two shown.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/framing-check-gotchas-evidence-conformance.test.js`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/challenge/SKILL.md tests/framing-check-gotchas-evidence-conformance.test.js
git commit -m "framing-check: weigh supplied ## Gotchas evidence when re-judging a record (refs #772)"
```

---

### Task 2: Full-suite verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: Task 1's committed changes.
- Produces: nothing further.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — 0 failures. This confirms Acceptance Criterion 3 and that no other test (e.g. any test asserting the pre-edit exact text of Step 1/Step 2, or the total line count of `plugin/skills/challenge/SKILL.md`) broke.

- [ ] **Step 2: If any unrelated failure appears**

Per this repo's documented flake tolerance (CLAUDE.md Commands section): re-run only the affected file(s) in isolation (`node --test path/to/file.test.js`) before concluding anything is broken. A failure in a file untouched by this plan's diff that passes in isolation is machine-load flake, not a regression — do not modify code to chase it.

- [ ] **Step 3: No commit needed for this task**

This task is verification-only; Task 1's commit already covers the code change. If Step 1 uncovers a real regression, fix it, re-run, and commit the fix separately with a message describing the fix (not folded into Task 1's commit).

## Self-Review Notes

- **Spec coverage:** Deliverable 1 (Gather + Judge changes) → Task 1 Steps 3-4. Deliverable 2 (ambiguity rule intact) → Task 1's Step 4 edit leaves the `**Ambiguity resolves to \`open\`.**` sentence untouched, and the conformance test's third case pins that it still follows the new paragraph. Deliverable 3 (conformance pin) → Task 1 Steps 1-2/5 (the new test file). AC1 (verdict opens when evidence supports) → the Step 2 weighing paragraph's `supported` branch. AC2 (no evidence bullets → behaves as today) → both edits' explicit "no signal" fallback language, and the test's second case's `contradicted`/absence assertion. AC3 (`npm test` green) → Task 2.
- **Placeholder scan:** No TBD/TODO; both prose edits are the actual final wording, not descriptions of wording to add later.
- **Type consistency:** N/A — no code types involved; the only "interface" reused across tasks is the literal evidence-bullet shape and classification vocabulary already defined by the bare-`#N` mode (Step 3/Step 4 of that mode), copied verbatim rather than restated with different wording.
