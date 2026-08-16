# Reference-Card Argument-Hint Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `skills/help/reference-card.md`'s per-skill "Takes" column byte-identical (modulo `\|`/`|` escaping) to each skill's own `argument-hint` frontmatter, and add a test that keeps it that way.

**Architecture:** `skills/help/reference-card.md` has exactly three `| Command | What it does | Takes |` tables (Lifecycle ~line 7, Component ~line 21, Utility ~line 36) — a fourth table, "Artifact Lifecycle" (~line 123+), has different columns (`Skill | Produces | Consumes`) and must never be parsed as a Takes-table. A new test, `tests/reference-card-argument-hint.test.js`, parses only the three Takes-tables, extracts each row's skill name from its first-cell backtick command, resolves that skill's `argument-hint` via `extractArgumentHint` (exported from the existing `tests/argument-hint-input.test.js` for reuse — the two tests check different things: existing file checks hint-vs-Input within one skill's own file, this new one checks card-vs-hint across two files), and asserts byte-equality (after un-escaping `\|` back to `|`) unless the skill name is in an `ALLOWLIST` array (starts empty). This plan writes the test FIRST, runs it to see what it actually flags against the live file (the reference card changed upstream since this spec was filed — do not trust the spec's own cited 8-row table as current; the test is the ground truth), then fixes every flagged row until the test is green.

**Tech Stack:** Node.js (`node --test`), CommonJS, markdown table parsing (regex, no library).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T091924-spec-563-564-565-566/spec-564/work/564-spec.md`

## Global Constraints

- Exact-copy pinning (not per-row subset) — the spec's own Technical Approach made this design decision explicitly, backed by evidence (15/24 rows already byte-identical, zero intentional abbreviations found).
- `ALLOWLIST` starts empty and must have zero entries at merge time (Acceptance Criteria).
- Do not touch `tests/argument-hint-input.test.js` beyond exporting `extractArgumentHint` (Gotchas).
- Never parse the "Artifact Lifecycle" table as a Takes-table (Architecture, above) — it has different columns entirely.

---

### Task 1: Write the test, discover live drift, fix every flagged row

**Files:**
- Modify: `tests/argument-hint-input.test.js` (add `module.exports`)
- Create: `tests/reference-card-argument-hint.test.js`
- Modify: `skills/help/reference-card.md` (fix whatever the new test flags)

**Interfaces:**
- Consumes: `extractArgumentHint(content) -> string|null` (`tests/argument-hint-input.test.js`, existing function at line 44 — export it, do not duplicate it), `listSkillDirs(root)` (`bin/lib/skill-audit/skill-catalog.js`, existing — already imported by `argument-hint-input.test.js`, reuse the same import).
- Produces: no new exported interface — this is a test file plus a corpus fix.

- [ ] **Step 1: Export `extractArgumentHint`**

In `tests/argument-hint-input.test.js`, add at the end of the file:

```javascript
module.exports = { extractArgumentHint };
```

- [ ] **Step 2: Write `tests/reference-card-argument-hint.test.js`**

```javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractArgumentHint } = require('./argument-hint-input.test.js');
const { listSkillDirs } = require('../bin/lib/skill-audit/skill-catalog');

const ROOT = path.join(__dirname, '..');
const CARD_PATH = path.join(ROOT, 'skills', 'help', 'reference-card.md');
const SKILLS_DIR = path.join(ROOT, 'skills');
const SKILLS = new Set(listSkillDirs(ROOT));

// Rows that legitimately diverge from their skill's argument-hint. Empty by
// design (refs #564) -- every row in the corpus today is either already
// byte-identical or accidental staleness, never an intentional abbreviation.
const ALLOWLIST = [];

