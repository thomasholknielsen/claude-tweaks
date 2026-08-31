# Dispatch Budget Drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `/claude-tweaks:dispatch`'s bare invocation from an interactive batch pick to a headless drain (`--budget <n|all>`), with `next` and `--batch-size` demoted to deprecated aliases and the interactive Step 3 pick retired.

**Architecture:** Prose-engineering across the dispatch skill and its consumers. The drain driver is `next`'s existing select-and-dispatch loop run up to `--budget` times with a fresh queue re-fetch per iteration — `sequential-execution.md`'s loop body is reused as-is, no second loop. Conformance tests pin the migration.

**Tech Stack:** Markdown skill files + `node --test` conformance suites.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T155933-spec-1608-1492-1489-1490-1491-1493-1494-666/spec-1492/work/1492-spec.md`

## Global Constraints

- `plugin/skills/dispatch/SKILL.md` is at **40,306 bytes** against a 40,960-byte ceiling (654 B headroom). Removing Step 3's interactive-pick text frees space; verify `wc -c` ≤ 40960 after every edit to it. If it can't fit, STOP and report rather than trimming unrelated content.
- `--budget <n|all>` semantics (must read identically to the future specify record #1491): `n` = attempt count (a Settle-failed group counts as one attempted budget unit and is never re-selected within the firing — its records carry `bot:blocked`/claim markers that the per-iteration queue re-fetch excludes), `all` = drain until the ranked set is empty.
- Define `--budget` locally in `dispatch/SKILL.md` — #762's `_shared/record-batch-input.md` is the record-*ref* grammar, not a flag grammar; note the "define locally, fold later" choice in the PR (spec's Prerequisites section authorizes this).
- `--concurrent`'s existing row in `deprecated-aliases.md` stays byte-identical — it becomes a two-hop alias (`--concurrent` → `--batch-size` → `--budget`); add a NEW row for `--batch-size`, never edit the `--concurrent` row to point past it.
- Behavior change is stated plainly: bare `dispatch` no longer shows a menu — it dispatches immediately. This goes in the PR description text (Task 3 Step 4 note) and the Configuration migration note.
- Commit style: imperative `{Verb} {what} — {detail}`, "refs #1492" (never closes/fixes), Claude-Session trailer.

---

### Task 1: Rewrite `dispatch/SKILL.md` — drain mode, aliases, Step 3 retirement

**Files:**
- Modify: `plugin/skills/dispatch/SKILL.md`

**Interfaces:**
- Produces: the exact hint + table rows Task 2's consumer sweep and Task 3's tests cite. Frontmatter `argument-hint` becomes exactly: `"[#N[,#M...]] [--budget <n|all>] [--priority high|medium|low]"`.

- [ ] **Step 1: Read the file in full**, then make these edits (keep surrounding prose style; every unlisted section stays untouched):

1. **Frontmatter `argument-hint`** → `"[#N[,#M...]] [--budget <n|all>] [--priority high|medium|low]"` (deprecated spellings are not advertised in the hint).
2. **`description:` frontmatter** — replace `Bare, next, or #N direct.` with `Bare drain (--budget), or #N direct.`
3. **When to Use bullets (lines ~33-34)** — replace the two bullets: bare `/dispatch` now "drains up to `--budget` authorized groups headlessly"; the Routine bullet becomes "A scheduled Routine fires bare `/claude-tweaks:dispatch --budget 1` for a single deterministic unit" (no `next`).
4. **Input table**:
   - `*(none)*` row → `Bare — headless drain: repeat the select-and-dispatch procedure (Step 3's ranking + Steps 4-6) over ranked authorized groups until `--budget <n|all>` groups have been attempted or the ranked set is empty. Each iteration re-fetches the authorized queue fresh (Step 2) — dispatched groups leave it by claim, and a Settle-failed group's records carry `bot:blocked`/claim markers so it is never re-selected, while still counting as one attempted budget unit. No `AskUserQuestion` fires — an interactive (human-present) bare invocation drains immediately, identically to a headless firing.`
   - `next` row → deprecated alias: `Deprecated alias for `--budget 1` — identical effect (one group selected by priority-then-age ranking), one warn-tier notice per invocation. Removal condition: read `deprecated-aliases.md` in this skill's directory.`
   - `--batch-size <n>` row → deprecated alias for `--budget <n>`, same removal-condition pointer. Keep the `--concurrent <n>` row's text unchanged except its target: it now reads "Deprecated alias for `--batch-size <n>` (itself deprecated — see `deprecated-aliases.md`'s two-hop note)".
   - New `--budget <n|all>` modifier row: bare-only; default is `dispatch-batch-size`'s value; `all` drains to empty; combined with `next` or an explicit `#N,#M,...` list it is **rejected with a one-line notice** (`--budget` composes with bare drain only; `next` already means `--budget 1`).
   - `--priority <band>` row: now reads "Suffix bare drain (or its deprecated `next` alias) — restrict the candidate pool's representative-member band before ranking…" (rest unchanged).
