# Option-Description Consequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a documented constraint that an `AskUserQuestion` option's `description` field states the consequence of choosing it (never the deliberation behind a recommendation), and pin it with a mechanical conformance check.

**Architecture:** Two independent, small edits with no shared state or ordering dependency. (1) A one-clause addition to `docs/skill-authoring.md`'s existing "Decisions" bullet. (2) A new parser module in `plugin/bin/lib/skill-audit/` (mirroring `anti-patterns.js`'s shape: pure parse functions, unit-tested in isolation, then a corpus-wide walk) that flags any `AskUserQuestion` option `description` containing a literal `?`, plus its `node --test` suite under `tests/bin-lib/skill-audit/` — picked up automatically by `npm test`'s recursive glob (no `package.json` change).

**Tech Stack:** Node.js (`node --test`, `node:assert`, `node:fs`, `node:path`), Markdown.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044331-record-659/work/659-spec.md` (materialized from GitHub issue #659) — read both files together; this plan does not restate the spec's Current State/Gotchas.

## Global Constraints

- Do not modify any skill's `## Interaction style directive` blockquote (the byte-pinned `> **Interaction style:**` line restated at the top of every `SKILL.md`, pinned by `tests/bin-lib/skill-audit/house-structure.test.js`) — verified via `git diff` in Task 2's final step.
- The new conformance check must pass against the current shipped `plugin/skills/**/*.md` corpus unchanged — zero pre-existing violations (re-confirmed empirically below: `grep -rEon '`description`: `"[^"]*\?[^"]*"`' plugin/skills/` returns nothing as of this plan).
- No hard length-threshold gate — the spec's own empirical scan found six existing legitimate descriptions over 140 chars (up to 229) that a length gate would false-positive on. The `?` signal only.

---

### Task 1: Docs edit — state the constraint in `docs/skill-authoring.md`

**Files:**
- Modify: `docs/skill-authoring.md:47`

**Interfaces:** None — this is a documentation-only change with no code interface.

- [ ] **Step 1: Make the edit**

The current line 47 reads:

```
- **Decisions** — call the `AskUserQuestion` tool with human-readable options (2-4 typical) so the user gets a native rendered choice instead of typing a digit back. Mark the recommended option's label with `(Recommended)`.
```

Replace it with (appending one sentence to the end of the existing bullet — do not touch anything before it):

```
- **Decisions** — call the `AskUserQuestion` tool with human-readable options (2-4 typical) so the user gets a native rendered choice instead of typing a digit back. Mark the recommended option's label with `(Recommended)`. An option's `description` states the consequence of choosing it, in one clause — rejected alternatives and the reasoning behind a recommendation belong in the message body above the call (or, for a multi-item batch, in the table's own row prose), never inside an option's `description` field.
```

- [ ] **Step 2: Verify the edit landed and nothing else moved**

Run:

```bash
git diff -- docs/skill-authoring.md
```

Expected: exactly one changed line (line 47), the diff shows only the appended sentence, no other line in the file changed.

- [ ] **Step 3: Confirm no `Interaction style directive` blockquote was touched**

Run:

```bash
git diff -- 'plugin/skills/*/SKILL.md' | grep -c '^[-+]> \*\*Interaction style:\*\*'
```

Expected: `0` (no matches — this task touches only `docs/skill-authoring.md`, never a `SKILL.md`).

- [ ] **Step 4: Commit**

```bash
git add docs/skill-authoring.md
git commit -m "docs: option descriptions state consequences, never deliberation (#659)"
```

---

### Task 2: Conformance check — flag `?` in `AskUserQuestion` option descriptions

**Files:**
- Create: `plugin/bin/lib/skill-audit/option-description.js`
- Test: `tests/bin-lib/skill-audit/option-description.test.js`

