// tests/specify-decomposition-collapse.test.js
// Pins the "collapse decision" rules added to /specify's decomposition mode
// (record #1263): a decomposition yielding 1 work unit always collapses (no
// parent), 2 units keep a parent only when dependency-ordered, 3+ units never
// collapse, and every downstream reference to "the parent" (record-creation.md,
// SKILL.md) is conditional on that decision.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const DECOMPOSITION_MODE = 'plugin/skills/specify/decomposition-mode.md';
const RECORD_CREATION = 'plugin/skills/specify/record-creation.md';
const SKILL = 'plugin/skills/specify/SKILL.md';

// --- decomposition-mode.md: the collapse step itself ---

test('decomposition-mode.md states the 1-unit-always-collapses rule', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /1 work unit.*always collapses/i);
});

test('decomposition-mode.md states the 2-unit dependency-ordered branch (Blocked by / internal-conflict)', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /Blocked by #N.*flag between the two units/i);
  assert.match(text, /internal-conflict row/i);
});

test('decomposition-mode.md states the 2-unit independent-collapse branch', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /independent.*collapses/i);
});

test('decomposition-mode.md states ambiguity keeps the parent', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /[Aa]mbiguous.*keep the parent/);
});

test('decomposition-mode.md names the strangler-fig early-production shape as parent-keeping', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /early-production.*always parent-keeping/i);
});

test('decomposition-mode.md states 3+ units never collapse', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /3\+ work units.*never collapses/i);
});

test('the collapse-decision step cites Implicit Dependency Detection, not the ceiling-headroom flag, as its data source', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /never read the adjacent Ceiling-headroom flag/);
});

// --- decomposition-mode.md: Step 9 origin-closure + summary ---

test('decomposition-mode.md Step 9 covers all three origin-closure branches', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /Parent kept, or 2-unit collapse/);
  assert.match(text, /1-unit collapse.*[Ss]hape the origin record in place/s);
});

test('Step 9 summary template names the collapse outcome', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /Collapse outcome:/);
});

// --- the retired "exactly one parent every run" premise ---

test('the "exactly one parent" premise sentence is gone from every specify file', () => {
  for (const rel of [DECOMPOSITION_MODE, RECORD_CREATION, SKILL]) {
    assert.doesNotMatch(read(rel), /exactly one parent/i, `${rel} still contains "exactly one parent"`);
  }
});

test('the spec\'s AC#2 phrase-absence check: "one parent per decomposition" is gone from record-creation.md', () => {
  // record-creation.md's original text was "One parent per decomposition run" — Task 3's
  // fix rewrote the sentence rather than merely qualifying it in place. Spec 1263's AC#2
  // requires `grep -in "one parent per decomposition" plugin/skills/specify/record-creation.md`
  // to return zero matches; this is the literal phrase that grep checks, not the brief's
  // drafted `/exactly one parent/i` pattern (which never matched record-creation.md's actual
  // wording in the first place).
  assert.doesNotMatch(read(RECORD_CREATION), /one parent per decomposition/i);
});

// --- record-creation.md: conditional Parent record section ---

test('record-creation.md\'s Parent record section is conditional on the collapse decision', () => {
  const text = read(RECORD_CREATION);
  assert.match(text, /[Ss]kip this whole section entirely when Step 2\.6/);
});

test('record-creation.md\'s sub-issue Parent: line is conditional', () => {
  const text = read(RECORD_CREATION);
  assert.match(text, /only when Step 2\.6 kept the parent, also prefix `Parent: #\$PARENT_NUM`/);
});

test('record-creation.md defines the uniform Related: cross-link format for independent 2-unit collapse', () => {
  const text = read(RECORD_CREATION);
  assert.match(text, /Related: #N/);
  assert.match(text, /Related: \{id\}/);
});

test('record-creation.md states no parent fingerprint is minted under collapse', () => {
  const text = read(RECORD_CREATION);
  assert.match(text, /no `\{design-doc-slug\}:parent` fingerprint is ever minted/);
});

// --- SKILL.md ---

test('SKILL.md states --granularity never overrides collapse', () => {
  const text = read(SKILL);
  assert.match(text, /never overrides the collapse decision/);
});

test('the parent-record guard in SKILL.md is untouched by this change', () => {
  const text = read(SKILL);
  assert.match(text, /Parent-record guard \(before the `needs:definition` check\)/);
});

// --- AC4 gap: origin-closure wording ---

test('decomposition-mode.md Step 9 contains the literal "Superseded by decomposition:" closure wording', () => {
  const text = read(DECOMPOSITION_MODE);
  assert.match(text, /Superseded by decomposition:/);
});

// --- AC1 gap: collapse step reading-order position ---

test('Step 2.6 Collapse Decision appears between Implicit Dependency Detection and Step 2.5 in reading order', () => {
  const text = read(DECOMPOSITION_MODE);
  const idxImplicitDependency = text.indexOf('### Implicit Dependency Detection');
  const idxStep26 = text.indexOf('## Step 2.6: Collapse Decision');
  const idxStep25 = text.indexOf('## Step 2.5: Design Pre-Steps');

  assert.ok(idxImplicitDependency >= 0, 'Implicit Dependency Detection heading not found');
  assert.ok(idxStep26 >= 0, 'Step 2.6: Collapse Decision heading not found');
  assert.ok(idxStep25 >= 0, 'Step 2.5: Design Pre-Steps heading not found');

  assert.ok(idxStep26 > idxImplicitDependency, 'Step 2.6 should come after Implicit Dependency Detection');
  assert.ok(idxStep25 > idxStep26, 'Step 2.5 should come after Step 2.6 (backwards numbering in reading order)');
});

// --- byte ceiling ---

test('every touched specify file remains within the context-cost ceiling', () => {
  const CEILING_BYTES = 40960;
  for (const rel of [DECOMPOSITION_MODE, RECORD_CREATION, SKILL]) {
    const bytes = fs.statSync(path.join(REPO_ROOT, rel)).size;
    assert.ok(bytes <= CEILING_BYTES, `${rel} is ${bytes} bytes, over the ${CEILING_BYTES} ceiling`);
  }
});
