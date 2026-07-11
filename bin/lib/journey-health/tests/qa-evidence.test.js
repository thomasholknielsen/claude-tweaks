'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateQaEvidence } = require('../qa-evidence');

const NOW = Date.parse('2026-07-11T00:00:00.000Z');

function report(overrides = {}) {
  return {
    timestamp: '2026-07-01T00:00:00.000Z', // 10 days before NOW
    stories: [{ id: 'story-1', status: 'PASS' }],
    findings: [],
    ...overrides,
  };
}

test('inconclusive when the journey has no associated stories', () => {
  const result = evaluateQaEvidence([], report(), { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when there is no report', () => {
  const result = evaluateQaEvidence(['story-1'], null, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when the report is older than the staleness window', () => {
  const old = report({ timestamp: '2026-01-01T00:00:00.000Z' }); // well past 90 days before NOW
  const result = evaluateQaEvidence(['story-1'], old, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a story is absent from the report', () => {
  const result = evaluateQaEvidence(['story-1', 'story-missing'], report(), { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a story was skipped', () => {
  const r = report({ stories: [{ id: 'story-1', status: 'SKIPPED' }] });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('satisfied when all stories passed', () => {
  const r = report({ stories: [{ id: 'story-1', status: 'PASS' }, { id: 'story-2', status: 'PASS_WITH_CAVEATS' }] });
  const result = evaluateQaEvidence(['story-1', 'story-2'], r, { now: NOW });
  assert.deepStrictEqual(result, { verdict: 'satisfied' });
});

test('regression when a failed story has a code-bug finding, mapping severity High to high', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'code-bug', severity: 'High', finding: 'Checkout button is missing' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'regression');
  assert.strictEqual(result.finding.category, 'regression-suspected');
  assert.strictEqual(result.finding.severity, 'high');
  assert.strictEqual(result.finding.description, 'Checkout button is missing');
});

test('regression when a failed story has a ux-issue finding, mapping severity Medium to med', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'ux-issue', severity: 'Medium', finding: 'Layout overlaps on mobile' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'regression');
  assert.strictEqual(result.finding.severity, 'med');
});

test('inconclusive when a failed story is attributed to stale-selector', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'stale-selector', severity: 'Low', finding: 'Locator not found' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a failed story is attributed to flaky-env', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'flaky-env', severity: 'Low', finding: 'Network timeout' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a failed story has no matching findings entry at all', () => {
  const r = report({ stories: [{ id: 'story-1', status: 'FAIL' }], findings: [] });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});
