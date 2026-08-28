'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #1058: auto-decision-log.md's canonical entry schema did not require a
// test-gate entry that names specific failure causes to account for every
// failure in a stated count — a partial named list (e.g. "8 fail: {6 named
// categories}") could be mistaken for a complete enumeration. Observed on
// #994's wrap-up: a decisions.md entry named 6 of 8 failure categories,
// silently omitting 2.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const AUTO_DECISION_LOG = read('plugin', 'skills', '_shared', 'auto-decision-log.md');

test('auto-decision-log.md requires test-gate failure-cause enumeration completeness', () => {
  assert.match(AUTO_DECISION_LOG, /Failure-cause completeness/);
});

test('auto-decision-log.md requires every failure be named or an explicit partial signal', () => {
  assert.match(AUTO_DECISION_LOG, /see full log at/);
});

test('auto-decision-log.md warns against an unsignaled partial named list', () => {
  assert.match(AUTO_DECISION_LOG, /Never write a partial named list/);
});

test('auto-decision-log.md cites the #994 incident that motivated this rule', () => {
  const completenessIdx = AUTO_DECISION_LOG.indexOf('## Failure-cause completeness');
  const leverIdx = AUTO_DECISION_LOG.indexOf('## Lever attribution');
  const completenessSection = AUTO_DECISION_LOG.substring(completenessIdx, leverIdx);
  assert.match(completenessSection, /#994/);
});

test('the completeness rule appears between Entry schema and Lever attribution', () => {
  const entrySchemaIdx = AUTO_DECISION_LOG.indexOf('## Entry schema');
  const completenessIdx = AUTO_DECISION_LOG.indexOf('## Failure-cause completeness');
  const leverIdx = AUTO_DECISION_LOG.indexOf('## Lever attribution');
  assert.ok(entrySchemaIdx > -1 && completenessIdx > -1 && leverIdx > -1, 'all three sections must exist');
  assert.ok(entrySchemaIdx < completenessIdx, 'completeness rule must follow Entry schema');
  assert.ok(completenessIdx < leverIdx, 'completeness rule must precede Lever attribution');
});
