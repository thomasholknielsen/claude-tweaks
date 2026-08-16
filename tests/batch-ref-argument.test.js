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
