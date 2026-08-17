# Specify Comma-List Batch Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/claude-tweaks:specify` a documented comma-list batch form for shaping several records in one invocation (mirroring `/flow`'s `#42,#45,#48`), and add a project rule that a runnable command handed to the user is checked against the target skill's `argument-hint` before it is reported.

**Architecture:** Prose-only change to skill markdown, one help reference-card row, one `docs/donts.md` rule, and one new prose-pin test. The batch form is an extension of Resolve-the-input case 1 (a record reference — there are just several), not a new resolution case; `shaping-mode.md` gains a per-record loop framing plus one sentence at each per-record decision point. Both files stay far under the 40 KB ceiling (20.5 KB / 12.2 KB today).

**Tech Stack:** Markdown skill files; `node --test` (built-in runner, no deps).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T232102-spec-702/work/702-spec.md` (materialized from GitHub issue #702).

## Global Constraints

- Never write the literal placeholder tokens (the three-letter "to be determined" abbreviation, the four-letter "to do" marker, or the `<!-- ambiguity:` HTML comment) anywhere in the touched skill files — `_shared/work-record.md`'s spec-shaped-body check greps for them with no context sensitivity.
- `tests/reference-card-argument-hint.test.js` requires the reference card's Takes cell to be byte-identical to the skill's `argument-hint`, with every `|` escaped as `\|` inside the table cell.
- `tests/argument-hint-input.test.js` requires every non-placeholder `|`-leaf of each top-level `[...]` group of the hint to appear literally in `## Input` (`#`-led leaves are placeholders and exempt; the leading `<...>` group is not a bracket group).
- No `[IL-nn]` tag and no incident-log entry for the new `docs/donts.md` rule — it is a session-conduct convention like the untagged block it sits in.
- Commit messages: `{Verb} {what} — {detail}, refs #702` — write `refs #702`, never `closes`/`fixes` (the PR body carries `Fixes #702`).
- Every commit is made from inside the worktree: `pwd` must print `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-702` and `git rev-parse --show-toplevel` the same path.
- Line numbers in each task's `Files:` block and steps are **pre-edit** anchors (as of commit `28c78903`); earlier steps in the same task insert lines, so locate every edit by the quoted text, never by line number alone.
- Also update the `Modify:` line references in `shaping-mode.md` Task 2 the same way — Task 2 Step 2's replacement of lines 1-10 grows the file by several lines before Steps 3-5 run.

---

### Task 1: `skills/specify/SKILL.md` — comma-list grammar, Input, batch branch, Next Actions row

**Files:**
- Modify: `skills/specify/SKILL.md:4` (frontmatter `argument-hint`)
- Modify: `skills/specify/SKILL.md:38-48` (`## Input` grammar line + prose)
- Modify: `skills/specify/SKILL.md:57-58` (examples block — add one line)
- Modify: `skills/specify/SKILL.md:66` (Resolve-the-input case 1 — batch branch)
- Modify: `skills/specify/SKILL.md:83-85` (Shaping mode section — heading + first paragraph)
- Modify: `skills/specify/SKILL.md:105` (Next Actions Situation table — add a row after the single-record row)
- Create: `tests/specify-batch-input.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the literal `## Input` phrasing Task 2's `shaping-mode.md` cites ("comma-joined, no spaces"; "one record per element"), and the new argument-hint string Task 3 copies byte-for-byte into the reference card.

- [ ] **Step 1: Write the failing prose-pin test**

Create `tests/specify-batch-input.test.js`:

```js
'use strict';

// Prose-pin for /specify's comma-list batch shaping path (refs #702).
//
// The batch form is documented in prose only (skill markdown), so a later
// slimming pass could silently drop it without any test noticing. These
// pins hold the two facts a reader must be able to find: SKILL.md's ## Input
// documents the comma-list grammar, and shaping-mode.md states the per-record
// loop. tests/argument-hint-input.test.js and
// tests/reference-card-argument-hint.test.js pin hint<->Input and hint<->card
// sync; this file pins the batch semantics themselves.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractArgumentHint } = require('./argument-hint-input.test.js');

const ROOT = path.join(__dirname, '..');
const SKILL = fs.readFileSync(path.join(ROOT, 'skills', 'specify', 'SKILL.md'), 'utf8');
const SHAPING = fs.readFileSync(path.join(ROOT, 'skills', 'specify', 'shaping-mode.md'), 'utf8');

function inputSection(content) {
  const headings = [...content.matchAll(/^## .*$/gm)];
  const start = headings.find((m) => m[0] === '## Input');
  assert.ok(start, 'skills/specify/SKILL.md has no ## Input section');
  const next = headings.find((m) => m.index > start.index);
  return content.slice(start.index + start[0].length, next ? next.index : content.length);
}

test('specify argument-hint opens with the comma-list record-reference group', () => {
  const hint = extractArgumentHint(SKILL);
  assert.ok(hint, 'skills/specify/SKILL.md declares no argument-hint');
  assert.ok(
    hint.startsWith('<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title>'),
    `argument-hint does not open with the comma-list group: ${hint}`,
  );
});

test('specify ## Input documents the comma-list batch form', () => {
  const body = inputSection(SKILL);
  assert.ok(body.includes('#N[,#M...]'), '## Input does not show the literal #N[,#M...] leaf');
  assert.ok(body.includes('comma-joined'), '## Input does not say "comma-joined"');
  assert.ok(/shaping-mode-only/i.test(body), '## Input does not state the comma list is shaping-mode-only');
  assert.ok(/--chained/.test(body) && /comma list.*--chained|--chained.*comma list/is.test(body),
    '## Input does not state how --chained interacts with a comma list');
});

test('specify Next Actions has a multiple-records-shaped row recommending a comma-list /flow', () => {
  assert.ok(
    /\| Shaping mode — multiple records shaped in place \|[^\n]*\/claude-tweaks:flow #\{N1\},#\{N2\}/.test(SKILL),
    'Next Actions Situation table has no "multiple records shaped in place" row recommending /claude-tweaks:flow #{N1},#{N2},...',
  );
});

test('shaping-mode.md states the per-record loop', () => {
  assert.ok(/one row per record/.test(SHAPING), 'shaping-mode.md does not say "one row per record"');
  assert.ok(/comma-joined/.test(SHAPING), 'shaping-mode.md does not name the comma-joined batch form');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/specify-batch-input.test.js`
Expected: FAIL — 4 tests, at least the first three fail (`argument-hint does not open with the comma-list group`, `## Input does not show the literal #N[,#M...] leaf`, no multiple-records row). The fourth (`shaping-mode.md`) also fails until Task 2.

- [ ] **Step 3: Update the frontmatter `argument-hint` (line 4)**

Replace line 4 exactly:

```yaml
argument-hint: "<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra|terminal>] [--granularity <fine|standard|coarse>] [--chained]"
```

- [ ] **Step 4: Update the `## Input` grammar line and add the batch paragraph**

Replace line 38 (`` `$ARGUMENTS` = `<record-ref-or-design-doc-or-topic> [phase-N] ...` ``) with:

```markdown
`$ARGUMENTS` = `<record-ref[,record-ref...]-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>] [--chained]`
```

Then, immediately after the paragraph that begins `The first argument is a work record reference` (line 40) and before `Three optional flags may appear anywhere` (line 42), insert this new paragraph (blank line before and after):

```markdown
**Comma-list batch form (`#N[,#M...]` — shaping-mode-only).** Several record references may be given as one comma-joined, no-spaces token — `#701,#702` under `work-backend: github-issues`, or `701,702` under `work-backend: local-files` — mirroring `/claude-tweaks:flow`'s `#42,#45,#48` convention. Every element must be a record reference; a comma list containing a design-doc path or a topic is rejected with a one-line error naming the offending element (`"'{element}' is not a record reference — a comma list shapes records only; give a design doc or topic on its own"`), since decomposition and topic resolution stay single-input. Each element resolves independently (parallel fetches, as `flow/materialize.md`'s Resolution does), every unresolvable element is reported in one message before any record is shaped, and the whole set then enters shaping mode together — `shaping-mode.md`'s per-record loop. `phase-N` and `--granularity` are ignored on a comma list exactly as they already are for a single record reference; `--surface` applies to every record in the batch (the "every record this run produces" semantics below); `--chained` on a comma list is rejected with a one-line notice — `/claude-tweaks:capture`'s born-ready chain shapes exactly one record per invocation, and that contract does not change here.
```

- [ ] **Step 5: Add one example line**

After line 58 (`/claude-tweaks:specify #142 --surface backend ...`) inside the fenced examples block, insert:

