# Specify Parent-Record Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shaping mode refuses decomposition-parent records — two detection tiers, silent residue cleanup, batch/headless refusal — pinned by a new conformance suite.

**Architecture:** Prose-only change to four shipped skill files plus one new `node --test` conformance suite. The guard lives in `plugin/skills/specify/SKILL.md` Resolve-the-input case 1, before the `needs:definition` redirect; the batch branch, case 5, and `next-mode.md` cite it; `shaping-mode.md` and `_shared/work-record.md` carry the label-removal carve-out. Tests follow the live-corpus pattern (read the shipped markdown, assert content + relative ordering).

**Tech Stack:** Markdown skill prose; Node built-in test runner (`node --test`), no external deps.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T154424-spec-1071/work/1071-spec.md`

## Global Constraints

- Never write the literal placeholder tokens the spec-shaped-body check greps for (spell them as "deferred-work markers" if needed) anywhere in composed prose.
- The residue-strip label set is exactly `ready`, `risk:*`, `size:*`, `ceremony:*`, `solution:unjustified` — never `type:*`/`priority:*`/`auto:*`/`bot:*`.
- The `## Leaves` sniff is always described as line-anchored (`^## Leaves`), never a substring test.
- Do not disturb text pinned by existing suites: `tests/specify-batch-input.test.js`, `tests/specify-range-form-readback.test.js` (e.g. the "Range-shaped rejection point" clause, "a loop never a fan-out (no Task dispatch, one record at a time)"), `tests/specify-next-mode.test.js` (e.g. the literal eligibility phrase "carrying none of `ready`, `needs:definition`, `parked`, `parent-issue`, and `bot:in-progress`"), and `tests/ceremony-framing-per-record-conformance.test.js`.
- Run `node --test tests/specify-parent-guard.test.js` per task; the full `npm test` runs centrally at build verification, not inside tasks.

---

### Task 1: Guard paragraph, batch clause, case-5 citation, Anti-Patterns row in `SKILL.md` + new test file

**Files:**
- Modify: `plugin/skills/specify/SKILL.md` (case 1, ~lines 76-87; Anti-Patterns row ~line 157)
- Test: `tests/specify-parent-guard.test.js` (Create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the test file `tests/specify-parent-guard.test.js` with `ROOT`/`read`/`readFlat` helpers (identical shape to `tests/specify-range-form-readback.test.js`) that Tasks 2-4 append `test()` blocks to; the guard-paragraph terminology (`Parent-record guard`, `tier 1 (authoritative)`, `tier 2 (legacy sniff)`) that Tasks 2-4's prose cites.

- [ ] **Step 1: Write the failing test file**

Create `tests/specify-parent-guard.test.js`:

```js
'use strict';

// Prose-pin for /specify's parent-record guard (refs #1071). The guard is
// documented in prose only (skill markdown), so a later slimming pass could
// silently drop it without any test noticing — mirrors
// tests/specify-range-form-readback.test.js's rationale.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

test('specify SKILL.md case 1 defines the parent-record guard before the needs:definition redirect', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  const guardIdx = src.indexOf('**Parent-record guard (before the `needs:definition` check');
  const redirectIdx = src.indexOf('**`needs:definition` redirect (single-record path only).**');
  assert.ok(guardIdx !== -1, 'Parent-record guard paragraph marker missing from SKILL.md case 1');
  assert.ok(redirectIdx !== -1, 'needs:definition redirect paragraph missing from SKILL.md case 1');
  assert.ok(guardIdx < redirectIdx, 'parent-record guard must precede the needs:definition redirect within case 1');
});

test('specify SKILL.md defines exactly the two documented detection tiers', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('tier 1 (authoritative)'), 'tier 1 definition missing');
  assert.ok(src.includes('Tier 2 (legacy sniff)'), 'tier 2 definition missing');
  assert.ok(src.includes('driver-exclusive'), 'driver-exclusive label/facet clause missing');
  assert.ok(src.includes('line-anchored `## Leaves` heading'), 'line-anchored Leaves sniff definition missing');
});

test('specify SKILL.md tier-1 behavior: hard stop, static-prose leaves pointer, exact residue-strip set', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('hard stop, no prompt'), 'tier-1 hard-stop clause missing');
  assert.ok(src.includes('the guard makes no additional API call for this pointer'), 'static-prose/no-API-call leaves-pointer clause missing');
  assert.ok(src.includes('`ready`, `risk:*`, `size:*`, `ceremony:*`, `solution:unjustified`'), 'exact residue-strip label set missing');
  assert.ok(src.includes('silent means no prompt, never unreported'), 'strip-always-reported clause missing');
});

