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

test('parseClaimMarker: derived kind wins over a spoofed "kind" field in the marker JSON', () => {
  const spoofed = parseClaimMarker('<!-- agent-claim-release: {"kind":"claim","runId":"x"} -->');
  assert.strictEqual(spoofed.kind, 'release');
  const spoofed2 = parseClaimMarker('<!-- agent-claim: {"kind":"release","runId":"x"} -->');
  assert.strictEqual(spoofed2.kind, 'claim');
});

const { isStale, claimStatus } = require('../claims');

const H = 3600 * 1000;

function claimBodyAt(now, { runId = 'run-1', ttlHours } = {}) {
  return claimPayload({ issueNumber: 1, sha: 'x', runId, sessionId: 's', ttlHours, now }).commentBody;
}

test('claimStatus: no comments → unclaimed', () => {
  assert.deepStrictEqual(claimStatus([], T0), { claimed: false, claim: null, stale: false });
  assert.deepStrictEqual(claimStatus(undefined, T0), { claimed: false, claim: null, stale: false });
});

test('claimStatus: live claim → claimed, not stale', () => {
  const s = claimStatus([claimBodyAt(T0)], T0 + 1 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.stale, false);
  assert.strictEqual(s.claim.runId, 'run-1');
});

test('claimStatus: claim then release → unclaimed', () => {
  const release = releasePayload({ issueNumber: 1, runId: 'run-1', reason: 'merged', now: T0 + 2 * H }).commentBody;
  const s = claimStatus([claimBodyAt(T0), release], T0 + 3 * H);
  assert.strictEqual(s.claimed, false);
});

test('claimStatus: claim, release, re-claim → claimed by the second run', () => {
  const release = releasePayload({ issueNumber: 1, runId: 'run-1', reason: 'abandoned', now: T0 + 1 * H }).commentBody;
  const s = claimStatus([claimBodyAt(T0), release, claimBodyAt(T0 + 2 * H, { runId: 'run-2' })], T0 + 3 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.claim.runId, 'run-2');
});

test('claimStatus ignores non-marker comments', () => {
  const s = claimStatus(['just a human comment', claimBodyAt(T0), 'another comment'], T0 + 1 * H);
  assert.strictEqual(s.claimed, true);
});

test('claimStatus accepts gh api comment objects ({body}) directly', () => {
  const s = claimStatus([{ body: claimBodyAt(T0) }, { body: 'noise' }], T0 + 1 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.claim.runId, 'run-1');
});

test('staleness boundary: just under TTL not stale, at TTL stale, past TTL stale', () => {
  const claim = parseClaimMarker(claimBodyAt(T0));
  assert.strictEqual(isStale(claim, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claim, T0 + 72 * H), true);
  assert.strictEqual(isStale(claim, T0 + 100 * H), true);
});

test('custom ttlHours is honored', () => {
  const claim = parseClaimMarker(claimBodyAt(T0, { ttlHours: 1 }));
  assert.strictEqual(isStale(claim, T0 + 1 * H - 1), false);
  assert.strictEqual(isStale(claim, T0 + 1 * H), true);
});

test('unparseable claimedAt → claimed but never stale (fail-closed)', () => {
  const body = '<!-- agent-claim: {"runId":"r1","claimedAt":"garbage","ttlHours":1} -->';
  const s = claimStatus([body], T0 + 1000 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual(s.stale, false);
});

test('missing ttlHours defaults to 72', () => {
  const claim = { runId: 'r1', claimedAt: new Date(T0).toISOString() };
  assert.strictEqual(isStale(claim, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claim, T0 + 72 * H), true);
});

test('claimPayload note appends a third line without touching the marker', () => {
  const p = claimPayload({ issueNumber: 5, sha: 'x', runId: 'run-2', sessionId: 's', now: T0, note: 'Broke stale claim from run run-1.' });
  const lines = p.commentBody.split('\n');
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[2], 'Broke stale claim from run run-1.');
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'claim');
  assert.strictEqual(m.runId, 'run-2');
  assert.strictEqual('note' in m, false);
});

test('claimPayload without note keeps the two-line body', () => {
  const p = claimPayload({ issueNumber: 5, sha: 'x', runId: 'r', sessionId: 's', now: T0 });
  assert.strictEqual(p.commentBody.split('\n').length, 2);
});

test('releasePayload link lands in the marker JSON and the human line', () => {
  const p = releasePayload({ issueNumber: 5, runId: 'r', reason: 'merged: spec 12', link: 'https://github.com/o/r/commit/abc123', now: T0 });
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'release');
  assert.strictEqual(m.link, 'https://github.com/o/r/commit/abc123');
  assert.ok(p.commentBody.endsWith('See https://github.com/o/r/commit/abc123.'));
});

test('releasePayload without link has no link key and an unchanged human line', () => {
  const p = releasePayload({ issueNumber: 5, runId: 'r', reason: 'merged: spec 12', now: T0 });
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual('link' in m, false);
  assert.ok(p.commentBody.endsWith('merged: spec 12.'));
});