**Interfaces:**
- Consumes: `plugin/bin/lib/skill-audit/skill-catalog.js`'s `listSkillDirs(pluginRoot)` (existing — returns skill directory names under `{pluginRoot}/skills/` that have their own `SKILL.md`; used the same way `anti-patterns.test.js` already uses it).
- Produces (new, defined in this task):
  - `extractDescriptionFields(markdown: string): Array<{ line: number, text: string }>` — every `` `description`: `"..."` `` occurrence in a markdown string's `AskUserQuestion` option lines, 1-indexed line number and the field's literal string content (backslash-escapes resolved the same way the corpus's own `\"` convention resolves them — i.e. `\"` counted as an escaped, non-terminating quote, not a boundary).
  - `flagQuestionMarks(fields: Array<{ line: number, text: string }>): Array<{ line: number, text: string }>` — the subset of `fields` whose `text` contains a literal `?`.
  - `listMarkdownFiles(skillsDir: string): string[]` — every `.md` file path (absolute) found by recursively walking `skillsDir`, including `SKILL.md` files and every sub-file, sorted.

- [ ] **Step 1: Write the failing unit tests for the parse functions**

Create `tests/bin-lib/skill-audit/option-description.test.js`:

```javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  extractDescriptionFields,
  flagQuestionMarks,
  listMarkdownFiles,
} = require('../../../plugin/bin/lib/skill-audit/option-description.js');
const { listSkillDirs } = require('../../../plugin/bin/lib/skill-audit/skill-catalog.js');

const SAMPLE = [
  '- Option 1 — `label`: `"Quick"`, `description`: `"~2-5 min, 5+ sources"`',
  '- Option 2 — `label`: `"Standard (Recommended)"`, `description`: `"~5-10 min, 10+ sources"`',
  '- Option 2 — `label`: `"Verify mode (Recommended)"`, `description`: `"Run the bare-topic web survey on the literal topic \\"verify\\"."`',
].join('\n');

test('extractDescriptionFields finds every description field with its 1-indexed line', () => {
  const fields = extractDescriptionFields(SAMPLE);
  assert.strictEqual(fields.length, 3);
  assert.strictEqual(fields[0].line, 1);
  assert.strictEqual(fields[0].text, '~2-5 min, 5+ sources');
  assert.strictEqual(fields[1].line, 2);
  assert.strictEqual(fields[1].text, '~5-10 min, 10+ sources');
});

test('extractDescriptionFields does not terminate early on an escaped quote', () => {
  const fields = extractDescriptionFields(SAMPLE);
  assert.strictEqual(fields[2].line, 3);
  assert.strictEqual(
    fields[2].text,
    'Run the bare-topic web survey on the literal topic \\"verify\\".',
  );
});

test('extractDescriptionFields returns empty for text with no description fields', () => {
  assert.deepStrictEqual(extractDescriptionFields('# Nothing here\n\ntext'), []);
});

// ── The guard itself. Must FAIL on the damage it describes (IL-78 shape). ──

test('flagQuestionMarks CATCHES a description containing a literal ?', () => {
  const withQuestion = SAMPLE.replace(
    '`description`: `"~2-5 min, 5+ sources"`',
    '`description`: `"Mark ready + merge? No — see body"`',
  );
  const fields = extractDescriptionFields(withQuestion);
  const flagged = flagQuestionMarks(fields);
  assert.strictEqual(flagged.length, 1, 'a description containing "?" must be flagged');
  assert.ok(flagged[0].text.includes('Mark ready + merge?'));
});

test('flagQuestionMarks reports a clean corpus as lossless (no false positives)', () => {
  const fields = extractDescriptionFields(SAMPLE);
  const flagged = flagQuestionMarks(fields);
  assert.deepStrictEqual(flagged, []);
});

test('listMarkdownFiles walks recursively and includes both SKILL.md and sub-files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'option-description-'));
  try {
    fs.mkdirSync(path.join(tmp, 'build'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'build', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'build', 'SKILL.md'), '# build');
    fs.writeFileSync(path.join(tmp, 'build', 'sub', 'nested.md'), '# nested');
    fs.writeFileSync(path.join(tmp, 'build', 'notes.txt'), 'ignored');
    const files = listMarkdownFiles(tmp).map((f) => path.relative(tmp, f)).sort();
    assert.deepStrictEqual(files, [
      path.join('build', 'SKILL.md'),
      path.join('build', 'sub', 'nested.md'),
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Corpus-wide scan — the actual conformance gate. ──

test('no shipped skills/**/*.md file has an AskUserQuestion option description containing a literal ?', () => {
  const pluginRoot = path.join(__dirname, '..', '..', '..', 'plugin');
  const skillsDir = path.join(pluginRoot, 'skills');
  const names = listSkillDirs(pluginRoot);
  assert.ok(names.length >= 30, `expected the whole skill corpus, found ${names.length}`);

  const files = listMarkdownFiles(skillsDir);
  assert.ok(files.length >= names.length, 'expected at least one file per skill');

  const violations = [];
  for (const file of files) {
    const md = fs.readFileSync(file, 'utf8');
    const fields = extractDescriptionFields(md);
    for (const flagged of flagQuestionMarks(fields)) {
      violations.push(`${path.relative(skillsDir, file)}:${flagged.line} — "${flagged.text}"`);
    }
  }
  assert.deepStrictEqual(
    violations,
    [],
    `AskUserQuestion option description(s) contain deliberation (a literal "?") instead of stating the consequence:\n${violations.join('\n')}`,
  );
});
```

- [ ] **Step 2: Run the new suite to verify it fails**

Run: `node --test tests/bin-lib/skill-audit/option-description.test.js`

Expected: every test fails with `Cannot find module '../../../plugin/bin/lib/skill-audit/option-description.js'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `plugin/bin/lib/skill-audit/option-description.js`:

```javascript
'use strict';

// Parser for `AskUserQuestion` option `description` fields authored in skill
// prose, per docs/skill-authoring.md's "Decisions" bullet: a description
// states the consequence of choosing an option, in one clause — never the
// deliberation behind a recommendation. A literal `?` inside the field is the
// discriminating signal for that failure mode (a self-posed question leaking
// into the option surface); see docs/skill-authoring.md and the record this
// module implements for why `?` was chosen over a length threshold (the
// corpus has legitimate long descriptions that a length gate would
// false-positive on).
//
// The corpus convention this parses is a single-line option block:
//   - Option N — `label`: `"..."`, `description`: `"..."`
// (in-fence templates use the same shape inside a code block). Multi-line
// description fields are out of scope — none exist in the corpus today.

const fs = require('node:fs');
const path = require('node:path');

// Matches `` `description`: `"..."` `` on one line, capturing the field's
// literal content. `(?:[^"\\]|\\.)*` is escape-aware: a backslash-escaped
// quote (`\"`) does not terminate the match, matching how the corpus already
// writes an embedded quote inside a description (e.g. research/verify-mode.md).
const DESCRIPTION_FIELD = /`description`:\s*`"((?:[^"\\]|\\.)*)"`/g;

function extractDescriptionFields(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  lines.forEach((line, idx) => {
    DESCRIPTION_FIELD.lastIndex = 0;
    let m;
    while ((m = DESCRIPTION_FIELD.exec(line)) !== null) {
      out.push({ line: idx + 1, text: m[1] });
    }
  });
  return out;
}

function flagQuestionMarks(fields) {
  return fields.filter((f) => f.text.includes('?'));
}

// Every `.md` file under `skillsDir`, recursive, sorted. Unlike
// skill-catalog.js's listSkillDirs (directory names with a SKILL.md) or
// context-cost.js's measureSubFiles (excludes SKILL.md), this returns every
// markdown file — SKILL.md and every sub-file both carry AskUserQuestion
// option blocks in this corpus.
function listMarkdownFiles(skillsDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (entry.name.endsWith('.md')) out.push(p);
    }
  };
  walk(skillsDir);
  return out.sort();
}

module.exports = { extractDescriptionFields, flagQuestionMarks, listMarkdownFiles };
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node --test tests/bin-lib/skill-audit/option-description.test.js`

Expected: all 8 tests PASS, including the corpus-wide scan (zero violations against the current shipped corpus — re-confirmed empirically via `grep -rEon '`description`: `"[^"]*\?[^"]*"`' plugin/skills/` returning nothing immediately before this task was written).

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npm test`

Expected: full suite passes, including the new suite (picked up automatically by the `find tests ... -name '*.test.js'` glob in `package.json`'s `test` script — no `package.json` edit needed) and `tests/bin-lib/skill-audit/house-structure.test.js` (unmodified — this task never touches a `SKILL.md`).

- [ ] **Step 6: Confirm no `Interaction style directive` blockquote was touched**

Run:

```bash
git diff -- 'plugin/skills/*/SKILL.md' | grep -c '^[-+]> \*\*Interaction style:\*\*'
```

Expected: `0`.

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/skill-audit/option-description.js tests/bin-lib/skill-audit/option-description.test.js
git commit -m "test: flag AskUserQuestion option descriptions containing a literal ? (#659)"
```