test('specify SKILL.md tier-2 behavior: repair/shape-anyway prompt, one-shot escape, headless refusal', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('stamp `parent-issue`'), 'tier-2 repair option missing');
  assert.ok(src.includes('one-shot escape'), 'one-shot shape-anyway escape missing');
  assert.ok(src.includes('nothing is persisted, so the guard re-prompts'), 'no-persisted-suppressor clause missing');
  assert.ok(src.includes('refuse without repair'), 'headless refuse-without-repair clause missing');
  assert.ok(src.includes("the skill's returned output under `--chained`"), 'chained refusal-delivery clause missing');
  assert.ok(src.includes("the firing's reported outcome under `next`"), 'next refusal-delivery clause missing');
});

test('specify SKILL.md batch branch fails all on a parent element and refuses tier-2 without prompting', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('A **parent element** (either tier) likewise fails the whole invocation'), 'batch parent-element fail-all clause missing');
  assert.ok(src.includes('a prompt could not change the batch'), 'batch tier-2 no-prompt rationale missing');
  assert.ok(src.includes('to repair interactively'), 'batch single-record repair pointer missing');
  assert.ok(src.includes('still runs; the failure message names any strip that ran'), 'batch strip-reporting clause missing');
});

test('specify SKILL.md case 5 fetches the matched record fully and applies the case-1 guard by reference', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes("the search's narrow field set above is for matching only"), 'case-5 full-fetch rationale missing');
  assert.ok(src.includes("apply case 1's **parent-record guard** by reference"), 'case-5 guard citation missing');
});

