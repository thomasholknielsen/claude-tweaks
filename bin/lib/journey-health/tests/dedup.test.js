const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 7 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 7 });
});

test('decide skips when the matching issue is closed (assumed resolved)', () => {
  const issueIndex = { 'journeyhealth-abc': { number: 7, state: 'closed', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 7 });
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'journeyhealth-abc': { status: 'declined', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, cache), { action: 'suppress' });
});

test('decide skips a finding the local cache marked staged (avoid re-filing while unresolved)', () => {
  const cache = { 'journeyhealth-abc': { status: 'staged', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'journeyhealth-abc' }, {}, cache), { action: 'skip' });
});
