# Specify + Demo Batch Argument Implementation Plan (#695)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `/claude-tweaks:specify` (shaping mode only) and `/claude-tweaks:demo` a comma-separated `#N,#M[,...]` batch argument that iterates the existing single-item procedure sequentially, so `/tidy`'s command-grouped Yours section (#685) can collapse each `specify`/`demo` group to one paste line.

**Architecture:** Pure skill-prose changes plus one pin test. Each batch is a loop over the unchanged single-item procedure — one interaction set per record, no cross-item merging, no Task fan-out — so the only new prose is the list grammar, the ordering/isolation rules, and the hand-off text (`## Next Actions`, Actions Performed) that has to know a list happened. The two byte-pinned consumers (`skills/help/reference-card.md`'s Takes column; `tests/argument-hint-input.test.js`'s hint↔Input leaf check) are updated in the same tasks so the suite stays green at every commit.

**Tech Stack:** Markdown skill files, `node --test`, `gh` (read-only, for the tidy check).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T232220-spec-695/work/695-spec.md` (materialized from GitHub issue #695).

## Global Constraints

- Every skill reference inside actionable instruction text uses the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md, Cross-references).
- Never write the literal placeholder tokens the spec-shape check greps for into any skill file, record body, or plan text — paraphrase ("an unresolved marker").
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefix); reference the record as `refs #695`, never a closing keyword. Every commit message ends with the line `Claude-Session: https://claude.ai/code/session_01RJGWJQTX54MuXzgGXZ8e7a`.
- `wc -c skills/specify/SKILL.md` and `wc -c skills/demo/SKILL.md` must each stay ≤ 40960 bytes (`bin/lib/skill-audit/context-cost.js` ceiling). Today: 20546 and 27778 — ample headroom, but check after every edit.
- No `bin/` changes. No version bump (`.claude-plugin/plugin.json` is release-time only).
- All work happens in this worktree (`worktree-always: true`); one plain command per Bash call — this project's worktree sessions refuse compound shell (`&&`, heredocs, loops).
- `tests/argument-hint-input.test.js` requires every `|`-leaf inside a top-level `[...]` group of a hint to appear literally in that skill's `## Input` (leaves led by `#` or wrapped in `<>` are placeholders and exempt). `tests/reference-card-argument-hint.test.js` requires the reference card's Takes cell to be byte-identical to the hint after unescaping `\|`.
- Whole-suite runs go to a file, never piped: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/bbe3324c-60cc-4085-8445-9c0104cd7f5f/scratchpad/{name}.log 2>&1` then `tail -12` the log. Baseline on this branch: 3964 pass / 0 fail.

---

### Task 1: `/claude-tweaks:specify` — batch of record references (shaping mode only)

**Files:**
- Modify: `skills/specify/SKILL.md:4` (frontmatter `argument-hint`)
- Modify: `skills/specify/SKILL.md:36-42` (`## Input` — grammar line, first-argument sentence, new batch paragraph)
- Modify: `skills/specify/SKILL.md:66` (Resolve-the-input case 1 — one added sentence)
- Modify: `skills/specify/SKILL.md:105` (`## Next Actions` Situation table — one new row after the single-record row)
- Modify: `skills/specify/SKILL.md:117` (Component-Skill Contract — batch + `--chained` sentence)
- Modify: `skills/specify/shaping-mode.md:1-9` (intro — list enters the procedure once per element) and `:129-135` (Actions Performed — per-element outcome rows; Next Actions hand-off names the new row)
- Test: `tests/batch-ref-argument.test.js` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the literal phrases Task 2's test additions and Task 3's reference-card cell depend on — the new specify hint string (verbatim below), the Input phrase `runs shaping mode once per element, in list order, sequentially`, the phrase `Batch applies to record references only`, the Next Actions row heading `Shaping mode — multiple records shaped in place`, and shaping-mode's outcome vocabulary `shaped` / `already shaped, no-op` / `skipped: {reason}`.

- [ ] **Step 1: Write the failing pin test (specify half)**

Create `tests/batch-ref-argument.test.js`:

