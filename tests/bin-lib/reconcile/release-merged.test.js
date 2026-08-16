'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideRelease, releasedEntry } = require('../../../bin/lib/reconcile/release-merged');

// AC1: open PR always wins over issue-closed evidence
test('decideRelease: live claim + open PR + closed issue -> skip pr-open', () => {
  assert.deepStrictEqual(
    decideRelease('live', { number: 7, state: 'OPEN' }, 'CLOSED'),
    { action: 'skip', reason: 'pr-open' },
  );
});

// AC2: issue-closed evidence releases on no-pr and pr-closed-unmerged joins
test('decideRelease: live claim + no PR + closed issue -> release (issue-closed)', () => {
  const r = decideRelease('live', null, 'CLOSED');
  assert.strictEqual(r.action, 'release');
  assert.match(r.reason, /^issue-closed/);
});
test('decideRelease: stale claim + closed-unmerged PR + closed issue -> release', () => {
  const r = decideRelease('stale', { number: 7, state: 'CLOSED' }, 'CLOSED');
  assert.strictEqual(r.action, 'release');
  assert.match(r.reason, /^issue-closed/);
});

// AC3: open or unknown issue state never releases without merged-PR evidence
test('decideRelease: live claim + no PR + open issue -> skip', () => {
  assert.strictEqual(decideRelease('live', null, 'OPEN').action, 'skip');
});
test('decideRelease: live claim + no PR + unknown issue state (fetch failed) -> skip', () => {
  assert.strictEqual(decideRelease('live', null, undefined).action, 'skip');
});

// Unchanged behavior: merged-PR evidence, transports, non-candidates
test('decideRelease: merged PR still releases regardless of issue state', () => {
  assert.strictEqual(decideRelease('live', { number: 7, state: 'MERGED' }, 'OPEN').action, 'release');
});
test('decideRelease: transport failures still skip even with closed issue', () => {
  assert.strictEqual(decideRelease('live', 'gh-absent', 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('live', 'network-failure', 'CLOSED').action, 'skip');
});
test('decideRelease: tombstone/absent/unreadable never release on issue-closed', () => {
  assert.strictEqual(decideRelease('tombstone', null, 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('absent', null, 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('unreadable', null, 'CLOSED').action, 'skip');
});

// AC2 caller-dereference: released entry tolerates null / non-object prState
test('releasedEntry: null prState -> prNumber null, no throw', () => {
  assert.deepStrictEqual(releasedEntry(42, 'run-x', null), { issueNumber: 42, runId: 'run-x', prNumber: null });
});
test('releasedEntry: merged prState carries its number', () => {
  assert.deepStrictEqual(releasedEntry(42, 'run-x', { number: 9, state: 'MERGED' }), { issueNumber: 42, runId: 'run-x', prNumber: 9 });
});
