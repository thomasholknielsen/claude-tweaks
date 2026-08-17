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
// Whitespace-flattened for substring pins below: a later re-wrap of the skill
// prose must not fail a pin whose meaning is intact, only its line breaks moved.
// Never used for argument-hint extraction (extractArgumentHint needs real
// newlines to find the frontmatter fence and the line-anchored hint field).
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

test('specify argument-hint accepts a comma-separated record-ref list', () => {
  const hint = extractArgumentHint(read('skills/specify/SKILL.md'));
  assert.ok(hint.startsWith('<#N[,#M...]|record-id[,id...]|'), `specify hint must open with the batch grammar, got: ${hint}`);
});

test('specify Input states the batch is shaping-mode-only, refs-only, and sequential', () => {
  const src = readFlat('skills/specify/SKILL.md');
  assert.ok(src.includes('runs shaping mode once per element, in list order, sequentially'), 'sequential-per-element rule missing from specify Input');
  assert.ok(src.includes('Batch applies to record references only'), 'refs-only rule missing from specify Input');
  assert.ok(src.includes('stop before touching any record and name the offending element(s)'), 'mixed-list hard-error rule missing from specify Input');
  assert.ok(src.includes('ordinary free text, resolved through cases 3-5 exactly as today'), 'no-refs free-text fallback missing from specify Input');
});

test('specify Next Actions has a multiple-records-shaped row recommending a comma-joined flow', () => {
  const src = readFlat('skills/specify/SKILL.md');
  assert.ok(src.includes('| Shaping mode — multiple records shaped in place'), 'multiple-records Next Actions row missing');
  assert.ok(src.includes('`/claude-tweaks:flow #{N1},#{N2},...` — sequential pipeline for every record shaped this run **(Recommended)**'), 'multiple-records row must recommend the comma-joined flow command');
});

test('shaping-mode Actions Performed documents the per-element outcome vocabulary', () => {
  const src = readFlat('skills/specify/shaping-mode.md');
  for (const token of ['`shaped`', '`already shaped, no-op`', '`skipped: {reason}`']) {
    assert.ok(src.includes(token), `outcome token ${token} missing from shaping-mode.md Actions Performed`);
  }
});

test('demo argument-hint accepts a comma-separated record-ref list', () => {
  const hint = extractArgumentHint(read('skills/demo/SKILL.md'));
  assert.strictEqual(hint, '[#N[,#M...]]');
});

test('demo Input states per-item completion before the next ref and never-a-sweep', () => {
  const src = readFlat('skills/demo/SKILL.md');
  assert.ok(src.includes('Step 1 → Step 2 → Step 3 to completion before the next ref begins'), 'per-item completion rule missing from demo Input');
  assert.ok(src.includes("A batch is the human's own list — never a sweep"), 'never-a-sweep restatement missing from demo Input');
  assert.ok(src.includes('Per-item failure isolation: a ref that resolves to nothing'), 'per-item failure isolation missing from demo Input');
});
