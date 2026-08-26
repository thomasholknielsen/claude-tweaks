'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

const STEP1_RECORDS = read('plugin/skills/tidy/step-1-records.md');
const STEP1_RECORDS_FLAT = readFlat('plugin/skills/tidy/step-1-records.md');

test('step-1-records.md states the worklist rule once, scoped to Shapes 1, 2, 3, 4, 5, 7, 8', () => {
  assert.ok(STEP1_RECORDS_FLAT.includes('Worklist rule (Shapes 1, 2, 3, 4, 5, 7, 8)'), 'worklist-rule heading/scope statement missing');
  assert.ok(STEP1_RECORDS_FLAT.includes("`_shared/work-record.md`'s worklist rule"), 'must cite the shared worklist rule rather than restate it');
  assert.ok(STEP1_RECORDS_FLAT.includes('Shapes 5.5 and 6 are exempt'), 'must state the two exempt shapes explicitly');
});

test('worklist-rule paragraph sits before Shape 1', () => {
  const ruleIdx = STEP1_RECORDS_FLAT.indexOf('Worklist rule (Shapes 1, 2, 3, 4, 5, 7, 8)');
  const shape1Idx = STEP1_RECORDS_FLAT.indexOf('### Shape 1');
  assert.ok(ruleIdx !== -1 && shape1Idx !== -1 && ruleIdx < shape1Idx, 'worklist rule must precede Shape 1');
});

test('Shape 7 node -e script filters out needsDefinition parents before the floor/gate-state checks', () => {
  assert.ok(STEP1_RECORDS.includes('needsDefinition: p.facets.needsDefinition === true,'), 'Shape 7 must compute a needsDefinition field per parent');
  assert.ok(STEP1_RECORDS.includes('.filter((f) => !f.needsDefinition)'), 'Shape 7 must filter out needsDefinition parents');
});

test('Shape 8 node -e script filters out needsDefinition closed records', () => {
  assert.ok(STEP1_RECORDS.includes('.filter((r) => r.facets.needsDefinition !== true)'), 'Shape 8 must filter out needsDefinition records');
});

// Go-red control: pre-change Shape 7/8 scripts had no needsDefinition-aware filter anywhere.
const { execFileSync } = require('node:child_process');
const PRE_CHANGE_STEP1_RECORDS = execFileSync(
  'git',
  ['show', 'HEAD:plugin/skills/tidy/step-1-records.md'],
  { cwd: ROOT, encoding: 'utf8' }
);

test('go-red control: pre-change file carries no needsDefinition field anywhere', () => {
  assert.ok(!PRE_CHANGE_STEP1_RECORDS.includes('needsDefinition'), 'control must not already carry a needsDefinition reference (proves the assertions above can fail)');
});
