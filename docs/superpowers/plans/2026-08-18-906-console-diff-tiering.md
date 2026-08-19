# Console Diff Tiering (#906) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tier the Wrap-Up Review Console's below-table patch display by each item's recorded reversibility, replacing the unconditional show-every-full-patch rule.

**Architecture:** Prose-only change with a conformance pin. The canonical rule lives once in `plugin/skills/wrap-up/console-template.md`; the one restatement (`plugin/skills/flow/multispec-console-template.md`) becomes a citation. A new `node --test` suite pins the tier rule's load-bearing clauses and pins the old phrasing to zero occurrences across `plugin/**/*.md` with whitespace-normalized matching.

**Tech Stack:** Markdown skill prose; Node built-in test runner (`node --test`), no external deps.

**Spec:** `.claude-tweaks/pipelines/2026-08-18T144500-spec-906-901-902-905/spec-906/work/906-spec.md`

## Global Constraints

- Only two files carry the display rule today (verified 2026-08-18): `plugin/skills/wrap-up/console-template.md:183` and `plugin/skills/flow/multispec-console-template.md:174`. Touch nothing else in those files.
- `tests/multi-agent-coordination.test.js` pins two subsection headings in `console-template.md` ("Low-confidence findings (not reproduced)", "Contested findings (debate inconclusive)") — the edit must not touch those headings.
- All commits reference the record as `refs #906` — never `Fixes`/`closes` (the run's PR body carries the closing keywords).
- Run commands from the worktree root: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrapup-objective-fixes`. This session's shell refuses compound Bash (`&&`, loops, heredocs) — one plain command per invocation.

---

### Task 1: Pin suite for the tiered display rule

**Files:**
- Test: `tests/console-diff-tiering.test.js` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the failing pins Task 2 and Task 3 turn green.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
// Pins #906's reversibility-tiered patch-display rule: the canonical statement
// in wrap-up/console-template.md, the citation (not restatement) in
// flow/multispec-console-template.md, and the repo-wide absence of the old
// unconditional show-every-full-patch phrasing (whitespace-normalized, so a
// restatement wrapped mid-phrase cannot slip through).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CT = path.join(ROOT, 'plugin', 'skills', 'wrap-up', 'console-template.md');
const MSCT = path.join(ROOT, 'plugin', 'skills', 'flow', 'multispec-console-template.md');

function mdFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFilesUnder(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

test('console-template.md states the reversibility-tiered display rule once, in full', () => {
  const text = fs.readFileSync(CT, 'utf8');
  assert.ok(
    text.includes('tiered by the item\'s recorded reversibility'),
    'tier rule heading clause missing',
  );
  assert.ok(
    text.includes('cat "{absolute stagePath}"'),
    'paste-ready view command for the high tier missing',
  );
  assert.ok(
    text.includes('fail toward showing more'),
    'fail-open default (unrecorded reversibility renders full) missing',
  );
  assert.ok(
    /`decisions\.md` entry — correlated by `stagePath` basename/.test(text),
    'the decisions.md consultation step of the resolution ladder missing — an implementation that always renders full for engine rows must fail this pin',
  );
  assert.ok(
    text.includes('no `stagePath` at all also renders in full'),
    'the no-stagePath full-render branch missing',
  );
});

test('multispec-console-template.md cites the canonical rule instead of restating it', () => {
  const text = fs.readFileSync(MSCT, 'utf8');
  assert.ok(
    text.includes('console-template.md') && text.includes('reversibility-tiered'),
    'multispec template must cite wrap-up/console-template.md\'s reversibility-tiered rule',
  );
});

test('the old unconditional full-patch phrasing is gone from plugin/**/*.md', () => {
  const OLD = 'show the full patch / diff for each pending item';
  const offenders = [];
  for (const f of mdFilesUnder(path.join(ROOT, 'plugin'))) {
    const normalized = fs.readFileSync(f, 'utf8').replace(/\s+/g, ' ');
    if (normalized.includes(OLD)) offenders.push(path.relative(ROOT, f));
  }
  assert.deepStrictEqual(offenders, [], 'unconditional full-patch rule restated in: ' + offenders.join(', '));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/console-diff-tiering.test.js`
Expected: FAIL — first and second tests fail (clauses absent); third test fails naming both carrier files.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/console-diff-tiering.test.js
git commit -m "Add pin suite for reversibility-tiered console diff display (refs #906)"
```

### Task 2: Replace console-template.md's trailing rule with the tiered rule

**Files:**
- Modify: `plugin/skills/wrap-up/console-template.md:183` (the final line inside the template code fence)

**Interfaces:**
- Consumes: Task 1's pins.
- Produces: the canonical tier-rule text Task 3 cites.

- [ ] **Step 1: Replace the single line**

Replace exactly this line (currently line 183, the last content line before the closing code fence):

```
Below each table, show the full patch / diff for each pending item so the user can see exactly what will change.
```

with:

```
Below each table, the patch display is tiered by the item's recorded reversibility:

- **`reversibility: low` / `med`** — show the full patch / diff inline: the user approves exactly what will change where the revert is expensive.
- **`reversibility: high`** — show one line, `{#} {target} — {summary}`, plus a paste-ready view command on its own line: `cat "{absolute stagePath}"`. `{summary}` is the finding's own `summary` field on an engine run, or the item's `STAGED`/`AUTO` line description under the prose fallback.
- Resolve an item's reversibility in this order: the item's own recorded field (staged-file preamble), then its `decisions.md` entry — correlated by `stagePath` basename, unique per staged file and present in both the console row's Disposition cell and the `STAGED` line — and only with neither recorded, fall back to the full patch (fail toward showing more). An item with no `stagePath` at all also renders in full regardless of tier — the view-command tier only exists where there is a file to view.

Worked examples, one per tier (fictional data, like every example above):

    #5  CLAUDE.md — Trim the Commands section (reversibility: med)
        {full diff rendered inline here}
    #13 docs/api.md — Document new /auth/refresh endpoint (reversibility: high)
        cat "/Users/dev/project/.claude-tweaks/pipelines/2026-05-16T143207-spec-42/staged/wrap-up-doc-1.md"
```

- [ ] **Step 2: Run the pin suite**

Run: `node --test tests/console-diff-tiering.test.js`
Expected: tests 1 passes; test 3 still FAILS (multispec restatement remains); test 2 still FAILS.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/wrap-up/console-template.md
git commit -m "Tier the Review Console's patch display by reversibility (refs #906)"
```

### Task 3: Multispec template cites the canonical rule

**Files:**
- Modify: `plugin/skills/flow/multispec-console-template.md:174`

**Interfaces:**
- Consumes: Task 2's canonical text.
- Produces: nothing further.

- [ ] **Step 1: Replace the restatement with a citation**

Replace exactly this line (currently line 174):

```
Below each table, show the full patch / diff for each pending item.
```

with:

```
Below each table, patch display follows `wrap-up/console-template.md`'s reversibility-tiered rule — full diff inline for `reversibility: low`/`med`, a one-line summary plus paste-ready view command for `high`, fail-open to the full patch when no reversibility is recorded.
```

- [ ] **Step 2: Run the pin suite**

Run: `node --test tests/console-diff-tiering.test.js`
Expected: PASS — all three tests.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/flow/multispec-console-template.md
git commit -m "Cite the tiered diff-display rule from the multispec console template (refs #906)"
```

### Task 4: Full-suite verification

**Files:**
- Test: whole repo (no edits)

**Interfaces:**
- Consumes: Tasks 1-3 committed.
- Produces: green baseline for the next spec in the run.

- [ ] **Step 1: Run the full suite**

Run: `npm test` (redirect to a log file and grep the `# pass` / `# fail` summary lines — prose pins live in suites whose filenames don't match the edited files)
Expected: 0 failures.

- [ ] **Step 2: No commit** — nothing changed; a failure here means a byte-pinned suite elsewhere pins the old phrasing: fix that suite's expectation to the tier rule (never revert the rule), then re-run.