```js
'use strict';

// Conformance pins (#695): /specify and /demo accept a comma-separated
// `#N,#M[,...]` batch argument that iterates the single-item procedure
// sequentially. These pin the load-bearing rule text so a later edit that
// drops the sequential / refs-only / never-a-sweep rules — or the batch form
// itself — fails loudly instead of silently returning both skills to
// single-ref (which would also silently lengthen /tidy's Yours paste blocks).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractArgumentHint } = require('./argument-hint-input.test.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('specify argument-hint accepts a comma-separated record-ref list', () => {
  const hint = extractArgumentHint(read('skills/specify/SKILL.md'));
  assert.ok(hint.startsWith('<#N[,#M...]|record-id[,id...]|'), `specify hint must open with the batch grammar, got: ${hint}`);
});

test('specify Input states the batch is shaping-mode-only, refs-only, and sequential', () => {
  const src = read('skills/specify/SKILL.md');
  assert.ok(src.includes('runs shaping mode once per element, in list order, sequentially'), 'sequential-per-element rule missing from specify Input');
  assert.ok(src.includes('Batch applies to record references only'), 'refs-only rule missing from specify Input');
});

test('specify Next Actions has a multiple-records-shaped row recommending a comma-joined flow', () => {
  const src = read('skills/specify/SKILL.md');
  assert.ok(src.includes('| Shaping mode — multiple records shaped in place'), 'multiple-records Next Actions row missing');
  assert.ok(src.includes('`/claude-tweaks:flow #{N1},#{N2},...` — sequential pipeline for every record shaped this run **(Recommended)**'), 'multiple-records row must recommend the comma-joined flow command');
});

