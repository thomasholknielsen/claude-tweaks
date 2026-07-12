const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  const result = decide({ id: 'skillhealth-abc' }, {}, {});
  assert.deepStrictEqual(result, { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'skillhealth-abc': { number: 42, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 42 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'skillhealth-abc': { number: 42, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 42 });
});

test('decide reopens when the matching issue is closed and not wontfix (regressed)', () => {
  const issueIndex = { 'skillhealth-abc': { number: 42, state: 'closed', labels: [] } };
  const result = decide({ id: 'skillhealth-abc' }, issueIndex, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 42);
  assert.ok(typeof result.note === 'string' && result.note.length > 0);
});

test('decide still suppresses a closed match that carries wontfix', () => {
  const issueIndex = { 'skillhealth-abc': { number: 42, state: 'closed', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 42 });
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'skillhealth-abc': { status: 'declined', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, {}, cache), { action: 'suppress' });
});

test('decide files a finding when the local cache carries a stale "applied" status (pre-report-only cache entries fall through to file, not error)', () => {
  const cache = { 'skillhealth-abc': { status: 'applied', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, {}, cache), { action: 'file' });
});

test('decide skips a finding the local cache marked staged (avoid re-filing while unresolved)', () => {
  const cache = { 'skillhealth-abc': { status: 'staged', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, {}, cache), { action: 'skip' });
});
