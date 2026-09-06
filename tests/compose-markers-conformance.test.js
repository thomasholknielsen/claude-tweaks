'use strict';
// #1989: every `<!-- when: key=value -->` marker in the live skill corpus is well-formed (opens and
// closes in-file, key/value from the vocabulary plugin/bin/lib/compose-context/compose.js exports,
// nesting at most one deep) and no fenced block contains a markdown heading or a **Step N** label —
// a heading inside a fence is the one composition defect that breaks citations silently and
// repo-wide (docs/skill-authoring.md, "Conditional blocks and the composer"). Headings are kept
// outside every fence by construction; this suite is the backstop.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMarkers, MarkerError, KEYS, VOCAB } = require('../plugin/bin/lib/compose-context/compose');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const HEADING_RE = /^#{1,6} /;
const STEP_LABEL_RE = /^\*\*Step \d/;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

// text -> [] of "file:line: message" problems. Grammar problems come from parseMarkers itself
// (which validates key/value against VOCAB and nesting/closure); this adds the heading rule.
function checkMarkers(text, file) {
  let tokens;
  try { tokens = parseMarkers(text, file); } catch (err) {
    if (err instanceof MarkerError) return [`${file}:${err.line}: ${err.message}`];
    throw err;
  }
  const lines = text.split('\n');
  const problems = [];
  let depth = 0;
  tokens.forEach((token, i) => {
    if (token.type === 'open') depth += 1;
    else if (token.type === 'close') depth -= 1;
    else if (depth > 0 && !token.fenced) {
      const line = lines[i];
      if (HEADING_RE.test(line)) problems.push(`${file}:${token.line}: heading inside a when: block — "${line.trim()}"`);
      if (STEP_LABEL_RE.test(line)) problems.push(`${file}:${token.line}: Step label inside a when: block — "${line.trim()}"`);
    }
  });
  return problems;
}

test('vocabulary is the six keys compose.js exports (cited, not restated)', () => {
  assert.equal(KEYS.length, 6);
  for (const key of KEYS) assert.ok(Array.isArray(VOCAB[key]) && VOCAB[key].length >= 2, key);
});

test('every when: marker in plugin/skills/**/*.md is well-formed and no fenced block holds a heading or Step label', () => {
  const problems = [];
  let markedFiles = 0;
  for (const file of walk(SKILLS)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/<!--\s*when:/.test(text)) continue;
    markedFiles += 1;
    problems.push(...checkMarkers(text, path.relative(SKILLS, file)));
  }
  assert.ok(markedFiles >= 2, `expected at least the two #1989 sources to carry markers, saw ${markedFiles}`);
  assert.deepEqual(problems, []);
});

test('discrimination: a heading inside a when: block is reported (fixture)', () => {
  const bad = '<!-- when: mode=auto -->\n## A heading\n**Step 3: x**\n<!-- /when -->\n';
  const problems = checkMarkers(bad, 'fixture.md');
  assert.equal(problems.length, 2);
  assert.match(problems[0], /fixture\.md:2: heading inside/);
  assert.match(problems[1], /fixture\.md:3: Step label inside/);
  // a heading-shaped line inside a code fence inside the block is fine — the parser's own fence state
  assert.deepEqual(checkMarkers('<!-- when: mode=auto -->\n```bash\n# comment\n```\n<!-- /when -->\n', 'fixture.md'), []);
  // a malformed marker is reported with its line, never thrown past the check
  assert.match(checkMarkers('<!-- when: mode=auto -->\nx\n', 'fixture.md')[0], /fixture\.md:1: unclosed/);
});
