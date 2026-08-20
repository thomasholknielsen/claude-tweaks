# Per-Record ceremony-check/framing-check Invocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "one `ceremony-check`/`framing-check` invocation per record" rule structurally checkable instead of prose-only, so a batch run can no longer collapse to one invocation each while stamping divergent per-record verdicts.

**Architecture:** Prose-only change across four skill files plus one new pinning test. `framing-check` mode (`skills/challenge/SKILL.md`) gains an optional `#{n}` attribution argument mirroring `ceremony-check`'s existing shape. `shaping-mode.md`'s batch loop states the per-record rule explicitly and adds a self-check before its write pass. `record-creation.md`'s per-sub-issue loop states the same rule for its bare-call case (no sub-issue number exists yet) and adds its own self-check before the create call. `ceremony-check.md` gets a one-line citation of the same rule pointing at `SKILL.md`'s Input section. A new `node --test` conformance test pins all four files' wording so they cannot silently drift apart.

**Tech Stack:** Markdown skill prose; `node --test` (no external deps).

**Spec:** `.claude-tweaks/pipelines/20260817T181416-spec-708/work/708-spec.md` (record #708)

## Global Constraints

- `npm test` must be green at the end (Acceptance Criteria #5).
- No behavioral change to single-record shaping or single-sub-issue decomposition (Acceptance Criteria #6) — every edit is additive prose (a new sentence, a changed `args:` string, a new self-check paragraph); nothing existing is removed or restructured.
- This is a docs/prose-only change (`surface: backend`) plus one new test file — no implementation code to modify.
- Don't scope-creep into unrelated batch-loop or sub-issue-creation mechanics in either `shaping-mode.md` or `record-creation.md` (spec Gotcha).

---

### Task 1: Per-record invocation wording + pinning conformance test

**Files:**
- Modify: `skills/challenge/SKILL.md:4` (frontmatter `argument-hint`)
- Modify: `skills/challenge/SKILL.md:22-26` (`## Input` section)
- Modify: `skills/challenge/SKILL.md:32` (Mode: framing-check, "Called from" paragraph)
- Modify: `skills/specify/shaping-mode.md:108` (Framing bullet's `args:` string)
- Modify: `skills/specify/shaping-mode.md:111-113` (insert new paragraph before `### Compose-then-write-once`)
- Modify: `skills/specify/record-creation.md:137-139` (insert new paragraph after the Framing bullet, before Slug derivation)
- Modify: `skills/assess-agent-autonomy/ceremony-check.md:6` (append a sentence to the opening paragraph)
- Create: `tests/ceremony-framing-per-record-conformance.test.js`

**Interfaces:**
- Consumes: nothing — this task reads only existing skill prose files (no code imports).
- Produces: nothing consumed by later tasks — this is the only task in the plan.

- [ ] **Step 1: Write the conformance test (expected to fail against current prose)**

Create `tests/ceremony-framing-per-record-conformance.test.js`:

```javascript
// tests/ceremony-framing-per-record-conformance.test.js
// Pins the "one ceremony-check/framing-check invocation per record" wording
// across skills/specify/shaping-mode.md, skills/specify/record-creation.md,
// skills/challenge/SKILL.md, and skills/assess-agent-autonomy/ceremony-check.md
// so the four files cannot silently drift out of agreement with each other.
// See #708.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const CHALLENGE = read('skills/challenge/SKILL.md');
const SHAPING = read('skills/specify/shaping-mode.md');
const RECORD_CREATION = read('skills/specify/record-creation.md');
const CEREMONY_CHECK = read('skills/assess-agent-autonomy/ceremony-check.md');

test('challenge/SKILL.md argument-hint documents framing-check\'s optional #{n}', () => {
  assert.ok(
    CHALLENGE.includes('argument-hint: "framing-check [#<n>] | #<n> | --lens=<n[,n...]> <#n|topic|problem statement>"'),
    'argument-hint frontmatter must document the optional #{n} suffix on framing-check'
  );
});

test('challenge/SKILL.md framing-check mode states the per-record #{n} invocation rule', () => {
  assert.ok(
    CHALLENGE.includes('one `framing-check #{n}` invocation per record'),
    'Mode: framing-check must state the per-record #{n} invocation rule'
  );
  assert.ok(
    CHALLENGE.includes('the identical pre-numbering exception `ceremony-check` already documents'),
    'Mode: framing-check must cite ceremony-check\'s existing pre-numbering exception for record-creation.md\'s bare call'
  );
});

test('shaping-mode.md invokes framing-check with #{n} attribution', () => {
  assert.ok(
    SHAPING.includes('args: "framing-check #{n}"'),
    'shaping-mode.md\'s Framing bullet must pass #{n} to framing-check'
  );
});

test('shaping-mode.md states the per-record self-check before compose-then-write-once', () => {
  const selfCheckIdx = SHAPING.indexOf('**Self-check before writing:**');
  const composeIdx = SHAPING.indexOf('### Compose-then-write-once');
  assert.ok(selfCheckIdx >= 0, 'shaping-mode.md must contain a "Self-check before writing:" paragraph');
  assert.ok(composeIdx >= 0, 'shaping-mode.md must still contain "### Compose-then-write-once"');
  assert.ok(selfCheckIdx < composeIdx, 'the self-check must appear before Compose-then-write-once');
});

test('record-creation.md states the per-sub-issue self-check before the create call', () => {
  const selfCheckIdx = RECORD_CREATION.indexOf('**Self-check before creating:**');
  const createCallIdx = RECORD_CREATION.indexOf('SUB_ISSUE_URL=$(gh issue create');
  assert.ok(selfCheckIdx >= 0, 'record-creation.md must contain a "Self-check before creating:" paragraph');
  assert.ok(createCallIdx >= 0, 'record-creation.md must still contain the sub-issue create call');
  assert.ok(selfCheckIdx < createCallIdx, 'the self-check must appear before the create call');
  assert.ok(
    RECORD_CREATION.includes('`framing-check` mirrors it here for the identical reason'),
    'record-creation.md must explicitly extend ceremony-check\'s bare-call reasoning to framing-check'
  );
});

test('ceremony-check.md documents the per-record #{n} invocation rule citing SKILL.md', () => {
  assert.ok(
    CEREMONY_CHECK.includes('one `ceremony-check #{n}` invocation per record'),
    'ceremony-check.md must state the per-record #{n} invocation rule'
  );
});

test('record-creation.md and ceremony-check.md each cite assess-agent-autonomy/SKILL.md\'s Input section for the bare-call exception', () => {
  assert.ok(
    RECORD_CREATION.includes('`assess-agent-autonomy/SKILL.md`\'s Input section'),
    'record-creation.md must cite assess-agent-autonomy/SKILL.md\'s Input section for the pre-numbering exception'
  );
  assert.ok(
    CEREMONY_CHECK.includes('`SKILL.md`\'s Input section'),
    'ceremony-check.md must cite SKILL.md\'s Input section (same-directory relative reference) for the pre-numbering exception'
  );
});
```

- [ ] **Step 2: Run the new test file and confirm it fails**

Run: `node --test tests/ceremony-framing-per-record-conformance.test.js`
Expected: FAIL — every test in the file fails because none of the four source files carry the new wording yet. Confirms the test can go red before trusting it green.

- [ ] **Step 3: Edit `skills/challenge/SKILL.md`**

Replace the frontmatter `argument-hint` line:

```
replacing: argument-hint: "framing-check | #<n> | --lens=<n[,n...]> <#n|topic|problem statement>"
with: argument-hint: "framing-check [#<n>] | #<n> | --lens=<n[,n...]> <#n|topic|problem statement>"
```

Replace the `## Input` section's first two paragraphs (currently):

```
`$ARGUMENTS` is the literal `framing-check`, a bare record reference (`#42`), or `--lens=<n[,n...]>` followed by a work record reference (`#42`), a topic, or a problem statement.

The three forms are mutually exclusive. `framing-check` takes no further arguments — its input is the record body the caller already holds in memory. A bare record reference with no `--lens=` prefix selects the evidence-or-accept-risk mode below.
```

with:

```
`$ARGUMENTS` is the literal `framing-check` (optionally followed by `#{n}`), a bare record reference (`#42`), or `--lens=<n[,n...]>` followed by a work record reference (`#42`), a topic, or a problem statement.

The three forms are mutually exclusive, distinguished by the leading token: a literal `framing-check` prefix always selects that mode, a bare `#{n}` with no such prefix selects the evidence-or-accept-risk mode below. `framing-check`'s own input is the record body the caller already holds in memory — the optional trailing `#{n}` carries no fetch, it exists only for attribution (see Mode: framing-check below), mirroring `/claude-tweaks:assess-agent-autonomy`'s `ceremony-check #{n}` convention (`assess-agent-autonomy/SKILL.md`'s Input section).
```

In the `## Mode: framing-check` section, replace the "Called from" paragraph (currently):

```
**Called from:** `/claude-tweaks:specify`'s two record-creation paths — `shaping-mode.md`'s single-record path and `record-creation.md`'s per-sub-issue loop — immediately alongside the existing `ceremony-check` invocation. Every record, every run, no pre-filtering.
```

with:

```
**Called from:** `/claude-tweaks:specify`'s two record-creation paths — `shaping-mode.md`'s single-record path and `record-creation.md`'s per-sub-issue loop — immediately alongside the existing `ceremony-check` invocation. Every record, every run, no pre-filtering — one `framing-check #{n}` invocation per record (bare `framing-check`, no trailing `#{n}`, only in `record-creation.md`'s per-sub-issue loop, which has no issue number yet at that point in the procedure — the identical pre-numbering exception `ceremony-check` already documents). The optional `#{n}` carries no fetch and changes no judgment — it exists solely so a rendered verdict can be tied back to the invocation that produced it in a multi-record run's transcript.
```

- [ ] **Step 4: Edit `skills/specify/shaping-mode.md`**

Replace the Framing bullet's `args:` string (currently on the line beginning `- **Framing** — invoke`):

```
replacing: Skill(skill: "claude-tweaks:challenge", args: "framing-check")
with: Skill(skill: "claude-tweaks:challenge", args: "framing-check #{n}")
```

Insert a new paragraph immediately after the `- **ready**` bullet (the last bullet in the "Stamp scoring and stage labels" list) and immediately before the `### Compose-then-write-once` heading:

```
**Per-record invocation (batch runs).** On a comma-list batch, this section's `ceremony-check #{n}` and `framing-check #{n}` invocations above run once per record, inside this per-record loop — never reused, never rendered from memory for a later record in the same batch. **Self-check before writing:** confirm exactly one `ceremony-check #{n}` and one `framing-check #{n}` Skill invocation exist for this record before the compose-then-write-once pass below — a divergent ceremony or framing verdict across records in the same batch is only valid when each record had its own invocation.
```

- [ ] **Step 5: Edit `skills/specify/record-creation.md`**

Insert a new paragraph immediately after the Framing bullet (the line beginning `**Framing** — invoke`) and immediately before the `**Slug derivation**` paragraph:

```
**Per-sub-issue invocation.** Both the Ceremony and Framing calls above run once per sub-issue, inside this per-sub-issue loop — `#{n}` is omitted from both (`ceremony-check`'s own documented pre-numbering exception, `assess-agent-autonomy/SKILL.md`'s Input section; `framing-check` mirrors it here for the identical reason — no sub-issue number exists until the create call further below) — never reused or rendered from memory for a later sub-issue in the same decomposition. **Self-check before creating:** confirm exactly one bare `ceremony-check` and one bare `framing-check` Skill invocation exist for this sub-issue before the create call below — a divergent verdict across sub-issues in the same decomposition is only valid when each sub-issue had its own invocation.
```

- [ ] **Step 6: Edit `skills/assess-agent-autonomy/ceremony-check.md`**

In the opening paragraph (the one ending "no pre-filtering to \"borderline\" records."), append a new sentence so the paragraph reads:

```
replacing: stamping. Every sub-issue/single record, every `/specify` run, no pre-filtering to "borderline" records.
with: stamping. Every sub-issue/single record, every `/specify` run, no pre-filtering to "borderline" records — one `ceremony-check #{n}` invocation per record (bare `ceremony-check`, no trailing `#{n}`, only in decomposition mode's per-sub-issue loop, which has no issue number yet — `SKILL.md`'s Input section documents the exception in full).
```

- [ ] **Step 7: Run the conformance test again and confirm it passes**

Run: `node --test tests/ceremony-framing-per-record-conformance.test.js`
Expected: PASS — all 7 tests green.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in any other suite (this task touched only prose files plus one new, additive test file).

- [ ] **Step 9: Commit**

```bash
git add skills/challenge/SKILL.md skills/specify/shaping-mode.md skills/specify/record-creation.md skills/assess-agent-autonomy/ceremony-check.md tests/ceremony-framing-per-record-conformance.test.js
git commit -m "specify: make per-record ceremony-check/framing-check invocation checkable, not prose-only"
```