```
/claude-tweaks:specify #142,#143,#150                            → shape records #142, #143, #150 in place, one after another (comma-list batch, shaping mode only)
```

- [ ] **Step 6: Extend Resolve-the-input case 1 with the batch branch**

In the case-1 paragraph (line 66), after the sentence ending `never to gate whether shaping runs.`, append (same paragraph, one space before):

```markdown
**Batch branch:** when the first argument is a comma-joined list of record references (the `#N[,#M...]` form in `## Input`), split on `,`, resolve every element through this same case independently (parallel fetches), report every unresolvable element in one message before shaping any of them, and enter shaping mode with the full set — `shaping-mode.md` loops its procedure once per record. An element that is not a record reference fails the whole invocation with the one-line error `## Input` states; nothing is shaped.
```

- [ ] **Step 7: Retitle the Shaping mode section**

Replace lines 83-85 (`## Shaping mode (single record)` heading and its first paragraph) with:

```markdown
## Shaping mode (one or more records)

Entered from Resolve-the-input case 1 (a work record reference, or a comma-joined batch of them) or case 5 (backlog reference with no matching design doc). Each record already exists and IS the target — there is nothing to decompose; a batch runs the same procedure once per record.
```

- [ ] **Step 8: Add the multiple-records Next Actions row**

Insert a new table row directly after line 105 (the `| Shaping mode — one record shaped in place | ...` row):

```markdown
| Shaping mode — multiple records shaped in place | 1. `/claude-tweaks:flow #{N1},#{N2},...,#{Nk}` — sequential pipeline, all shaped records **(Recommended)**<br>2. `/claude-tweaks:flow #{N1}` — pipeline just the first record<br>3. `/claude-tweaks:help` — pipeline dashboard |
```

- [ ] **Step 9: Run the pin test and the two sync tests**

Run: `node --test tests/specify-batch-input.test.js tests/argument-hint-input.test.js tests/skill-conventions.test.js`
Expected: `specify-batch-input` — 3 pass, 1 fail (`shaping-mode.md does not say "one row per record"` — Task 2 turns it green); `argument-hint-input` and `skill-conventions` all pass. `node --test tests/reference-card-argument-hint.test.js` is expected to FAIL now (the card row is stale until Task 3) — do not touch the card in this task.

Also run: `wc -c skills/specify/SKILL.md` — expected under 24000 (well below the 40 KB ceiling), and `grep -c "TBD\|TODO\|<!-- ambiguity" skills/specify/SKILL.md` — expected `0` (exit 1).

- [ ] **Step 10: Commit**

```bash
git add skills/specify/SKILL.md tests/specify-batch-input.test.js
git commit -m "Add comma-list batch form to /specify's argument-hint, Input, case-1 batch branch and Next Actions — refs #702"
```

---

### Task 2: `skills/specify/shaping-mode.md` — per-record loop

**Files:**
- Modify: `skills/specify/shaping-mode.md:1-10` (title + framing paragraphs)
- Modify: `skills/specify/shaping-mode.md:40` (Metadata block — batched design-intent decision)
- Modify: `skills/specify/shaping-mode.md:119-125` (local-files commit — per-record commit rule)
- Modify: `skills/specify/shaping-mode.md:129-135` (Actions Performed + closing paragraph)
- Modify: `docs/plugin-structure.md:57` (the specify sub-file table row's "a single record shaped in place" phrase)
- Test: `tests/specify-batch-input.test.js` (already created in Task 1 — the fourth test goes green here)

**Interfaces:**
- Consumes: Task 1's `## Input` phrasing ("comma-joined", the `#N[,#M...]` form) — cited, not restated.
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the pin still fails**

Run: `node --test tests/specify-batch-input.test.js`
Expected: 3 pass, 1 fail — `shaping-mode.md does not say "one row per record"`.

- [ ] **Step 2: Retitle and add the loop framing**

Replace lines 1-10 with:

```markdown
# Specify — Shaping Mode (one or more records)

Loaded by `/claude-tweaks:specify` when Resolve-the-input lands on case 1 (a work record reference,
or a comma-joined batch of them — `SKILL.md`'s `## Input`, "Comma-list batch form") or case 5 (a
backlog reference with no matching design doc). Each record already exists and IS the target —
there is nothing to decompose, and none of decomposition mode's Steps 1-9 (`decomposition-mode.md`
in this skill's directory) ever run here.

