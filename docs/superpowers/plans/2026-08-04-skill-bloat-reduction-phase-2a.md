# Skill Bloat Reduction — Phase 2a (tooling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `bin/lib/skill-audit/`'s presence-based loss check — measured at 9–24% sensitivity against a real 100% loss — with an occurrence-count delta that reports near-total loss on the same experiment, and add the Relationship-row extractor that Phase 2's classification, graph build, and apply-time verification all read.

**Architecture:** Two pure-function modules under the existing `bin/lib/skill-audit/`, no I/O and no git. `identifiers.js` changes shape: `findLostIdentifiers(before, afterCorpus)` (binary presence, whole-tree) is replaced by `findLostOccurrences(sourceText, beforeCorpus, afterCorpus)`, which counts each identifier's occurrences in a caller-chosen scope before and after an edit and reports every identifier whose count fell. A new `relationship-rows.js` parses the `## Relationship to Other Skills` section into structured rows and returns the rest of the file, so callers can ask "does this skill cite X outside its table?" without re-implementing the section walk each time.

**Tech Stack:** Node 18+, `node --test` (built-in), CommonJS under `bin/lib/` matching existing sibling modules.

## Global Constraints

- `bin/lib/skill-audit/` is pure: no `fs`, no `child_process`, no network in the modules themselves. Test files may read repo fixtures.
- CommonJS (`'use strict';`, `require`, `module.exports`) — matches every sibling under `bin/lib/`.
- `findLostIdentifiers` has **no runtime consumer** anywhere in the repo (verified: the only matches for `skill-audit` outside the module are `package.json`'s test script and two docs lines). Removing it is safe and is the point of this plan — do not keep it alongside the replacement.
- False positives are acceptable; **false negatives are the failure this plan exists to eliminate.** When in doubt, report loss.
- Identifier matching is whitespace-normalised, because skill prose is hard-wrapped and an identifier may straddle a line break (`[IL-66]`).
- Match with `indexOf`, never a constructed `RegExp` — identifiers contain `/`, `.`, `{`, `}`, `*`, and `:`.
- Commit messages use `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. End with the `Claude-Session:` trailer. Never use a GitHub closing keyword (`closes`, `fixes`); use `refs #N` if referencing an issue.

---

### Task 1: Re-spec the loss checker as an occurrence-count delta

**Files:**
- Modify: `bin/lib/skill-audit/identifiers.js`
- Modify: `bin/lib/skill-audit/tests/identifiers.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `extractIdentifiers(text) -> string[]` (unchanged), `countOccurrences(needle, haystack) -> number`, `findLostOccurrences(sourceText, beforeCorpus, afterCorpus) -> Array<{identifier: string, before: number, after: number}>`. `findLostIdentifiers` ceases to exist.

**Why this task exists.** The shipped checker asks "does this identifier appear anywhere in the after-corpus?" Deleting `skills/review/SKILL.md`'s entire Relationship table — a 100% loss of 45 identifiers — was reported as 4/45 lost (9%) against the whole tree and 11/45 (24%) against the rest of its own file, because common identifiers like `PIPELINE_RUN_DIR` recur everywhere and always read as surviving. Counting occurrences instead of testing presence fixes this: an identifier that appeared 12 times before and 11 times after has lost an occurrence, and that is exactly the signal a relocation audit needs.

- [ ] **Step 1: Replace the loss tests with count-delta tests (they will fail)**

Replace the four `findLostIdentifiers` tests at the end of `bin/lib/skill-audit/tests/identifiers.test.js` (lines 35-55) with the block below. Leave the six `extractIdentifiers` tests above them exactly as they are. Update the `require` on line 5 to `const { extractIdentifiers, countOccurrences, findLostOccurrences } = require('../identifiers.js');` and add `const fs = require('node:fs');` / `const path = require('node:path');` after the `assert` require.

```js
test('countOccurrences: counts non-overlapping hits', () => {
  assert.strictEqual(countOccurrences('ready', 'ready set ready go ready'), 3);
  assert.strictEqual(countOccurrences('ready', 'nothing here'), 0);
});

test('countOccurrences: normalises whitespace on both sides', () => {
  assert.strictEqual(countOccurrences('merge  check', 'a merge\ncheck b'), 1);
});

test('findLostOccurrences: reports nothing when a row moves within one file', () => {
  const before = '| `/flow` | passes `PIPELINE_RUN_DIR` |\nStep 4 runs.';
  const after = 'Step 4 runs, reading `PIPELINE_RUN_DIR` from the invoking pipeline.';
  assert.deepStrictEqual(findLostOccurrences(before, before, after), []);
});

test('findLostOccurrences: reports a drop even when the identifier survives elsewhere', () => {
  // The whole point: `PIPELINE_RUN_DIR` still appears, but one occurrence vanished.
  const row = 'passes `PIPELINE_RUN_DIR` to the child run';
  const before = 'Step 4 reads `PIPELINE_RUN_DIR`.\n' + row;
  const after = 'Step 4 reads `PIPELINE_RUN_DIR`.';
  assert.deepStrictEqual(findLostOccurrences(row, before, after), [
    { identifier: 'PIPELINE_RUN_DIR', before: 2, after: 1 },
  ]);
});

test('findLostOccurrences: returns empty when the source text has no identifiers', () => {
  assert.deepStrictEqual(findLostOccurrences('plain prose', 'anything', 'anything'), []);
});

test('findLostOccurrences: acceptance — deleting a whole Relationship table reports near-total loss', () => {
  const file = path.join(__dirname, '..', '..', '..', '..', 'skills', 'review', 'SKILL.md');
  const before = fs.readFileSync(file, 'utf8');
  const lines = before.split('\n');
  const start = lines.findIndex((l) => /^##\s+Relationship to Other Skills/.test(l));
  assert.ok(start > 0, 'review/SKILL.md must still have a Relationship section');
  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end += 1;

  const table = lines.slice(start, end).join('\n');
  const after = lines.slice(0, start).concat(lines.slice(end)).join('\n');
  const ids = extractIdentifiers(table);
  assert.ok(ids.length >= 20, `expected a substantial table, got ${ids.length} identifiers`);

  const lost = findLostOccurrences(table, before, after);
  const ratio = lost.length / ids.length;
  assert.ok(
    ratio >= 0.95,
    `expected >=95% of ${ids.length} identifiers reported lost, got ${lost.length} (${(ratio * 100).toFixed(0)}%)`,
  );
});
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `node --test bin/lib/skill-audit/tests/identifiers.test.js`
Expected: FAIL — `countOccurrences is not a function` and `findLostOccurrences is not a function`. The six `extractIdentifiers` tests still pass.

- [ ] **Step 3: Rewrite the module**

Replace the whole of `bin/lib/skill-audit/identifiers.js` with:

```js
'use strict';

const BACKTICKED = /`([^`\n]+)`/g;
const STEP_REF = /\bStep \d+(?:\.\d+)?\b/g;
const MIN_LENGTH = 4;

function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function extractIdentifiers(text) {
  const source = String(text);
  const found = new Set();

  for (const m of source.matchAll(BACKTICKED)) {
    const token = m[1].trim();
    if (token.length < MIN_LENGTH) continue;
    // Skill references (`/claude-tweaks:flow`) and paths are edge labels, not payload.
    if (token.startsWith('/')) continue;
    found.add(token);
  }
  for (const m of source.matchAll(STEP_REF)) {
    found.add(m[0]);
  }

  return [...found].sort();
}

// indexOf rather than RegExp: identifiers routinely contain / . { } * : and ( ).
function countOccurrences(needle, haystack) {
  const n = normalize(needle);
  if (!n) return 0;
  const h = normalize(haystack);
  let count = 0;
  let from = 0;
  for (;;) {
    const at = h.indexOf(n, from);
    if (at === -1) return count;
    count += 1;
    from = at + n.length;
  }
}

// Reports every identifier in sourceText whose occurrence count fell between the
// two corpora. The caller chooses the scope: the source file plus every file named
// as a relocation destination. Counting rather than testing presence is deliberate —
// common identifiers recur across the tree, so presence always reads as "survived"
// no matter what happened to the row that carried them.
function findLostOccurrences(sourceText, beforeCorpus, afterCorpus) {
  const before = normalize(beforeCorpus);
  const after = normalize(afterCorpus);
  const lost = [];

  for (const identifier of extractIdentifiers(sourceText)) {
    const b = countOccurrences(identifier, before);
    const a = countOccurrences(identifier, after);
    if (a < b) lost.push({ identifier, before: b, after: a });
  }

  return lost;
}

module.exports = { extractIdentifiers, countOccurrences, findLostOccurrences };
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node --test bin/lib/skill-audit/tests/identifiers.test.js`
Expected: PASS, 11 tests.

If the acceptance test fails with a ratio below 0.95, do **not** lower the threshold — report the actual ratio and the identifiers that were not reported lost. A miss there means the counting scope is wrong, which is the bug this task exists to fix.

- [ ] **Step 5: Prove the test discriminates**

Temporarily change `if (a < b)` to `if (a === 0 && b > 0)` — this restores the old presence-based semantics inside the new signature.

Run: `node --test bin/lib/skill-audit/tests/identifiers.test.js`
Expected: FAIL on both the "reports a drop even when the identifier survives elsewhere" test and the acceptance test, with the acceptance ratio printed well below 0.95. Record the printed ratio in the task report — it is the direct before/after measurement of the fix.

Revert the line to `if (a < b)` and re-run. Expected: PASS, 11 tests. **Verify the revert landed** by grepping: `grep -n 'a < b' bin/lib/skill-audit/identifiers.js` must return exactly one line.

- [ ] **Step 6: Run the full suite**

Run: `npm test 2>&1 | tail -20`
Expected: 0 failures. Nothing outside this module imports `findLostIdentifiers`, so its removal breaks nothing.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/skill-audit/identifiers.js bin/lib/skill-audit/tests/identifiers.test.js
git diff --cached --name-only   # verify exactly these two files
git commit -m "$(cat <<'EOF'
Re-spec the skill-audit loss check as an occurrence-count delta

Presence-based detection reported 9-24% loss when a whole Relationship
table was deleted, because common identifiers recur across the tree and
always read as surviving. Counting occurrences within a caller-chosen
scope reports the same experiment at near-total loss, which is the
signal Phase 2's relocation audit needs.

findLostIdentifiers is removed rather than kept alongside; it had no
runtime consumer. The acceptance test runs the deletion experiment
against skills/review/SKILL.md directly.

Claude-Session: https://claude.ai/code/session_01WV3gNDxbbTvRr6R38zEVKi
EOF
)"
```

---

### Task 2: Add the Relationship-row extractor

**Files:**
- Create: `bin/lib/skill-audit/relationship-rows.js`
- Create: `bin/lib/skill-audit/tests/relationship-rows.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 — the two modules are independent.
- Produces: `extractRelationshipRows(markdown) -> Array<{line: number, target: string, description: string, raw: string}>` and `bodyOutsideSection(markdown) -> string`.

**Why this task exists.** Phase 2 reads the Relationship section four times over: to build the classification corpus, to generate `docs/skill-graph.md`, to answer "does this skill already cite `_shared/x.md` outside its table?", and to verify at apply time that nothing was dropped. One parser, tested once, beats four ad-hoc section walks. **31 of the 32 skills have this section as the last one in the file**, so a walker that requires a following `##` heading silently truncates almost every table — the tests below pin that case.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/skill-audit/tests/relationship-rows.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractRelationshipRows, bodyOutsideSection } = require('../relationship-rows.js');

const SECTION = [
  '## Relationship to Other Skills',
  '',
  '| Skill | Relationship |',
  '|-------|-------------|',
  '| `/claude-tweaks:build` | Produces the code review reads |',
  '| `_shared/work-record.md` | Taxonomy home |',
].join('\n');

test('extractRelationshipRows: parses target and description, skipping header and rule', () => {
  const rows = extractRelationshipRows(`# Skill\n\nProse.\n\n${SECTION}\n`);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].target, '`/claude-tweaks:build`');
  assert.strictEqual(rows[0].description, 'Produces the code review reads');
  assert.strictEqual(rows[1].target, '`_shared/work-record.md`');
});

test('extractRelationshipRows: reports 1-based line numbers', () => {
  const rows = extractRelationshipRows(`line1\n${SECTION}\n`);
  // line1=1, heading=2, blank=3, header=4, rule=5, first row=6
  assert.strictEqual(rows[0].line, 6);
});

test('extractRelationshipRows: handles the section being last in the file', () => {
  assert.strictEqual(extractRelationshipRows(SECTION).length, 2);
});

test('extractRelationshipRows: stops at the next ## heading', () => {
  const rows = extractRelationshipRows(`${SECTION}\n\n## Background\n\n| a | b |\n`);
  assert.strictEqual(rows.length, 2);
});

test('extractRelationshipRows: returns [] when there is no such section', () => {
  assert.deepStrictEqual(extractRelationshipRows('# Skill\n\n## Anti-Patterns\n'), []);
});

test('extractRelationshipRows: keeps an escaped pipe inside a description', () => {
  const md = `${SECTION}\n| \`/x\` | reads a \\| b |\n`;
  const rows = extractRelationshipRows(md);
  assert.strictEqual(rows[2].description, 'reads a \\| b');
});

test('bodyOutsideSection: excludes the section and keeps everything else', () => {
  const body = bodyOutsideSection(`# Skill\n\nUses \`work-record.md\` in Step 3.\n\n${SECTION}\n`);
  assert.ok(body.includes('Step 3'));
  assert.ok(!body.includes('Taxonomy home'));
});

test('bodyOutsideSection: returns the whole document when there is no section', () => {
  assert.strictEqual(bodyOutsideSection('# Skill\n'), '# Skill\n');
});

test('every shipped skill parses, and the corpus totals hold', () => {
  const skillsDir = path.join(__dirname, '..', '..', '..', '..', 'skills');
  const names = fs
    .readdirSync(skillsDir)
    .filter((n) => fs.existsSync(path.join(skillsDir, n, 'SKILL.md')))
    .sort();
  assert.strictEqual(names.length, 32);

  let total = 0;
  for (const name of names) {
    const md = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    const rows = extractRelationshipRows(md);
    assert.ok(rows.length > 0, `${name} has no Relationship rows`);
    for (const row of rows) {
      assert.ok(row.target.length > 0, `${name}:${row.line} has an empty target`);
      assert.ok(row.description.length > 0, `${name}:${row.line} has an empty description`);
    }
    total += rows.length;
  }
  assert.strictEqual(total, 510);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test bin/lib/skill-audit/tests/relationship-rows.test.js`
Expected: FAIL — `Cannot find module '../relationship-rows.js'`.

- [ ] **Step 3: Write the module**

Create `bin/lib/skill-audit/relationship-rows.js`:

```js
'use strict';

const HEADING = /^##\s+Relationship to Other Skills\b/;
const NEXT_HEADING = /^##\s/;
const RULE_ROW = /^\|\s*:?-+/;

// Returns {start, end} line indices for the section, end-exclusive, or null.
// 31 of 32 skills carry this section last, so a missing next heading means
// "runs to end of file" — not "no section".
function locate(lines) {
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !NEXT_HEADING.test(lines[end])) end += 1;
  return { start, end };
}

function extractRelationshipRows(markdown) {
  const lines = String(markdown).split('\n');
  const at = locate(lines);
  if (!at) return [];

  const rows = [];
  let sawHeader = false;

  for (let i = at.start; i < at.end; i += 1) {
    const raw = lines[i];
    if (!raw.startsWith('|')) continue;
    if (RULE_ROW.test(raw)) continue;
    if (!sawHeader) {
      sawHeader = true;
      continue;
    }
    const cells = raw.split('|');
    rows.push({
      line: i + 1,
      target: (cells[1] || '').trim(),
      // Rejoin: a description may contain an escaped pipe.
      description: cells.slice(2).join('|').replace(/\|\s*$/, '').trim(),
      raw,
    });
  }

  return rows;
}

function bodyOutsideSection(markdown) {
  const text = String(markdown);
  const lines = text.split('\n');
  const at = locate(lines);
  if (!at) return text;
  return lines.slice(0, at.start).concat(lines.slice(at.end)).join('\n');
}

module.exports = { extractRelationshipRows, bodyOutsideSection };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test bin/lib/skill-audit/tests/relationship-rows.test.js`
Expected: PASS, 9 tests.

The `total === 510` assertion is a live measurement of the corpus, cross-checked by two independent extractors during design. If it fails, do not adjust the number — report the actual total and stop; a changed corpus means the plan's premise moved.

- [ ] **Step 5: Run the full suite**

Run: `npm test 2>&1 | tail -20`
Expected: 0 failures. `package.json` already globs `bin/lib/skill-audit/tests/*.test.js`, so the new file is picked up with no wiring change — confirm the total test count rose by 9 relative to the previous run.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/skill-audit/relationship-rows.js bin/lib/skill-audit/tests/relationship-rows.test.js
git diff --cached --name-only   # verify exactly these two files
git commit -m "$(cat <<'EOF'
Add a Relationship-section parser for the Phase 2 triage

Phase 2 walks this section four times — classification corpus, skill
graph, "is this shared file cited outside the table", and apply-time
verification. One tested parser replaces four ad-hoc walks.

Pins the case that broke an earlier ad-hoc count: 31 of 32 skills carry
the section last, so requiring a following ## heading truncates nearly
every table.

Claude-Session: https://claude.ai/code/session_01WV3gNDxbbTvRr6R38zEVKi
EOF
)"
```

---

## What this plan deliberately excludes

- **No `SKILL.md` prose is edited.** Every byte of Relationship reduction is Phase 2b, gated behind the human-approved verdict table.
- **No `docs/skill-graph.md`.** Its shape depends on the classification output.
- **No version bump.** Phase 2a ships no user-visible behaviour; the bump belongs to the phase that changes skills (`[IL-12]` requires the bump step in the feature phase, and this is tooling).
- **No CLI entry point.** The classification corpus is generated by a throwaway scratchpad script, not shipped code (`[IL-69]`: decided at design time — it is a throwaway, and shipping a speculative `bin/` entry point for one use is YAGNI).
- **`_shared/auto-mode-contract.md`'s "MUST reference this file in its Relationship table" rule is not touched here.** It must be re-pointed in the same change-set that removes the tables (`[IL-02]`, `[IL-60]`) — that is Phase 2b.
