'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_TTL_HOURS,
  claimRef,
  claimPayload,
  releasePayload,
  parseClaimMarker,
} = require('../claims');

const T0 = 1720000000000; // fixed epoch ms for deterministic tests

test('claimRef formats the claims-namespace ref', () => {
  assert.strictEqual(claimRef(123), 'refs/claims/issue-123');
});

test('claimPayload builds gh api args for atomic ref creation', () => {
  const p = claimPayload({ issueNumber: 123, sha: 'abc123', runId: 'run-1', sessionId: 'sess-1', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.deepStrictEqual(p.refArgs, [
    'repos/{owner}/{repo}/git/refs',
    '-f', 'ref=refs/claims/issue-123',
    '-f', 'sha=abc123',
  ]);
});

test('claim marker round-trips through parseClaimMarker', () => {
  const p = claimPayload({ issueNumber: 7, sha: 'abc', runId: 'run-1', sessionId: 'sess-1', host: 'mac-1', now: T0 });
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'claim');
  assert.strictEqual(m.runId, 'run-1');
  assert.strictEqual(m.sessionId, 'sess-1');
  assert.strictEqual(m.host, 'mac-1');
  assert.strictEqual(m.ttlHours, DEFAULT_TTL_HOURS);
  assert.strictEqual(m.claimedAt, new Date(T0).toISOString());
});

test('claimPayload commentBody has a human-readable line after the marker', () => {
  const p = claimPayload({ issueNumber: 7, sha: 'abc', runId: 'run-1', sessionId: 's', now: T0 });
  const lines = p.commentBody.split('\n');
  assert.ok(lines[0].startsWith('<!-- agent-claim:'));
  assert.ok(lines[1].includes('run-1'));
  assert.ok(lines[1].includes('72h'));
});

test('releasePayload builds DELETE args and a release marker', () => {
  const p = releasePayload({ issueNumber: 123, runId: 'run-1', reason: 'merged: spec 12', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.deepStrictEqual(p.refDeleteArgs, [
    '-X', 'DELETE',
    'repos/{owner}/{repo}/git/refs/claims/issue-123',
  ]);
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'release');
  assert.strictEqual(m.reason, 'merged: spec 12');
  assert.strictEqual(m.releasedAt, new Date(T0).toISOString());
});

test('parseClaimMarker never throws and returns null on garbage', () => {
  const garbage = [
    null,
    undefined,
    42,
    {},
    [],
    '',
    'no marker here',
    '<!-- agent-claim: not-json -->',
    '<!-- agent-claim: [1,2] -->',
    '<!-- agent-claim: "just a string" -->',
    '<!-- agent-claim-release: {broken -->',
    '<!-- some-other-marker: {"a":1} -->',
  ];
  for (const g of garbage) {
    assert.strictEqual(parseClaimMarker(g), null, `expected null for ${String(g).slice(0, 40)}`);
  }
});

test('parseClaimMarker distinguishes claim from release markers', () => {
  const claim = parseClaimMarker('<!-- agent-claim: {"runId":"r1","claimedAt":"2026-07-04T00:00:00.000Z"} -->');
  assert.strictEqual(claim.kind, 'claim');
  const release = parseClaimMarker('<!-- agent-claim-release: {"runId":"r1","reason":"done"} -->');
  assert.strictEqual(release.kind, 'release');
});