test('shaping-mode Actions Performed documents the per-element outcome vocabulary', () => {
  const src = read('skills/specify/shaping-mode.md');
  for (const token of ['`shaped`', '`already shaped, no-op`', '`skipped: {reason}`']) {
    assert.ok(src.includes(token), `outcome token ${token} missing from shaping-mode.md Actions Performed`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/batch-ref-argument.test.js`
Expected: 4 tests, all FAIL (hint still `<#N|record-id|…>`, phrases absent).

- [ ] **Step 3: Edit the frontmatter hint (line 4)**

Replace the whole line 4 with exactly:

```yaml
argument-hint: "<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra|terminal>] [--granularity <fine|standard|coarse>] [--chained]"
```

- [ ] **Step 4: Edit `## Input` (lines 38-40) and add the batch paragraph**

Replace line 38:

```
`$ARGUMENTS` = `<record-ref-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>] [--chained]`
```

with:

```
`$ARGUMENTS` = `<record-ref[,record-ref...]-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>] [--chained]`
```

In line 40, replace the opening clause `The first argument is a work record reference (`#N`, an issue URL, or a bare local record id), a path to a design doc, a topic name, or a backlog reference.` with:

```
The first argument is a work record reference (`#N`, an issue URL, or a bare local record id), a comma-separated list of record references (the batch paragraph below), a path to a design doc, a topic name, or a backlog reference.
```

Then insert this new paragraph as its own block immediately after line 40 (before the line `Three optional flags may appear anywhere after the first argument …`):

```
**Batch of record references (shaping mode only).** `#N[,#M...]` — or, under `work-backend: local-files`, `record-id[,id...]` — is a comma-separated list of record references with no spaces (`#695,#696`; `12,14`). When **every** element parses as a record reference per Resolve-the-input case 1, the argument is a batch: it runs shaping mode once per element, in list order, sequentially — each record gets the full single-record procedure (compose, `ceremony-check`, `framing-check`, the one design-intent question when a frontend sniff fires, one compose-then-write-once call) with no cross-record merging, no shared body, and no batched label call. A batch is a loop, never a fan-out: no Task dispatch, one record at a time. Batch applies to record references only — decomposition mode has no list form, so `phase-N` and `--granularity` are ignored for a list exactly as for a single ref; `--surface` applies to every element; `--chained` is accepted on a list (permitted-but-unused — `/claude-tweaks:capture`'s born-ready chain passes exactly one ref). Two non-batch shapes: when **some but not all** comma-separated elements parse as record references (`#695,docs/x-design.md`, `#695,meal planning`), that is a mixed list — a hard input error: stop before touching any record and name the offending element(s); when **no** element parses as a record reference, the argument is not a list at all but ordinary free text, resolved through cases 3-5 exactly as today, so a topic containing a comma ("auth, login flow") is neither a batch nor an error. Per-record failure isolation inside a batch: an element whose fetch fails (missing, wrong repo, `gh issue view` error / no matching `specs/{n}-*.md`) is reported and skipped; the remaining elements still shape, and the run summary (`shaping-mode.md`'s Actions Performed) carries one row per attempted element with its outcome — `shaped`, `already shaped, no-op`, or `skipped: {reason}`.
```

- [ ] **Step 5: Add the case-1 sentence (line 66 area)**

Append to the end of Resolve-the-input case 1's paragraph (the one beginning `1. **Work record reference**` — after `… never to gate whether shaping runs.`):

```
 A comma-separated list of record references runs this case once per element, in list order — the list grammar, the mixed-list hard error, and the per-element isolation rule live in `## Input`'s batch paragraph.
```

- [ ] **Step 6: Add the Next Actions row (after line 105)**

Immediately after the row beginning `| Shaping mode — one record shaped in place |`, insert:

```
| Shaping mode — multiple records shaped in place (a comma-separated list) | 1. `/claude-tweaks:flow #{N1},#{N2},...` — sequential pipeline for every record shaped this run **(Recommended)**<br>2. `/claude-tweaks:flow #{N1}` — pipeline just the first shaped record<br>3. `/claude-tweaks:help` — pipeline dashboard |
```

Then, in the paragraph beginning `Once the matching situation is resolved, render its numbered list as plain markdown`, append this sentence at the end:

```
 For the multiple-records row, `{N1},{N2},...` is the shaped elements only, in list order — an element the batch skipped never appears in the recommended command, and the block renders once, after the last element.
```

- [ ] **Step 7: Extend the Component-Skill Contract (line 117)**

Replace the final sentence of that paragraph, `Every other invocation renders Next Actions unchanged.`, with:

```
Every other invocation renders Next Actions unchanged — a comma-separated batch renders it once, after its last element, from the "multiple records shaped in place" row. A batch under `--chained` is permitted but has no caller: the born-ready chain passes exactly one ref.
```

- [ ] **Step 8: Update `shaping-mode.md` intro and Actions Performed**

In the intro (the paragraph beginning `Loaded by `/claude-tweaks:specify` when Resolve-the-input lands on case 1`), append this sentence to the end of that paragraph (after `… never run here.`):

```
 A comma-separated list of record references (`SKILL.md`'s `## Input`, batch paragraph) enters this procedure once per element, sequentially — nothing below changes for a list; only the Actions Performed table and the Next Actions hand-off at the end know a list happened.
```

Replace the `### Actions Performed` section's table and the sentence after it (lines 131-135) with:

```
| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Shaped record {ref} into spec shape — stamped `risk:{tier}`/`size:{tier}`/`ceremony:{tier}` and Type where each was absent, added `ready`, removed `parked` if present | `{hash}` (local-files) / `—` (github-issues — edit already landed via API, no commit) |

For a comma-separated batch, render one row per attempted element, in list order, and prefix each Detail with its outcome: `shaped` (this run edited the record — the row above), `already shaped, no-op` (every section present and non-empty and every label family already stamped — nothing written, nothing to undo), or `skipped: {reason}` (the fetch failed; `{reason}` is the one-line `gh` / `readRecord` error). The Ref column follows the same per-driver rule on every row.

Shaping mode ends here — return to `SKILL.md` and render its `## Next Actions` block: the "Shaping mode — one record shaped in place" row of its Situation table for a single ref, or the "Shaping mode — multiple records shaped in place" row for a batch, rendered once after the last element. Under `--chained` (see `SKILL.md`'s Input and Component-Skill Contract), skip Next Actions entirely and return control to the calling skill — the shaped, `ready` record is the whole deliverable.
```

- [ ] **Step 9: Run the pin test and the two hint tests**

Run: `node --test tests/batch-ref-argument.test.js`
Expected: the 3 specify/shaping-mode tests PASS; the demo tests do not exist yet (this file has only specify tests at this point) — so 4 pass.

Run: `node --test tests/argument-hint-input.test.js`
Expected: PASS (every `[...]` leaf of the new hint — `phase-N`, `--surface <…>`, `--granularity <…>`, `--chained` — still appears in `## Input`).

Run: `node --test tests/reference-card-argument-hint.test.js`
Expected: FAIL for `specify` only (card still carries the old hint) — Task 3 fixes the card. Do not edit the card in this task.

Run: `wc -c skills/specify/SKILL.md`
Expected: a number ≤ 40960.

- [ ] **Step 10: Commit**

```bash
git add skills/specify/SKILL.md skills/specify/shaping-mode.md tests/batch-ref-argument.test.js
git commit -m "Teach specify a comma-separated record-ref batch — shaping mode only, sequential, refs-only, per-element isolation, refs #695" -m "Claude-Session: https://claude.ai/code/session_01RJGWJQTX54MuXzgGXZ8e7a"
```

(Two plain commands, one per Bash call.) The reference-card test is red between this commit and Task 3's — expected and short-lived; Task 3 lands before any whole-suite run.

---

### Task 2: `/claude-tweaks:demo` — `#N[,#M...]` batch, per-item verdict, never a sweep

**Files:**
- Modify: `skills/demo/SKILL.md:4` (frontmatter `argument-hint`)
- Modify: `skills/demo/SKILL.md:49-55` (`## Input`)
- Modify: `skills/demo/SKILL.md:57-61` (Step 1)
- Modify: `skills/demo/SKILL.md:227-231` (Step 3 opening — per-item application sentence)
- Modify: `skills/demo/SKILL.md:279-285` (`## Next Actions` — batch-aware conditionals)
- Modify: `skills/demo/entry-paths.md:3-4` (intro sentence)
- Modify: `docs/journeys/accept-built-work-via-demo.md:22` (Step 1 red-flag wording)
- Test: `tests/batch-ref-argument.test.js` (extend)

**Interfaces:**
- Consumes: the test file Task 1 created.
- Produces: the demo hint string `[#N[,#M...]]` (Task 3's card cell), and the phrases `Step 1 → Step 2 → Step 3 to completion before the next ref begins` and `A batch is the human's own list — never a sweep`.

- [ ] **Step 1: Add the failing demo pins**

Append to `tests/batch-ref-argument.test.js`:

```js
test('demo argument-hint accepts a comma-separated record-ref list', () => {
  const hint = extractArgumentHint(read('skills/demo/SKILL.md'));
  assert.strictEqual(hint, '[#N[,#M...]]');
});

test('demo Input states per-item completion before the next ref and never-a-sweep', () => {
  const src = read('skills/demo/SKILL.md');
  assert.ok(src.includes('Step 1 → Step 2 → Step 3 to completion before the next ref begins'), 'per-item completion rule missing from demo Input');
  assert.ok(src.includes("A batch is the human's own list — never a sweep"), 'never-a-sweep restatement missing from demo Input');
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test tests/batch-ref-argument.test.js`
Expected: 4 pass (Task 1), 2 FAIL (demo hint still `[#N]`, phrases absent).

- [ ] **Step 3: Edit the frontmatter hint (line 4)**

Replace line 4 with exactly:

```yaml
argument-hint: "[#N[,#M...]]"
```

- [ ] **Step 4: Rewrite `## Input` (lines 51-55)**

Replace the paragraph under `## Input` (from `` `$ARGUMENTS` — *(none)* resolves …`` through `… where the full outstanding list lives.`) with:

```
`$ARGUMENTS` — *(none)* resolves this session's own unrecorded work via session-recall (Step 1);
`#N` resolves that single record's Verification Brief, falling back — when no `demo:pending`
label exists on it — first to the record's closing commit in git history, then to session-recall
scoped to that `#N` (Step 1); `#N[,#M...]` — a comma-separated list of record refs, no spaces —
is an explicit human-supplied batch: each ref runs the `#N` path in list order,
Step 1 → Step 2 → Step 3 to completion before the next ref begins, so a batch aborted part-way
has already applied every verdict given so far and lost nothing. One verdict question per item —
never a combined verdict, never cross-item merging, never a Task fan-out.
A batch is the human's own list — never a sweep: `/demo` still never scans the backlog for what
to include, and the no-argument session-recall path cannot be combined with refs. Never sweeps
the backlog — `/claude-tweaks:help` (Stage 4.7) is where the full outstanding list lives.
```

Both pinned phrases (`Step 1 → Step 2 → Step 3 to completion before the next ref begins` and `A batch is the human's own list — never a sweep`) sit on a single physical line each — preserve this exact wrapping, the pin test is a substring match.

- [ ] **Step 5: Extend Step 1 (lines 59-61)**

Replace the Step 1 paragraph with:

```
`/claude-tweaks:demo` resolves one item at a time — never a sweep; a `#N[,#M...]` list is still
one item at a time, repeated in list order (`## Input`). `$ARGUMENTS` selects which path
runs — read only the matching branch in `entry-paths.md` in this skill's directory: no arguments
(session-recall) or `#N` given (single-record lookup — entered once per ref for a list).
```

- [ ] **Step 6: Add the per-item sentence to Step 3 (line 227 area)**

Insert this paragraph directly under the `## Step 3: Apply verdicts` heading, before `**Label-backed entries**`:

```
For a `#N[,#M...]` batch this step runs per item, immediately after that item's verdict — never
batched across items — so the next ref's Step 1 starts only once this ref's label swap (or
follow-up filing) has landed.
```

- [ ] **Step 7: Make `## Next Actions` batch-aware (lines 279-285)**

Replace the block from `Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):` through the third command line with:

```
Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention) — once per invocation, after the last item of a `#N[,#M...]` batch; each conditional line keys on the batch as a whole:

**`/claude-tweaks:backlog refine`** — the new gap record needs shaping/authorization like any other backlog item; renders only when a `demo:changes-requested` follow-up was filed for any item this run (recommended)
`/claude-tweaks:help` — full pipeline status
`/claude-tweaks:help` — lists every #N still awaiting sign-off (Stage 4.7); renders only when any item this run remains `demo:pending` after Skip
```

- [ ] **Step 8: Update `entry-paths.md` intro (lines 3-4)**

Replace the sentence `load only the branch that matches (no-arguments vs. `#N` given), never both.` with:

```
load only the branch that matches (no-arguments vs. `#N` given), never both. For a `#N[,#M...]` list, the `#N` branch is entered once per ref, in list order — each entry is a fresh, independent lookup.
```

- [ ] **Step 9: Update the journey red flag (`docs/journeys/accept-built-work-via-demo.md:22`)**

Replace `A backlog sweep (demo resolves exactly one item);` with:

```
A backlog sweep (demo resolves exactly the item(s) you named — `#N`, or a `#N,#M` list one at a time — never a scan for what's outstanding);
```

- [ ] **Step 10: Run the pins and the hint sync test**

Run: `node --test tests/batch-ref-argument.test.js`
Expected: 6 pass.

Run: `node --test tests/argument-hint-input.test.js`
Expected: PASS (demo's only bracket leaf `#N[,#M...]` is `#`-led — a placeholder — so no literal-match obligation; the Input still spells it out verbatim regardless).

Run: `wc -c skills/demo/SKILL.md`
Expected: ≤ 40960.

- [ ] **Step 11: Commit**

```bash
git add skills/demo/SKILL.md skills/demo/entry-paths.md docs/journeys/accept-built-work-via-demo.md tests/batch-ref-argument.test.js
git commit -m "Teach demo a #N,#M batch — per-item verdict to completion before the next ref, never a sweep, refs #695" -m "Claude-Session: https://claude.ai/code/session_01RJGWJQTX54MuXzgGXZ8e7a"
```

---

### Task 3: Reference card + README — byte-identical Takes cells, no "one item per invocation"

**Files:**
- Modify: `skills/help/reference-card.md:12` (specify Takes cell)
- Modify: `skills/help/reference-card.md:52` (demo description + Takes cell)
- Modify: `README.md:76` (demo blurb in the lifecycle diagram)
- Test: `tests/reference-card-argument-hint.test.js` (existing — must return to green)

**Interfaces:**
- Consumes: the two hint strings from Tasks 1-2.
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the card test is red for exactly `specify` and `demo`**

Run: `node --test tests/reference-card-argument-hint.test.js`
Expected: FAIL, mismatch list naming `specify` and `demo` only.

- [ ] **Step 2: Edit row 12's Takes cell**

Replace the Takes cell (third column) of the `` `/claude-tweaks:specify` `` row with exactly (note every `|` inside the cell is escaped as `\|`):

```
`<#N[,#M...]\|record-id[,id...]\|design-doc-path\|topic\|backlog-title> [phase-N] [--surface <web\|mobile\|desktop\|backend\|infra\|terminal>] [--granularity <fine\|standard\|coarse>] [--chained]`
```

- [ ] **Step 3: Edit row 52 (demo)**

Replace the whole `` `/claude-tweaks:demo` `` row (the one in the utilities Takes-table, currently reading `Resolves one built thing per invocation — …`) with:

```
| `/claude-tweaks:demo` | Resolves one built thing per ref — this session's own unrecorded work (bare), a specific `#N` record, or a `#N,#M` list taken one item at a time — briefs you on it and captures a human verdict, approve or request changes; discovery of what's outstanding is `/claude-tweaks:help`'s job | `[#N[,#M...]]` |
```

- [ ] **Step 4: Edit README line 76**

Replace `resolves one item per invocation: a specific #N, or this session's own unrecorded work via session-recall)` with:

```
resolves one item per ref: a specific #N, a #N,#M list one at a time, or this session's own unrecorded work via session-recall)
```

- [ ] **Step 5: Verify**

Run: `node --test tests/reference-card-argument-hint.test.js`
Expected: PASS.

Run: `grep -rn "one item per invocation\|one built thing per invocation" README.md skills/help/reference-card.md`
Expected: no output (exit 1).

- [ ] **Step 6: Commit**

```bash
git add skills/help/reference-card.md README.md
git commit -m "Sync reference card and README with the specify/demo batch hints — Takes cells byte-identical, no per-invocation wording, refs #695" -m "Claude-Session: https://claude.ai/code/session_01RJGWJQTX54MuXzgGXZ8e7a"
```

---

### Task 4: `/tidy` group heads — verify the batch-vs-paste rule reads `argument-hint` (deliverable D, conditional on #685)

**Files:**
- Read: `origin/main:skills/tidy/step-6-auto.md` (after a fresh fetch)
- Modify (only if #685 has merged into `origin/main`): `skills/tidy/step-6-auto.md` — the `Single-ref target` bullet and the conformance-scan `Batch only where allowed` row; `docs/journeys/tidy-standalone-auto-report.md` if it pins a specify/demo paste-block example; and whichever `tests/*.test.js` #685 added that pins those literals
- Modify (only if #685 has NOT merged): `docs/plans/2026-08-16-specify-demo-batch-argument-ledger.md` — one `build/deferred-check` row

**Interfaces:**
- Consumes: nothing from earlier tasks (independent).
- Produces: either the tidy literal update, or a ledger row the flow orchestrator re-checks at wrap-up.

Background the implementer needs: #685 (PR #699, branch `worktree-flow-spec-685`) is in flight in a sibling session. Its `step-6-auto.md` (as of this plan's authoring) says, in the Yours grouping rule, "**Batchable target** — the skill's `argument-hint` … accepts multiple record refs … Read the hint at render time rather than memorizing this list — when a skill gains a batch form, this rule needs no edit", and then a sibling bullet "**Single-ref target** (`/claude-tweaks:specify` — `<#N|…>`, `/claude-tweaks:demo` — `[#N]`, `gh …`, `git …`)" plus a conformance-scan row "Batch only where allowed | … per its `argument-hint` (`flow`, `dispatch` today)". The rule reads the hint, but the *examples* name specify/demo as single-ref, and #685's own tests may pin them.

- [ ] **Step 1: Fetch and check whether #685 has merged**

Run: `git fetch origin main`
Run: `git show origin/main:skills/tidy/step-6-auto.md | grep -n "Single-ref target\|Batch only where allowed"`

- **Output non-empty** → #685 merged; go to Step 2.
- **Output empty (grep exits 1)** → #685 not merged; skip to Step 5.

- [ ] **Step 2 (merged branch only): merge origin/main into this branch**

Run: `git merge origin/main`
Expected: clean merge (this branch touches specify/demo/help/README/tests; #685 touches tidy). On a conflict, resolve per `_shared/git-discipline.md` — never reset.

- [ ] **Step 3 (merged branch only): update the two literals**

In `skills/tidy/step-6-auto.md`:

- In the `Single-ref target` bullet, remove `/claude-tweaks:specify — <#N|…>` and `/claude-tweaks:demo — [#N]` from the parenthetical example list (leave `gh …`, `git …`, and any other single-ref examples), and in the sibling `Batchable target` bullet extend the "Today that is" list so it reads: `/claude-tweaks:flow` (`<#n>[,#m,#o]`), `/claude-tweaks:dispatch` (`#N[,#M...]`), `/claude-tweaks:specify` (`<#N[,#M...]|…>`, record refs only), and `/claude-tweaks:demo` (`[#N[,#M...]]`).
- In the conformance-scan `Batch only where allowed` row, change `(`flow`, `dispatch` today)` to `(`flow`, `dispatch`, `specify`, `demo` today)`.

Then: `grep -n "claude-tweaks:specify\|claude-tweaks:demo" docs/journeys/tidy-standalone-auto-report.md` — if a Yours example renders a specify/demo *paste block* for several records, rewrite that example as one batch line (`/claude-tweaks:specify #a,#b,#c`), keeping the fenced shape.

Then: `grep -rln "Single-ref target\|flow., .dispatch. today\|record refs only" tests/` — for every #685 test that pins the old literals, update the pinned string to the new wording (the pin's purpose — the rule reads the hint — is unchanged).

- [ ] **Step 4 (merged branch only): verify and commit**

Run: `node --test $(ls tests/*tidy* tests/sweep-backstop.test.js 2>/dev/null)` — if the glob matches nothing, run `node --test tests/sweep-backstop.test.js`.
Expected: PASS.

```bash
git add skills/tidy/step-6-auto.md docs/journeys/tidy-standalone-auto-report.md tests/
git commit -m "Name specify and demo as batchable targets in tidy's Yours grouping rule — hint-reading rule unchanged, examples updated, refs #695" -m "Claude-Session: https://claude.ai/code/session_01RJGWJQTX54MuXzgGXZ8e7a"
```

(Stage only files that actually changed — drop any path from `git add` that `git status --short` does not list.) Skip Step 5.

- [ ] **Step 5 (unmerged branch only): record the deferred check in the ledger**

Append this row to the table in `docs/plans/2026-08-16-specify-demo-batch-argument-ledger.md` (next free `#`):

```
| 2 | build/deferred-check | Deliverable D (tidy Yours group heads emit `/claude-tweaks:specify #a,#b` / `/claude-tweaks:demo #a,#b`) could not be applied: #685's grouping rule is not on origin/main yet (PR #699 still open at build time). Its rule reads the target skill's `argument-hint` at render time, but its `Single-ref target` example bullet and `Batch only where allowed` scan row name specify/demo as single-ref literally. Re-check at wrap-up: if #685 merged, apply Task 4 Steps 2-4; otherwise resolve `deferred` with trigger "PR #699 merges" and file a backlog record via /claude-tweaks:capture. | open | — |
```

```bash
git add docs/plans/2026-08-16-specify-demo-batch-argument-ledger.md
git commit -m "Record the deferred tidy group-head check — #685 not merged at build time, refs #695" -m "Claude-Session: https://claude.ai/code/session_01RJGWJQTX54MuXzgGXZ8e7a"
```

---

### Task 5: Whole-suite verification, ceilings, and skill-graph confirmation

**Files:**
- Read: `docs/skill-graph.md` (no edit expected)
- Read: `skills/specify/SKILL.md`, `skills/demo/SKILL.md` (size check)

**Interfaces:**
- Consumes: every earlier task's commits.
- Produces: green suite + the two confirmations the spec's Acceptance Criteria ask for.

- [ ] **Step 1: Confirm no new skill-graph edge is needed**

Run: `grep -n "batch\|#N,#M\|comma-separated" docs/skill-graph.md`
Expected: no line describes a specify↔demo or specify/demo↔tidy relationship that this change creates — the batch argument introduces no new inter-skill invocation (tidy already *renders* commands for both; nothing invokes anything new). If a hit shows an existing edge whose wording says "single-ref" or "`[#N]`", update that wording in place; otherwise leave the file untouched.

- [ ] **Step 2: Size ceilings**

Run: `wc -c skills/specify/SKILL.md skills/demo/SKILL.md`
Expected: both ≤ 40960.

- [ ] **Step 3: Full suite to a file**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/bbe3324c-60cc-4085-8445-9c0104cd7f5f/scratchpad/task5-test.log 2>&1`
Run: `tail -12 /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/bbe3324c-60cc-4085-8445-9c0104cd7f5f/scratchpad/task5-test.log`
Expected: `# fail 0`; `# pass` ≥ 3970 (baseline 3964 + the 6 new pins).

If a failure names a test that reads a file this branch did not touch, re-run that file alone (`node --test path/to/file.test.js`) before concluding anything — a count that varies run-to-run on identical code tracks machine load, not a regression.

- [ ] **Step 4: No commit needed unless Step 1 edited `docs/skill-graph.md`**

If it did:

```bash
git add docs/skill-graph.md
git commit -m "Update skill-graph wording for the specify/demo batch form, refs #695" -m "Claude-Session: https://claude.ai/code/session_01RJGWJQTX54MuXzgGXZ8e7a"
```

---

## Self-review (run during authoring)

**Spec coverage:** A → Task 1 (hint, Input batch paragraph, case-1 sentence, Next Actions row, Component contract, shaping-mode intro + Actions Performed). B → Task 2 (hint, Input, Step 1, Step 3, Next Actions, entry-paths, journey red flag). C → Task 3 (card rows 12/52, README 76). D → Task 4 (conditional). Tests → Task 1/2 (new pin file), Task 3 (card test back to green), Task 5 (full suite). AC "skill-graph needs no new edge — confirmed" → Task 5 Step 1. AC "wc -c ≤ 40960" → Tasks 1, 2, 5. AC "entry-paths.md reads correctly per ref" → Task 2 Step 8.

**Placeholder scan:** none of the forbidden marker tokens appear in this plan; every code step shows its literal text.

**Type/phrase consistency:** the test in Task 1 Step 1 asserts `startsWith('<#N[,#M...]|record-id[,id...]|')` — Task 1 Step 3's hint begins with exactly that; asserts `runs shaping mode once per element, in list order, sequentially` — Task 1 Step 4's paragraph contains exactly that (`it runs shaping mode once per element, in list order, sequentially —`); asserts `Batch applies to record references only` — present verbatim in Step 4; asserts `| Shaping mode — multiple records shaped in place` — Step 6's row begins with that; asserts the recommended-command string — Step 6's row contains it verbatim; asserts the three outcome tokens in backticks — Step 8's paragraph writes `shaped`, `already shaped, no-op`, `skipped: {reason}` each in backticks. Task 2's test asserts the demo hint `[#N[,#M...]]` — Step 3 sets exactly that; asserts `Step 1 → Step 2 → Step 3 to completion before the next ref begins` and `A batch is the human's own list — never a sweep` — Task 2 Step 4's block keeps each on one physical line (a substring match would otherwise miss a wrapped phrase; the block's wrapping is deliberate and noted there).