**Batch = the same procedure, once per record.** A comma-list invocation has already resolved every
element (case 1's batch branch) before this file loads. Run every section below independently for
each record, in the order given: its own five sections + `## Original request`, its own metadata
block, its own scoring/ceremony/framing/type stamps, its own compose-then-write-once call. Two
things differ from a single-record run and are stated where they apply below: interactive decisions
raised per record collapse into one batch table + one `AskUserQuestion` (Metadata block), and the
Actions Performed table renders one row per record. A failure shaping record *k* does not roll back
records 1..k-1 — each write already landed via the API (or on disk); report the failure on that
record's own row and keep shaping the rest.

This procedure is fully self-contained: once it completes, return to `SKILL.md`'s `## Next Actions`
block — except under `--chained`, which returns to the caller instead (a comma list under
`--chained` never reaches here — `SKILL.md`'s `## Input` rejects it). Kept out of `SKILL.md`
because shaping is now the primary path (`#N` record references are the primary input) and it has
no use for decomposition mode's much larger body.
```

- [ ] **Step 3: Batch the design-intent decision in the Metadata block**

In the paragraph at line 40 that begins `Run Step 2.5a's frontend-detection sniff`, after the sentence ending `resolves to \`Design-intent: none\` (its own \`--chained\` branch).`, insert this sentence (same paragraph):

```markdown
On a comma-list batch, run the sniff per record but ask the design-intent question **once** for all frontend records together: render one batch table (record, sniffed surface, recommended intent pre-filled) followed by a single `AskUserQuestion` for apply-all/override, per the Interaction style directive — never one call per record; backend/infra records in the same batch appear in the table with `Design-intent: —` and are not asked.
```

- [ ] **Step 4: State the per-record commit rule for `local-files`**

Replace the single line 119 — `then commit — a local record is a tracked file, unlike a GitHub issue edit:` — with this one line (the `git add`/`git commit` fenced block that follows it and the `Nothing to commit on the \`github-issues\` driver` line after that stay exactly as they are):

```markdown
then commit — a local record is a tracked file, unlike a GitHub issue edit. On a comma-list batch, commit **once per record**, immediately after that record's `writeRecord` — never leave some records written and uncommitted while the next one is being shaped:
```

- [ ] **Step 5: One Actions Performed row per record; point the closing paragraph at the right Next Actions row**

Replace lines 129-135 (from `### Actions Performed` through the closing `Shaping mode ends here — ...` paragraph) with:

```markdown
### Actions Performed

One row per record — a single-record run renders one row, a comma-list batch renders one row per shaped record (a record whose write failed renders its row with the failure in the Detail cell instead of the stamps):

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Shaped record {ref} into spec shape — stamped `risk:{tier}`/`size:{tier}`/`ceremony:{tier}` and Type where each was absent, added `ready`, removed `parked` if present | `{hash}` (local-files) / `—` (github-issues — edit already landed via API, no commit) |

Shaping mode ends here — return to `SKILL.md` and render its `## Next Actions` block: the "Shaping mode — one record shaped in place" row of its Situation table for a single record, the "Shaping mode — multiple records shaped in place" row for a comma-list batch (its recommended command lists every successfully shaped record, in the order given). Under `--chained` (see `SKILL.md`'s Input and Component-Skill Contract), skip Next Actions entirely and return control to the calling skill — the shaped, `ready` record is the whole deliverable.
```

- [ ] **Step 6: Update `docs/plugin-structure.md`'s specify row**

On line 57 of `docs/plugin-structure.md`, replace the phrase

```
shaping-mode.md (a single record shaped in place; the primary path, since `#N` record references are the primary input)
```

with

```
shaping-mode.md (one or more records shaped in place — a comma-list batch loops the same procedure per record; the primary path, since `#N` record references are the primary input)
```

- [ ] **Step 7: Run the pin test, the sync tests, the ceiling check, the placeholder check**

Run: `node --test tests/specify-batch-input.test.js tests/argument-hint-input.test.js tests/skill-conventions.test.js`
Expected: all pass (4 + the two suites' existing counts).

Run: `wc -c skills/specify/shaping-mode.md` — expected under 15000.
Run: `grep -c "TBD\|TODO\|<!-- ambiguity" skills/specify/shaping-mode.md docs/plugin-structure.md` — expected `0` for both.
Run: `grep -n "single record" skills/specify/shaping-mode.md skills/specify/SKILL.md docs/plugin-structure.md` — expected: only prose that is still true of a single record (e.g. "a single-record run renders one row"); no remaining "(single record)" heading.

- [ ] **Step 8: Commit**

```bash
git add skills/specify/shaping-mode.md docs/plugin-structure.md
git commit -m "State shaping mode's per-record loop for comma-list batches — batched design-intent decision, per-record commit, one Actions row per record, refs #702"
```

---

### Task 3: `skills/help/reference-card.md` — Takes cell byte-sync

**Files:**
- Modify: `skills/help/reference-card.md:12`
- Test: `tests/reference-card-argument-hint.test.js` (existing)

**Interfaces:**
- Consumes: Task 1's final `argument-hint` string, verbatim.
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the sync test fails**

Run: `node --test tests/reference-card-argument-hint.test.js`
Expected: FAIL — the `/claude-tweaks:specify` row's Takes cell differs from the skill's argument-hint.

- [ ] **Step 2: Update the row**

Replace line 12 exactly (every `|` inside the Takes cell escaped as `\|`):

```markdown
| `/claude-tweaks:specify` | Shape a work record to spec-shape, or decompose a design doc into ready sub-issue records | `<#N[,#M...]\|record-id[,id...]\|design-doc-path\|topic\|backlog-title> [phase-N] [--surface <web\|mobile\|desktop\|backend\|infra\|terminal>] [--granularity <fine\|standard\|coarse>] [--chained]` |
```

- [ ] **Step 3: Verify**

Run: `node --test tests/reference-card-argument-hint.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add skills/help/reference-card.md
git commit -m "Sync /help reference card's specify Takes cell to the comma-list argument-hint — refs #702"
```

---

### Task 4: `docs/donts.md` — argument-hint check rule

**Files:**
- Modify: `docs/donts.md:10` (insert one bullet after the "Don't add per-item decision prompts for lists" line, inside the untagged convention block)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Verify the rule is absent**

Run: `grep -c "Don't hand the user a runnable" docs/donts.md`
Expected: `0` (exit 1).

- [ ] **Step 2: Insert the rule**

Directly after line 10 (`- Don't add per-item decision prompts for lists — use batch tables with "apply all / override"`), insert:

```markdown
- Don't hand the user a runnable `/claude-tweaks:{skill}` command whose argument form you haven't checked against that skill's `argument-hint` (or its `## Input` section) in the same turn — a confidently-worded invocation in an unsupported grammar fails at the user's prompt, after they've pasted it (#702: a comma-list `/specify` call asserted from memory when only `/flow` documented that form)
```

- [ ] **Step 3: Verify**

Run: `grep -c "Don't hand the user a runnable" docs/donts.md`
Expected: `1`.
Run: `grep -n "argument-hint" docs/donts.md` — expected: the new line only (or the new line plus any pre-existing mention; the new line must be among the hits).
Run: `node --test tests/claude-md-budget.test.js` — expected PASS (docs/donts.md is not the budgeted file, but this confirms nothing else moved).

- [ ] **Step 4: Commit**

```bash
git add docs/donts.md
git commit -m "Add the argument-hint check rule for handed-to-the-user commands to docs/donts.md — refs #702"
```

---

## Verification (whole branch, after Task 4)

Run from the worktree root:

```bash
node --test tests/specify-batch-input.test.js tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js tests/skill-conventions.test.js
```
Expected: all pass.

```bash
grep -n "argument-hint" skills/specify/SKILL.md
```
Expected: line 4 begins `argument-hint: "<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title>`.

```bash
grep -c "comma-joined" skills/specify/SKILL.md skills/specify/shaping-mode.md
```
Expected: `skills/specify/SKILL.md:1` (or more), `skills/specify/shaping-mode.md:1` (or more).

```bash
grep -c "Shaping mode — multiple records shaped in place" skills/specify/SKILL.md
```
Expected: `1`.

```bash
grep -c "Don't hand the user a runnable" docs/donts.md
```
Expected: `1`.

```bash
wc -c skills/specify/SKILL.md skills/specify/shaping-mode.md
```
Expected: each under 40960.

Full suite (`npm test`, redirected to a file) runs centrally in `/build` Common Step 5, not inside any task.
