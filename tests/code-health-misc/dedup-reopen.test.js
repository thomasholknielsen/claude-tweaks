'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../../plugin/bin/lib/code-health/dedup');

const finding = { fingerprint: 'fp-abc', risk: 'high', title: 'Oversized module' };

test('closed (non-wontfix) issue match → reopen with regressed note', () => {
  const issueIndex = { 'fp-abc': { number: 42, state: 'closed', labels: ['bug'] } };
  const d = decide(finding, issueIndex);
  assert.strictEqual(d.action, 'reopen');
  assert.strictEqual(d.issue, 42);
  assert.match(d.note, /regress/i);
});

test('wontfix issue match → suppress (standing decision respected)', () => {
  const issueIndex = { 'fp-abc': { number: 9, state: 'closed', labels: ['bug', 'wontfix'] } };
  const d = decide(finding, issueIndex);
  assert.strictEqual(d.action, 'suppress');
});

test('open issue match → skip (no flood)', () => {
  const issueIndex = { 'fp-abc': { number: 7, state: 'open', labels: ['bug'] } };
  const d = decide(finding, issueIndex);
  assert.strictEqual(d.action, 'skip');
});

test('no match → file', () => {
  const d = decide(finding, {});
  assert.strictEqual(d.action, 'file');
});