test('specify SKILL.md guard states its scope: every shaping entry, cases 2-4 out by construction', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('covers every shaping entry'), 'guard scope sentence missing');
  assert.ok(src.includes('out of guard scope by construction'), 'cases-2-4 exclusion clause missing');
});
```

- [ ] **Step 2: Run the new suite to verify it fails**

Run: `node --test tests/specify-parent-guard.test.js`
Expected: FAIL — every test red ("Parent-record guard paragraph marker missing" etc.).

- [ ] **Step 3: Edit `plugin/skills/specify/SKILL.md` — four edits**

**Edit 3a — insert the guard paragraph.** Immediately after the case-1 opening paragraph (the one ending `` …then `readRecord(path)` (`bin/lib/issues/local-store.js`; local-files driver). ``) and before the `needs:definition` redirect paragraph, insert (indented three spaces, as a sibling paragraph of the redirect):

```markdown
   **Parent-record guard (before the `needs:definition` check).** Immediately after this fetch, before any other check, test whether the target is a decomposition parent — two detection tiers, both read from data this fetch already returned: **tier 1 (authoritative)** — the `parent-issue` label (GitHub driver) / `facets.isParentIssue` (local-files driver); the two markers are driver-exclusive, so exactly one can ever be present on a record and no precedence rule is needed. **Tier 2 (legacy sniff)** — no tier-1 marker, but the fetched body contains a line-anchored `## Leaves` heading (`^## Leaves` — never a substring match, which would false-positive on prose merely mentioning the word). On a **tier-1 match**: hard stop, no prompt — never shape, and never enter the `needs:definition` redirect below (a parent's re-decomposition goes through its design doc, not this redirect). The stop message names the parent and points at its leaves as static prose only — the refs from the body's `## Leaves` table when present, else the record's own issue URL, where GitHub's UI renders the native sub-issue list; the guard makes no additional API call for this pointer. When the parent also carries mis-shape residue — any of `ready`, `risk:*`, `size:*`, `ceremony:*`, `solution:unjustified` — strip exactly those (never `type:*`/`priority:*`, legitimate on parents; never `auto:*`/`bot:*`, other skills' territory) in one `gh issue edit --remove-label …`/`writeRecord` call: silent means no prompt, never unreported — always name the strip in the guard's output, and log it per `_shared/auto-decision-log.md` when a run directory resolves. On a **tier-2 match**, interactively: stop and call one `AskUserQuestion` — option 1, repair (Recommended): stamp `parent-issue` (future runs hit tier 1) plus the same residue strip, then the tier-1 stop outcome; option 2, shape anyway: a one-shot escape for a sniff false-positive — nothing is persisted, so the guard re-prompts on any future invocation against the same record. On a **tier-2 match, headlessly** (the `next` form — case 0 — or `--chained`; both signals are already in hand, no new plumbing): refuse without repair, no prompt — the refusal is the skill's returned output under `--chained` and the firing's reported outcome under `next`, logged per `_shared/auto-decision-log.md` when a run directory resolves. Scope: the guard covers every shaping entry — this case's single-record path, the batch/range branch below, case 5's direct-shaping branch (by reference), and `next`'s shaping step; Resolve-the-input cases 2-4 resolve to decomposition mode, which creates parents deliberately and never enters shaping, so they are out of guard scope by construction.
```

**Edit 3b — re-anchor the redirect's opening (deictic).** In the `needs:definition` redirect paragraph, replace its second sentence opener:

replacing: `**\`needs:definition\` redirect (single-record path only).** Immediately after this fetch, check the fetched labels`
with: `**\`needs:definition\` redirect (single-record path only).** After the parent-record guard above passes (no parent detected), check the fetched labels`

**Edit 3c — batch clause.** In the "Absent `needs:definition`" paragraph's **Batch branch**:

replacing: `including the \`needs:definition\` check above, per element`
with: `including the parent-record guard and the \`needs:definition\` check above, per element`

and, immediately after the sentence `An element that is not a record reference fails the whole invocation with the one-line error \`## Input\` states; nothing is shaped.`, insert:

```markdown
A **parent element** (either tier) likewise fails the whole invocation — every offender named in one message, nothing shaped, mirroring the `needs:definition` posture above. A tier-2 (sniff-only) hit inside a batch resolves exactly like the guard's headless branch — refuse without repair, no prompt fires, because a prompt could not change the batch's fail-all outcome, only add ceremony — and the failure message points each tier-2 offender at the single-record form (`/claude-tweaks:specify #{element}`) to repair interactively. "Nothing shaped" means no record is rewritten into spec shape or stamped `ready`; a tier-1 offender's residue strip is repair of unambiguously wrong state, not shaping, and still runs; the failure message names any strip that ran.
```

**Edit 3d — case 5 full fetch + guard citation.** In Resolve-the-input case 5:

replacing: `If not: apply the identical \`needs:definition\` redirect case 1 defines`
with: `If not: fetch the matched record fully first (\`gh issue view {n} --json number,title,body,url,labels\`, or \`readRecord(path)\` — the search's narrow field set above is for matching only, and shaping plus the guard both need the body), apply case 1's **parent-record guard** by reference (not restated here), then the identical \`needs:definition\` redirect case 1 defines`

**Edit 3e — Anti-Patterns row.** In the Anti-Patterns table row "Marking a parent issue `ready`":

replacing: `a \`ready\` parent issue is a design summary that enters the authorization worklist as if buildable.`
with: `a \`ready\` parent issue is a design summary that enters the authorization worklist as if buildable. Case 1's parent-record guard is the mechanical stop — it refuses the shape and strips such residue.`

- [ ] **Step 4: Run the new suite to verify it passes**

Run: `node --test tests/specify-parent-guard.test.js`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Run the neighbor suites to verify nothing pinned was disturbed**

Run: `node --test tests/specify-batch-input.test.js tests/specify-range-form-readback.test.js tests/specify-next-mode.test.js tests/argument-hint-input.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/specify/SKILL.md tests/specify-parent-guard.test.js
git commit -m "Add parent-record guard to specify case 1 — two-tier detect, batch fail-all, case-5 full fetch (refs #1071)"
```

---

### Task 2: `shaping-mode.md` territory-line carve-out

**Files:**
- Modify: `plugin/skills/specify/shaping-mode.md` (final paragraph)
- Test: `tests/specify-parent-guard.test.js` (append)

**Interfaces:**
- Consumes: Task 1's test-file helpers and guard terminology.
- Produces: the carve-out sentence Task 4's matrix row mirrors.

- [ ] **Step 1: Append the failing test**

Append to `tests/specify-parent-guard.test.js`:

```js
test('shaping-mode.md territory line carries the parent-guard removal carve-out', () => {
  const src = readFlat('plugin/skills/specify/shaping-mode.md');
  assert.ok(src.includes('as the one removal carve-out'), 'territory-line carve-out clause missing from shaping-mode.md');
  assert.ok(src.includes('record bearing the parent marker'), 'parent-marker scoping missing from shaping-mode.md carve-out');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/specify-parent-guard.test.js`
Expected: FAIL — only the new test red.

- [ ] **Step 3: Edit `plugin/skills/specify/shaping-mode.md`**

In the file's final paragraph:

replacing: `` `/specify` adds `ready`, `risk:*`/`size:*` (when unstamped), and Type (when absent), removes `parked` on promotion, and never touches `auto:*` or `bot:*` ``
with: `` `/specify` adds `ready`, `risk:*`/`size:*` (when unstamped), and Type (when absent), removes `parked` on promotion — and, as the one removal carve-out, strips `ready`/`risk:*`/`size:*`/`ceremony:*`/`solution:unjustified` from a record bearing the parent marker (`parent-issue` label / `facets.isParentIssue`) when `SKILL.md` case 1's parent-record guard fires: cleanup of a past mis-shape, reported in output, never prompted — and never touches `auto:*` or `bot:*` ``

(The rest of the sentence — the `/backlog refine`/`/dispatch` territory clause — stays verbatim.)

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/specify-parent-guard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/specify/shaping-mode.md tests/specify-parent-guard.test.js
git commit -m "Carve parent-guard label removal out of shaping-mode's territory line (refs #1071)"
```

---

### Task 3: `next-mode.md` backstop sentence

**Files:**
- Modify: `plugin/skills/specify/next-mode.md` (eligibility rationale, after the `parent-issue`-exclusion sentence)
- Test: `tests/specify-parent-guard.test.js` (append)

**Interfaces:**
- Consumes: Task 1's guard terminology.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Append the failing test**

```js
test('next-mode.md names the shaping-time guard as the backstop for unlabeled legacy parents', () => {
  const src = readFlat('plugin/skills/specify/next-mode.md');
  assert.ok(src.includes('shaping-time backstop'), 'backstop sentence missing from next-mode.md');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/specify-parent-guard.test.js`
Expected: FAIL — only the new test red.

- [ ] **Step 3: Edit `plugin/skills/specify/next-mode.md`**

Immediately after the sentence ending `` a decomposition summary, never itself a shaping target (`_shared/work-record.md`'s Structure family). ``, insert:

```markdown
That exclusion is label-only and selection-time; an unlabeled legacy parent (a `## Leaves`-table body with no `parent-issue` label) passes it — `SKILL.md` case 1's parent-record guard is the shaping-time backstop that still refuses it here, headlessly, without repair.
```

Do not touch the pinned phrase `carrying none of \`ready\`, \`needs:definition\`, \`parked\`, \`parent-issue\`, and \`bot:in-progress\`` earlier in the same section.

- [ ] **Step 4: Run to verify it passes, plus the next-mode neighbor suite**

Run: `node --test tests/specify-parent-guard.test.js tests/specify-next-mode.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/specify/next-mode.md tests/specify-parent-guard.test.js
git commit -m "Name the shaping-time parent guard as next-mode's legacy-parent backstop (refs #1071)"
```

---

### Task 4: `_shared/work-record.md` permission-matrix carve-out

**Files:**
- Modify: `plugin/skills/_shared/work-record.md` (the `/specify` row of the permission matrix)
- Test: `tests/specify-parent-guard.test.js` (append)

**Interfaces:**
- Consumes: Task 2's carve-out wording (mirrored, not restated verbatim).
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Append the failing test**

```js
test('work-record.md permission matrix grants /specify the parent-guard removal carve-out', () => {
  const src = readFlat('plugin/skills/_shared/work-record.md');
  assert.ok(src.includes('parent-marked record only (case-1 parent-record guard cleanup'), 'permission-matrix carve-out missing from work-record.md');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/specify-parent-guard.test.js`
Expected: FAIL — only the new test red.

- [ ] **Step 3: Edit `plugin/skills/_shared/work-record.md`**

In the permission-matrix row for `/specify` (the row whose Removes cell currently reads `` `parked` (promotion) ``):

replacing: `` `parked` (promotion) ``
with: `` `parked` (promotion); `ready`/`risk:*`/`size:*`/`ceremony:*`/`solution:unjustified` from a parent-marked record only (case-1 parent-record guard cleanup — `skills/specify/SKILL.md`) ``

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/specify-parent-guard.test.js`
Expected: PASS (all 11 tests).

- [ ] **Step 5: Run the conformance neighbors that read work-record.md**

Run: `node --test tests/ceremony-framing-per-record-conformance.test.js tests/deferral-gate-conformance.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/_shared/work-record.md tests/specify-parent-guard.test.js
git commit -m "Grant /specify the parent-guard removal carve-out in the permission matrix (refs #1071)"
```
