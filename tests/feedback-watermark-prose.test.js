'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #679: session-evaluation watermark — pins the prose/doc deliverables that
// ship no runtime code of their own (bin/lib/feedback/watermark.js already
// has its own unit tests in tests/bin-lib/feedback/watermark.test.js — not
// duplicated here).
//
// Read live, not frozen fixtures: this is just-shipped feature prose that is
// expected to keep evolving in place (more flags, more prompt items) rather
// than content a future migration is scheduled to delete — the same posture
// tests/pr-first-merge.test.js takes for its own recently-landed sections.
// See skill-prose-conformance-tests's Decision Framework: the
// registry-restates-code carve-out ([IL-80]) doesn't apply here either —
// none of this is a table mirroring a code structure.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const SESSION_EVAL = read('skills', 'feedback', 'session-evaluation.md');
const SKILL = read('skills', 'feedback', 'SKILL.md');
const GITIGNORE = read('.gitignore');
const STEP04 = read('skills', 'init', 'bootstrap', 'step-04-gitignore-suggestions.md');
const PLUGIN_STRUCTURE = read('docs', 'plugin-structure.md');

// --- 1. session-evaluation.md: 5th prompt item, conditional watermark offset clause ---

test('session-evaluation.md: "Prompt contents, in this order" gains a 5th, conditional watermark-offset item', () => {
  assert.match(
    SESSION_EVAL,
    /5\. \*\*Conditional — the watermark offset clause\.\*\* When `bin\/lib\/feedback\/watermark\.js`'s\s*\n\s*`readWatermark` returns non-null for the resolved transcript path/,
  );
});

test('session-evaluation.md: item 5 is explicitly omitted when no watermark exists or --full was passed', () => {
  assert.match(
    SESSION_EVAL,
    /When no watermark exists \(first invocation\) or `--full` was passed, item 5 is omitted\s*\n\s*entirely — no offset clause, no empty placeholder/,
  );
});

test('session-evaluation.md: the omission sentence follows the fenced offset-clause template, inside item 5 (ordering, not just presence)', () => {
  const item5 = SESSION_EVAL.indexOf('5. **Conditional — the watermark offset clause.**');
  const fence = SESSION_EVAL.indexOf('Evaluate from byte offset {bytesAtDispatch}');
  const omitted = SESSION_EVAL.indexOf('item 5 is omitted');
  assert.ok(item5 > 0, 'item 5 heading must exist');
  assert.ok(fence > item5, 'the offset-clause fence must come after the item 5 heading');
  assert.ok(omitted > fence, 'the omission sentence must come after the fence, still inside item 5');
});

// --- 2. session-evaluation.md: bytesAtDispatch captured before dispatch + write-failure degrade-open ---

test('session-evaluation.md: bytesAtDispatch is documented as captured BEFORE dispatch, not after', () => {
  assert.match(
    SESSION_EVAL,
    /bytesAtDispatch,\s*\/\/ captured BEFORE dispatch — the judge's own tool calls append\s*\n\s*\/\/ to the transcript while it runs, so re-stat-ing after return\s*\n\s*\/\/ would race/,
  );
});

test('session-evaluation.md: a watermark write failure degrades open — evaluation unaffected, reported not silent', () => {
  assert.match(
    SESSION_EVAL,
    /On a write failure: degrade open — the evaluation result itself is unaffected, report the write\s*\n\s*failure in Step 0's output as a one-line note, and never abort or retry the evaluation because the\s*\n\s*watermark write failed/,
  );
});

// --- 3. SKILL.md: --full at all three sites (table row, argument-hint frontmatter, $ARGUMENTS intro line) ---

test('SKILL.md frontmatter argument-hint includes --full', () => {
  assert.match(
    SKILL,
    /^argument-hint: "\[<learning text>\] \[--kind=defect\|gap\] \[--dry-run\] \[--queue\] \[--full\] \[--pre-confirmed\]"$/m,
  );
});

test('SKILL.md "$ARGUMENTS is parsed as" intro line includes --full', () => {
  assert.match(
    SKILL,
    /`\$ARGUMENTS` is parsed as `\[<learning text>\] \[--kind=<value>\] \[--dry-run\] \[--queue\] \[--full\] \[--pre-confirmed\]`:/,
  );
});

test('SKILL.md Input table has a --full row', () => {
  assert.match(
    SKILL,
    /\| `--full` \| Presence-only, meaningful only for bare\/`--queue` invocation \(Step 0's session-evaluation gather\): ignore any existing watermark/,
  );
});

// A prior agent caught and fixed a gap where the Input table had --full but
// the frontmatter/intro line did not: pin all three sites together, not just
// independently, so a future edit that touches only the table (or only the
// frontmatter) can't silently reintroduce that class of partial drift.
test('SKILL.md: --full is present at all three sites together (frontmatter, intro line, table)', () => {
  const sites = {
    'argument-hint frontmatter': /argument-hint: ".*\[--full\].*"/,
    '$ARGUMENTS intro line': /\$ARGUMENTS` is parsed as `.*\[--full\].*`:/,
    'Input table row': /\| `--full` \|/,
  };
  const missing = Object.entries(sites)
    .filter(([, re]) => !re.test(SKILL))
    .map(([name]) => name);
  assert.deepStrictEqual(missing, [], `--full missing at: ${missing.join(', ')}`);
});

// --- 4. .gitignore and step-04-gitignore-suggestions.md's fenced block both carry the ignore line ---

test('.gitignore contains the literal line .claude-tweaks/feedback/', () => {
  assert.match(GITIGNORE, /^\.claude-tweaks\/feedback\/$/m);
});

test("step-04-gitignore-suggestions.md's fenced suggestion block contains the literal line .claude-tweaks/feedback/", () => {
  const fenceStart = STEP04.indexOf('```gitignore');
  assert.ok(fenceStart >= 0, 'fenced gitignore block must exist');
  const fenceEnd = STEP04.indexOf('```', fenceStart + 3);
  assert.ok(fenceEnd > fenceStart, 'fenced gitignore block must be closed');
  const block = STEP04.slice(fenceStart, fenceEnd);
  assert.match(block, /^\.claude-tweaks\/feedback\/$/m);
});

test('.gitignore and step-04-gitignore-suggestions.md carry the byte-identical ignore line, not merely both-present variants', () => {
  const gitignoreLine = GITIGNORE.split('\n').find((l) => l.includes('.claude-tweaks/feedback'));
  const fenceStart = STEP04.indexOf('```gitignore');
  const fenceEnd = STEP04.indexOf('```', fenceStart + 3);
  const block = STEP04.slice(fenceStart, fenceEnd);
  const stepLine = block.split('\n').find((l) => l.includes('.claude-tweaks/feedback'));
  assert.strictEqual(gitignoreLine, '.claude-tweaks/feedback/');
  assert.strictEqual(stepLine, '.claude-tweaks/feedback/');
  assert.strictEqual(gitignoreLine, stepLine);
});

// --- 5. docs/plugin-structure.md: bin/lib/feedback/ family line names both modules ---

test('docs/plugin-structure.md: a bin/lib/feedback/ family line names both file-feedback.js and watermark.js', () => {
  const match = PLUGIN_STRUCTURE.match(/^bin\/lib\/feedback\/\s+→.*$/m);
  assert.ok(match, 'bin/lib/feedback/ family line must exist');
  assert.match(match[0], /file-feedback\.js/, 'family line must mention file-feedback.js');
  assert.match(match[0], /watermark\.js/, 'family line must mention watermark.js');
});
