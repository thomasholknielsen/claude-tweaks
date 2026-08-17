'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../../../plugin/bin/lib/health-core/dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'skip', issue: 5 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(
    decide({ id: 'x-abc' }, issueIndex, {}),
    { action: 'suppress', issue: 5, reason: 'wontfix-label' },
  );
});

test('decide tags a label-derived suppression `wontfix-label` so callers can persist it durably', () => {
  // This reading exists nowhere but the live issue index. Callers key the
  // durable hand-off on this tag — see validate-findings-dispatch.js.
  const issueIndex = { 'x-abc': { number: 5, state: 'open', labels: ['wontfix'] } };
  assert.strictEqual(decide({ id: 'x-abc' }, issueIndex, {}).reason, 'wontfix-label');
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'x-abc': { status: 'declined' } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'suppress', reason: 'declined' });
});

test('decide tags a cache/durable declined suppression `declined`, NOT `wontfix-label`', () => {
  // Mis-tagging here would make every already-durable suppression re-persist
  // itself on every run — harmless but pure write churn against a CAS branch
  // four engines share.
  const cache = { 'x-abc': { status: 'declined' } };
  assert.strictEqual(decide({ id: 'x-abc' }, {}, cache).reason, 'declined');
  assert.strictEqual(decide({ id: 'x-abc' }, {}, {}, { 'x-abc': { lastSeenMs: 1 } }).reason, 'declined');
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

test('decide reopens a closed match using the real `gh issue list` state casing (uppercase "CLOSED", not lowercase)', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'CLOSED', labels: [] } };
  const result = decide({ id: 'x-abc' }, issueIndex, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 5);
});

test('decide skips (does not reopen) an open match using the real uppercase "OPEN" state casing', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'OPEN', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'skip', issue: 5 });
});

test('decide still suppresses a closed match that carries wontfix (reopen never overrides a standing wontfix)', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'closed', labels: ['wontfix'] } };
  assert.deepStrictEqual(
    decide({ id: 'x-abc' }, issueIndex, {}),
    { action: 'suppress', issue: 5, reason: 'wontfix-label' },
  );
});

test('decide skips (not files a duplicate) a finding the local cache marked regressed, when the run falls back to cache-only dedup', () => {
  // Simulates a later firing where --issues is unavailable (issueIndex === {})
  // after an earlier firing reopened this exact finding via the issue-index path.
  const cache = { 'x-abc': { status: 'regressed', issue: 42, lastSeenMs: 1000 } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, cache), { action: 'skip', issue: 42 });
});

test('decide suppresses a finding present in the durable declined map, even with no local cache entry at all', () => {
  // Simulates a scheduled Routine firing in a fresh, stateless container that
  // never had access to an earlier interactive session's local cache.json —
  // the whole reason durableDeclined exists.
  const durableDeclined = { 'x-abc': { lastSeenMs: 1000 } };
  assert.deepStrictEqual(
    decide({ id: 'x-abc' }, {}, {}, durableDeclined),
    { action: 'suppress', reason: 'declined' },
  );
});

test('decide suppresses a durable entry written by an earlier run\'s wontfix-label hand-off, with no issue index present', () => {
  // The end-to-end shape of the gh-absent fix: an earlier firing read the
  // `wontfix` label off the live index and persisted it; this firing has no
  // index at all (gh absent, MCP unavailable, GitHub unreachable) and must
  // still suppress rather than re-file.
  const durableDeclined = { 'x-abc': { lastSeenMs: 1000, origin: 'wontfix-label' } };
  assert.strictEqual(decide({ id: 'x-abc' }, {}, {}, durableDeclined).action, 'suppress');
});

test('decide ignores durableDeclined entries for a different fingerprint', () => {
  const durableDeclined = { 'y-other': { lastSeenMs: 1000 } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, {}, durableDeclined), { action: 'file' });
});

test('decide omitting durableDeclined entirely preserves the pre-existing cache-only behavior (backward compatible)', () => {
  assert.deepStrictEqual(decide({ id: 'x-abc' }, {}, {}), { action: 'file' });
});