// Parse only the three `| Command | What it does | Takes |` tables --
// the file's fourth table ("Artifact Lifecycle") has different columns
// (Skill | Produces | Consumes) and must never be treated as a Takes-table.
function parseTakesRows(content) {
  const lines = content.split('\n');
  const rows = [];
  let inTakesTable = false;
  for (const line of lines) {
    if (line.startsWith('| Command | What it does | Takes |')) {
      inTakesTable = true;
      continue;
    }
    if (inTakesTable && line.startsWith('|---')) continue; // separator row
    if (inTakesTable && !line.startsWith('|')) {
      inTakesTable = false; // table ended (blank line or prose)
      continue;
    }
    if (inTakesTable) {
      const cells = line.split('|').map((c) => c.trim());
      // cells[0] is '' (leading pipe), cells[1]=Command, cells[2]=What it does, cells[3]=Takes
      if (cells.length >= 4 && cells[1]) rows.push({ command: cells[1], takes: cells[3] });
    }
  }
  return rows;
}

// First backtick command's skill name, e.g. "`/claude-tweaks:help`" -> "help",
// "`/claude-tweaks:help policy`" -> "help" (only the first colon-separated,
// space-terminated token after the namespace prefix counts as the skill name).
function resolveSkillName(command) {
  const m = command.match(/`\/(?:claude-tweaks|superpowers):([a-z0-9-]+)/);
  return m ? m[1] : null;
}

test('reference-card Takes columns match each skill\'s argument-hint byte-for-byte', () => {
  const card = fs.readFileSync(CARD_PATH, 'utf8');
  const rows = parseTakesRows(card);
  assert.ok(rows.length > 10, 'sanity check: expected the three Takes-tables to yield a substantial row set');

  const mismatches = [];
  for (const { command, takes } of rows) {
    const name = resolveSkillName(command);
    if (!name || !SKILLS.has(name)) continue; // no local skills/{name}/SKILL.md -- skip
    if (ALLOWLIST.includes(name)) continue;
    const skillMd = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    const hint = extractArgumentHint(skillMd);
    if (hint === null) continue; // skill declares no argument-hint at all
    const takesUnescaped = takes.replace(/\\\|/g, '|');
    // Takes column is wrapped in a single backtick-code-span; strip it before comparing.
    const takesStripped = takesUnescaped.startsWith('`') && takesUnescaped.endsWith('`')
      ? takesUnescaped.slice(1, -1)
      : takesUnescaped;
    if (takesStripped !== hint) {
      mismatches.push(`${name}: card has ${JSON.stringify(takesStripped)}, argument-hint is ${JSON.stringify(hint)}`);
    }
  }

  assert.deepEqual(mismatches, [], `Reference-card drift (refs #564):\n${mismatches.join('\n')}`);
});
```

- [ ] **Step 3: Run the test to see what it flags**

Run: `node --test tests/reference-card-argument-hint.test.js -v`
Expected: FAIL, with a `mismatches` list naming every row currently out of sync. Read the failure message in full — it names the skill and both values.

- [ ] **Step 4: Fix every flagged row in `skills/help/reference-card.md`**

For each mismatch the test reports, edit that skill's row in the reference card so its "Takes" column exactly equals the skill's own `argument-hint` value, escaping any literal `|` inside the value as `\|` (markdown table cells cannot contain a bare `|`), wrapped in a single backtick code span (matching every other row's existing style). Do not guess — copy the `argument-hint` value verbatim from each flagged skill's `SKILL.md` frontmatter, then apply only the `\|` escape.

Do not fix rows the test did NOT flag — trust the mechanical check over the spec's own (now possibly stale) 8-row table.

- [ ] **Step 5: Run the test again to verify it passes**

Run: `node --test tests/reference-card-argument-hint.test.js -v`
Expected: PASS.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm test 2>&1 | tail -15`
Expected: all tests pass, including the pre-existing `tests/argument-hint-input.test.js` (unaffected by the `module.exports` addition — Node's test runner doesn't care about extra exports on a file it also runs as a test file).

- [ ] **Step 7: Commit**

```bash
git add tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js skills/help/reference-card.md
git commit -m "Pin reference-card argument columns to each skill's argument-hint — refs #564"
```