5. **Headless self-report paragraph (~line 61-63)** — the bare drain form now also fires unattended: change the "(`next` form only)" framing to cover the bare-drain form (and its `next` alias); the skip-this paragraph now covers only the explicit `#N`/`#N,#M,...` forms (those still always run with a human present).
6. **Step 3**:
   - Delete the **Bare** batch-table + `AskUserQuestion` block entirely (the `{batch-size}` resolution paragraph, the question spec, and the "Selecting more groups…" paragraph).
   - Replace with a **Bare (drain)** subsection: resolve `{budget}` — `--budget <n|all>` if present (or the deprecated `--batch-size`/`--concurrent` aliases, each emitting its warn-tier notice), else `dispatch-batch-size`. Then loop: run the existing `next` ranking (the `next-ranking.md` script, oversized groups excluded from the pool exactly as before) → dispatch the picked group through Steps 4-6 → re-run Step 2's queue pull → repeat until `{budget}` groups attempted or the ranking returns `null`. Report each iteration's outcome as it completes plus a final line naming remaining undispatched groups.
   - The **`next`** subsection heading gains "(deprecated alias for `--budget 1`)" and one sentence noting the notice; its ranking prose stays (the drain loop cites it).
   - Zero-eligible-groups paragraph: replace "(bare mode)" phrasing so it covers the drain's first iteration; the `next` steady-state exception now reads "a headless bare-drain (or `next`-alias) firing".
   - Blocked-exclusion + Oversized-group reports: change their `next`-form exceptions to name the headless drain form; the oversized exclusion applies to the drain's auto-selection (it reuses `next`'s ranking, so this is a wording alignment, not new logic).
