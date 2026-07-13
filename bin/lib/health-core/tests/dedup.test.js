'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'skip', issue: 5 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'suppress', issue: 5 });
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'x-abc': { status: 'declined' } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'suppress' });
});

test('decide skips a finding the local cache marked staged', () => {
  const cache = { 'x-abc': { status: 'staged' } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'skip' });
});

test('decide files a finding when the local cache carries an unrecognized status (e.g. stale "applied")', () => {
  const cache = { 'x-abc': { status: 'applied' } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'file' });
});

test('decide reopens when the matching issue is closed and not wontfix (regressed)', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'closed', labels: [] } };
  const result = decide({ id: 'x-abc' }, issueIndex, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 5);
  assert.ok(typeof result.note === 'string' && result.note.length > 0);
});

test('decide still suppresses a closed match that carries wontfix (reopen never overrides a standing wontfix)', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'closed', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'suppress', issue: 5 });
});
