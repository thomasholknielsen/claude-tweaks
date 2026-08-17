const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../../../plugin/bin/lib/docs-health/dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'docshealth-abc': { number: 42, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, issueIndex, {}), { action: 'skip', issue: 42 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'docshealth-abc': { number: 42, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 42, reason: 'wontfix-label' });
});

test('decide reopens when the matching issue is closed and not wontfix (regressed)', () => {
  const issueIndex = { 'docshealth-abc': { number: 42, state: 'closed', labels: [] } };
  const result = decide({ id: 'docshealth-abc' }, issueIndex, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 42);
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'docshealth-abc': { status: 'declined', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, {}, cache), { action: 'suppress', reason: 'declined' });
});

test('decide skips a finding the local cache marked staged', () => {
  const cache = { 'docshealth-abc': { status: 'staged', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, {}, cache), { action: 'skip' });
});
