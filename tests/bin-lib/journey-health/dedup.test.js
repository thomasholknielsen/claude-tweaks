const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../../../plugin/bin/lib/journey-health/dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 7 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 7, reason: 'wontfix-label' });
});

test('decide reopens when the matching issue is closed and not wontfix (regressed)', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'closed', labels: [] } };
  const result = decide({ id: 'journeyhealth-abc' }, issueIndex, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 7);
  assert.ok(typeof result.note === 'string' && result.note.length > 0);
});

test('decide still suppresses a closed match that carries wontfix', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'closed', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 7, reason: 'wontfix-label' });
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'journeyhealth-abc': { status: 'declined', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, cache), { action: 'suppress', reason: 'declined' });
});

test('decide skips a finding the local cache marked staged (avoid re-filing while unresolved)', () => {
  const cache = { 'journeyhealth-abc': { status: 'staged', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, cache), { action: 'skip' });
});
