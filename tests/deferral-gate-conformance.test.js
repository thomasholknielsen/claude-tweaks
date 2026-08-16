// tests/deferral-gate-conformance.test.js
// Pins skills/_shared/deferral-gate.md (prose) to bin/lib/issues/record.js's
// DEFER_REASONS (code) and to the consumers that cite the gate instead of
// restating it. #620 lays down the contract half; #621-#625 extend this file
// with per-consumer assertions.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DEFER_REASONS } = require('../bin/lib/issues/record.js');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const GATE = read('skills/_shared/deferral-gate.md');
const LEDGER = read('skills/_shared/ledger-format.md');
const AUTONOMY_SRC = read('bin/lib/issues/autonomy.js');

const REMOVAL_CONDITION = 'Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.';

// The vocabulary is the first fenced block after the "## `Defer-reason:` vocabulary"
// heading; each line is "{value} — {one-line definition}".
function parseVocabulary(md) {
  const start = md.indexOf('## `Defer-reason:` vocabulary');
  assert.ok(start >= 0, 'deferral-gate.md must have a "## `Defer-reason:` vocabulary" heading');
  const fenceOpen = md.indexOf('\n```\n', start);
  assert.ok(fenceOpen >= 0, 'vocabulary heading must be followed by a fenced list');
  const fenceClose = md.indexOf('\n```', fenceOpen + 5);
  assert.ok(fenceClose > fenceOpen, 'vocabulary fence must close');
  return md
    .slice(fenceOpen + 5, fenceClose)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.split(' — ')[0].trim());
}

// --- vocabulary: prose == code ---

test('deferral-gate.md fenced vocabulary equals DEFER_REASONS as a set (and in order)', () => {
  const prose = parseVocabulary(GATE);
  assert.deepEqual(new Set(prose), new Set(DEFER_REASONS));
  assert.deepEqual(prose, [...DEFER_REASONS]);
});

test('every vocabulary line carries a one-line definition', () => {
  const start = GATE.indexOf('## `Defer-reason:` vocabulary');
  const fenceOpen = GATE.indexOf('\n```\n', start);
  const fenceClose = GATE.indexOf('\n```', fenceOpen + 5);
  const lines = GATE.slice(fenceOpen + 5, fenceClose).split('\n').filter((l) => l.trim() !== '');
  for (const l of lines) assert.match(l, /^[a-z-]+ — \S/, l);
});

// --- fix-now criteria and bad reasons live in the gate file ---

const FIX_NOW_ANCHORS = ['≤5 files', 'not yet built', 'product/design decision', 'external state', '>10 unrelated tests'];
const BAD_REASON_ANCHORS = [
  'Out of scope of this plan', 'Following plan verbatim', 'might want X', 'Bundle of small items',
  'Premature without consumer signal', 'Plan-prescribed routing', 'severity is never a defer reason',
];

for (const anchor of FIX_NOW_ANCHORS) {
  test(`deferral-gate.md states the fix-now criterion "${anchor}"`, () => {
    assert.ok(GATE.includes(anchor));
  });
}

for (const anchor of BAD_REASON_ANCHORS) {
  test(`deferral-gate.md states the bad reason "${anchor}"`, () => {
    assert.ok(GATE.includes(anchor));
  });
}

test('deferral-gate.md names its consumers, the hard gate, re-verification, and where the reason lives', () => {
  for (const consumer of [
    'skills/review/step3-routing.md', 'skills/reflect/full-mode.md', 'skills/reflect/hindsight-mode.md',
    'skills/wrap-up/residue-sweep.md', 'skills/wrap-up/leftover-routing.md', 'skills/_shared/ledger-format.md',
  ]) assert.ok(GATE.includes(consumer), consumer);
  assert.ok(GATE.includes('## The hard gate'));
  assert.ok(GATE.includes('## Re-verification'));
  assert.ok(GATE.includes('## Where the reason lives'));
  assert.ok(GATE.includes('by key, never by position'));
});

// --- removal condition: prose == code comment ---

test('deferral-gate.md and autonomy.js carry the removal condition in the same words', () => {
  assert.ok(GATE.includes(REMOVAL_CONDITION), 'deferral-gate.md');
  assert.ok(AUTONOMY_SRC.includes(REMOVAL_CONDITION), 'autonomy.js');
});

// --- STRUCTURED_FLOOR covers the whole vocabulary (a gap would fail silently to false) ---

test('autonomy.js STRUCTURED_FLOOR has exactly one entry per DEFER_REASONS member', () => {
  const start = AUTONOMY_SRC.indexOf('const STRUCTURED_FLOOR = Object.freeze({');
  assert.ok(start >= 0, 'STRUCTURED_FLOOR literal must exist');
  const end = AUTONOMY_SRC.indexOf('});', start);
  const literal = AUTONOMY_SRC.slice(start, end);
  const keys = [...literal.matchAll(/'([a-z-]+)':\s*(?:true|false)/g)].map((m) => m[1]);
  assert.deepEqual(new Set(keys), new Set(DEFER_REASONS));
  assert.equal(keys.length, DEFER_REASONS.length, 'no duplicate keys');
});

// --- ledger-format.md cites the gate instead of owning the criteria ---

test('ledger-format.md cites _shared/deferral-gate.md and no longer restates the bad-reasons list', () => {
  assert.ok(LEDGER.includes('_shared/deferral-gate.md'));
  assert.ok(!LEDGER.includes('Bundle of small items'));
});

test('ledger-format.md keeps its Phase heading names intact (consumers grep them)', () => {
  for (const heading of [
    '### Phase 1 — Exhaust fixes (agent, silent)',
    '### Phase 2 — Present remainder (per-item user input required)',
    '### Phase 3 — Apply user decisions',
  ]) assert.ok(LEDGER.includes(heading), heading);
});