7. **Step 5 (~line 174)** — replace `--batch-size`/`{batch-size}` wording with `{budget}` (Step 3's resolved budget), and `next`/`#N`: exactly one → "`#N`: exactly one; the deprecated `next` alias is `--budget 1`".
8. **Step 6 / Reporting (~line 204)** — "bare mode with M ≤ `dispatch-batch-size` groups" → "a drain firing with M ≤ `{budget}` groups"; keep the no-consolidated-console rule.
9. **Configuration (~lines 225-228)** — `dispatch-batch-size` description becomes: "Default drain budget — maximum groups one bare firing attempts sequentially… **Migration note (semantic narrowing, refs #1492):** this key previously capped the interactive pick menu's size (browsing volume); it now caps unattended dispatch volume directly — a project that set it high for convenient browsing now auto-dispatches that many groups with zero confirmation. Review your value." Per-firing CLI overrides paragraph: `--budget <n|all>` (with `--batch-size`/`--concurrent` as deprecated aliases) overrides it.
10. **Routine Configuration (~line 232)** — template prompt is now `/claude-tweaks:dispatch --budget 1` (kept at one group per firing to preserve the fleet's cadence — Task 2 edits the template itself).
11. **Next Actions (~line 245)** — `/claude-tweaks:routine create dispatch` line: "schedule a `--budget 1` dispatch drain as a recurring headless routine". Line ~242's render rule: "the bare form is definitionally interactive" is gone — bare now renders Next Actions only when a human typed it directly (same human-present rule as the other forms).
12. **Component-Skill Contract (~line 250)** — "a scheduled Routine fires `/claude-tweaks:dispatch --budget 1` headlessly"; "four forms" → recount (bare drain, explicit `#N[,#M...]`, plus deprecated aliases) — use "its forms" to avoid a literal count (CLAUDE.md cardinality rule).
13. **Anti-Patterns** — if any row references the interactive pick or `next` as primary, update it; add one row: "Re-selecting a Settle-failed group within the same drain firing | The per-iteration re-fetch excludes it (`bot:blocked`/claim markers); it counted as one attempted budget unit — move on".

- [ ] **Step 2: Verify size and internal consistency**

Run: `wc -c plugin/skills/dispatch/SKILL.md`
Expected: ≤ 40960 (STOP and report if over).
Run: `grep -n "AskUserQuestion" plugin/skills/dispatch/SKILL.md`
Expected: no hit inside Step 3's bare-mode text (the Interaction-style preamble line at the top and unrelated sections may still match — verify no selection-question remains).
Run: `grep -c "budget" plugin/skills/dispatch/SKILL.md`
Expected: ≥ 8.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/dispatch/SKILL.md
git commit -m "Retire dispatch's interactive bare pick — bare drains the queue with --budget, next/batch-size deprecated (refs #1492)"
```

---

### Task 2: Consumer sweep — aliases file, routine template, backlog hand-off, reference card, getting-started

**Files:**
- Modify: `plugin/skills/dispatch/deprecated-aliases.md`
- Modify: `plugin/skills/dispatch/routine-template.yml`
- Modify: `plugin/skills/backlog/SKILL.md` (line ~86 only — the rendered `dispatch next` Next-Actions line)
- Modify: `plugin/skills/help/reference-card.md` (line ~43 — the `/claude-tweaks:dispatch` grammar cell)
- Modify: `docs/getting-started.md` (the dispatch command entry)
- Verify-only (no change expected): `plugin/skills/backlog/overview-mode.md`, `plugin/skills/backlog/refine-lanes.md`, `plugin/skills/_shared/headless-self-report.md`

**Interfaces:**
- Consumes: Task 1's exact hint/grammar (`[#N[,#M...]] [--budget <n|all>] [--priority high|medium|low]`).

- [ ] **Step 1: `deprecated-aliases.md`** — append two sections mirroring the existing shape exactly (keep both existing sections byte-identical):

```markdown
## `--batch-size <n>` (deprecated alias for `--budget <n>`)

Same effect as `--budget <n>`, logs one warn-tier notice per invocation naming `--batch-size` as the deprecated spelling. Removal condition: once this repo's own `.claude-tweaks/policy.yml` and `skills/help/reference-card.md`'s `/claude-tweaks:dispatch` argument grammar cite only `--budget`, checked at the next minor release. Note: `--concurrent` (above) is now a two-hop alias (`--concurrent` → `--batch-size` → `--budget`); both hops' removal conditions must resolve before either alias is removed.

## `next` (deprecated alias for `--budget 1`)

Identical effect — exactly one group selected and dispatched by the existing priority-then-age ranking, unchanged zero-eligible-groups posture — with one warn-tier notice per invocation. Removal condition: once this repo's own routine fleet (`/claude-tweaks:routine status`), `skills/backlog/SKILL.md`'s Next Actions, and `skills/help/reference-card.md` cite only `--budget`, checked at the next minor release.
```

Also update the file's header sentence to say the rows below are referenced by the Input table's deprecated-alias rows (it currently names only `--concurrent`/`dispatch-pick-max-concurrent`).

- [ ] **Step 2: `routine-template.yml`** — `kickoff: dispatch --budget 1`; bump `template_version` to 10; in `notes:`, replace the opening "each firing selects exactly one file-overlap group" sentence with: "each firing runs the bare drain with an explicit `--budget 1` — exactly one file-overlap group per firing, chosen by priority-then-age ranking. `--budget 1` is stated explicitly (rather than inheriting `dispatch-batch-size`, default 3) to preserve the fleet's one-group-per-firing cadence after #1492 retired `dispatch next`; raise it deliberately if you want each firing to drain more." Keep every other note sentence.

- [ ] **Step 3: `backlog/SKILL.md` line ~86** — replace the rendered line:

Old: `**`/claude-tweaks:dispatch next`** — claim and build the single highest-priority authorized record (recommended) — bold and suffix `(recommended)` only when the dispatch line above is omitted`

New: `**`/claude-tweaks:dispatch --budget 1`** — claim and build the single highest-priority authorized record (recommended) — bold and suffix `(recommended)` only when the dispatch line above is omitted`

Touch nothing else in that file (its descriptive "mirrors the `next` form rule" prose at ~100/116 remains valid — the headless-unit rule survives under the drain form; specs #1489/#1490 own that file's larger edits).

- [ ] **Step 4: `reference-card.md` line ~43** — grammar cell → `[#N[,#M...]] [--budget <n\|all>] [--priority high\|medium\|low]`; if the description cell mentions `next`, reword to "bare drain".

- [ ] **Step 5: `docs/getting-started.md`** — find the `/claude-tweaks:dispatch` entry (`grep -n "dispatch" docs/getting-started.md`); update its described forms to bare-drain + `--budget`, removing `next` as a primary form (a one-clause "(`next`, `--batch-size`: deprecated aliases)" is fine).

- [ ] **Step 6: Verify-only files** — run `grep -n "next\|interactive" plugin/skills/backlog/overview-mode.md | grep -i dispatch` and the same for `refine-lanes.md`: confirm no rendered dispatch line references `next` or promises an interactive prompt (expected: none — lines 134/313 of overview-mode already render bare `/claude-tweaks:dispatch`). Confirm `_shared/headless-self-report.md` needs no change (its caller contract is caller-name-based, not form-based). State the three confirmations in the commit body or report.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/dispatch/deprecated-aliases.md plugin/skills/dispatch/routine-template.yml plugin/skills/backlog/SKILL.md plugin/skills/help/reference-card.md docs/getting-started.md
git commit -m "Sweep dispatch-next consumers to --budget — aliases file, routine template, backlog hand-off, reference card, getting-started (refs #1492)"
```

---

### Task 3: Test pins — update the stale pin, add the migration conformance suite

**Files:**
- Modify: `tests/flow-claim-preflight.test.js` (line ~52)
- Create: `tests/dispatch-budget-drain.test.js`

**Interfaces:**
- Consumes: Task 1's hint text and Task 2's file contents, verbatim.

- [ ] **Step 1: Update the stale pin** — in `tests/flow-claim-preflight.test.js`, the test `'dispatch/SKILL.md argument-hint drops --claim-only'` asserts `assert.match(hintLine, /--batch-size/)`. Change that one assertion to `assert.match(hintLine, /--budget/)` (the pin's purpose — hint carries the batch modifier, not `--claim-only` — survives under the new spelling). Touch nothing else in the file.

- [ ] **Step 2: Write the failing conformance suite** `tests/dispatch-budget-drain.test.js` (model style on `tests/flow-claim-preflight.test.js` — same `read()` helper shape):

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('dispatch argument-hint advertises --budget, not next/--batch-size', () => {
  const hint = read('plugin/skills/dispatch/SKILL.md').split('\n').find((l) => l.startsWith('argument-hint:'));
  assert.match(hint, /--budget <n\|all>/);
  assert.doesNotMatch(hint, /next\|/);
  assert.doesNotMatch(hint, /--batch-size/);
});

test('dispatch Step 3 no longer renders the interactive bare pick', () => {
  const content = read('plugin/skills/dispatch/SKILL.md');
  assert.doesNotMatch(content, /"Dispatch pick"/);
  assert.doesNotMatch(content, /Which groups should this firing dispatch\?/);
  assert.match(content, /--budget/);
});

test('deprecated-aliases.md carries the --batch-size and next rows without touching --concurrent', () => {
  const content = read('plugin/skills/dispatch/deprecated-aliases.md');
  assert.match(content, /## `--batch-size <n>` \(deprecated alias for `--budget <n>`\)/);
  assert.match(content, /## `next` \(deprecated alias for `--budget 1`\)/);
  assert.match(content, /## `--concurrent <n>` \(deprecated alias for `--batch-size <n>`\)/);
});

test('routine template fires an explicit --budget 1 drain', () => {
  const content = read('plugin/skills/dispatch/routine-template.yml');
  assert.match(content, /^kickoff: dispatch --budget 1$/m);
  assert.doesNotMatch(content, /^kickoff: dispatch next$/m);
});

test('backlog hand-off and reference card cite --budget, not dispatch next', () => {
  assert.doesNotMatch(read('plugin/skills/backlog/SKILL.md'), /`\/claude-tweaks:dispatch next`/);
  const card = read('plugin/skills/help/reference-card.md');
  assert.match(card, /--budget <n\\\|all>|--budget <n\|all>/);
});

test('dispatch SKILL.md stays under the 40KB ceiling', () => {
  const bytes = Buffer.byteLength(read('plugin/skills/dispatch/SKILL.md'), 'utf8');
  assert.ok(bytes <= 40960, `dispatch/SKILL.md is ${bytes} bytes — over the 40960 ceiling`);
});
```

Adjust the reference-card assertion to the file's real escaping (`\|` inside table cells) after reading the edited line — the intent is "the grammar cell cites `--budget`"; pin whichever literal Task 2 actually produced.

- [ ] **Step 3: Run the suites**

Run: `node --test tests/dispatch-budget-drain.test.js tests/flow-claim-preflight.test.js`
Expected: PASS (all — Tasks 1-2 already landed; if any assertion fails, the prose and the pin disagree: fix whichever is wrong, favoring the plan's stated text).

- [ ] **Step 4: Commit**

```bash
git add tests/dispatch-budget-drain.test.js tests/flow-claim-preflight.test.js
git commit -m "Pin the dispatch --budget migration — conformance suite + retargeted argument-hint pin (refs #1492)"
```

Note for the PR description (surface in the handoff): bare `dispatch` no longer shows a selection menu — it dispatches immediately (design intent, parent design doc's Target Shape); `dispatch-batch-size` semantics narrowed (browsing cap → unattended dispatch volume); `--budget` defined locally pending a shared flag-grammar home.

---

## Verification (whole plan)

- `node --test tests/dispatch-budget-drain.test.js tests/flow-claim-preflight.test.js` green.
- `npm test` full suite green (run centrally after the last commit).
- AC trace: AC1/AC2/AC5 → Task 1 items 4/6 (drain loop text + no AskUserQuestion) pinned by Task 3's Step-3-retirement test; AC3 → Task 1 item 4 `next` row + aliases file row; AC4 → `--batch-size` rows; AC6 → Task 2 Steps 3-6 + Task 3's hand-off test.
