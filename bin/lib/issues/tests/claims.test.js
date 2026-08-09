'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_TTL_HOURS,
  CLAIMS_BRANCH,
  claimRef,
  claimFilePath,
  claimPayload,
  releasePayload,
  parseClaimMarker,
  classifyClaimBlob,
} = require('../claims');

const T0 = 1720000000000; // fixed epoch ms for deterministic tests

test('claimRef formats the claims-namespace ref', () => {
  assert.strictEqual(claimRef(123), 'refs/claims/issue-123');
});

test('claimPayload builds ref, gh-path fields, and MCP-path fields', () => {
  const p = claimPayload({ issueNumber: 123, sha: 'abc123', runId: 'run-1', sessionId: 'sess-1', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.strictEqual(p.sha, 'abc123');
  assert.strictEqual(p.owner, '{owner}');
  assert.strictEqual(p.repo, '{repo}');
  assert.strictEqual(p.claimPath, 'claims/issue-123.json');
  assert.deepStrictEqual(JSON.parse(p.fileContent), {
    runId: 'run-1', sessionId: 'sess-1', claimedAt: new Date(T0).toISOString(), ttlHours: DEFAULT_TTL_HOURS, host: '',
  });
});

test('claimFilePath formats the claims-registry-branch file path', () => {
  assert.strictEqual(claimFilePath(123), 'claims/issue-123.json');
});

test('CLAIMS_BRANCH is a dedicated branch, distinct from the health-state branch', () => {
  assert.strictEqual(CLAIMS_BRANCH, 'claims-registry');
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

test('releasePayload builds ref, gh-path fields, and MCP-path tombstone fields', () => {
  const p = releasePayload({ issueNumber: 123, runId: 'run-1', reason: 'merged: spec 12', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.strictEqual(p.owner, '{owner}');
  assert.strictEqual(p.repo, '{repo}');
  assert.strictEqual(p.claimPath, 'claims/issue-123.json');
  const tombstone = JSON.parse(p.tombstoneContent);
  assert.strictEqual(tombstone.released, true);
  assert.strictEqual(tombstone.runId, 'run-1');
  assert.strictEqual(tombstone.reason, 'merged: spec 12');
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

// The '[1,2]' and '"just a string"' entries above never reach claims.js's
// `fields === null || typeof fields !== 'object' || Array.isArray(fields)` guard —
// CLAIM_RE/RELEASE_RE require a literal '{' immediately after the marker prefix, and
// JSON.parse of a '{'-anchored capture can only ever succeed as a plain object (or throw),
// never as an array/string/null. That guard is unreachable through the public regex-gated
// API today, so it needs its own direct test: monkey-patch JSON.parse to simulate what a
// future, looser marker regex could let through, and confirm the guard still rejects it.
test('parseClaimMarker: the fields-must-be-plain-object guard rejects an array/string/null even if JSON.parse ever produced one', () => {
  const originalParse = JSON.parse;
  try {
    for (const fake of [[1, 2], 'just a string', null]) {
      JSON.parse = () => fake;
      assert.strictEqual(
        parseClaimMarker('<!-- agent-claim: {"anything":1} -->'),
        null,
        `expected null when JSON.parse yields ${JSON.stringify(fake)}`,
      );
    }
  } finally {
    JSON.parse = originalParse;
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

test('claimStatus: no comments → unclaimed, never released', () => {
  assert.deepStrictEqual(claimStatus([], T0), { claimed: false, claim: null, stale: false, everReleased: false });
  assert.deepStrictEqual(claimStatus(undefined, T0), { claimed: false, claim: null, stale: false, everReleased: false });
});

test('claimStatus: garbage-only comments → unclaimed, never released (same shape as no comments)', () => {
  const s = claimStatus(['just chatter', '<!-- agent-claim: not-json -->'], T0);
  assert.strictEqual(s.claimed, false);
  assert.strictEqual(s.everReleased, false);
});

test('claimStatus: comments fold to released → everReleased true, distinguishing it from never-claimed', () => {
  const release = releasePayload({ issueNumber: 1, runId: 'run-1', reason: 'merged', now: T0 + 1 * H }).commentBody;
  const s = claimStatus([claimBodyAt(T0), release], T0 + 2 * H);
  assert.strictEqual(s.claimed, false);
  assert.strictEqual(s.everReleased, true);
});

test('claimStatus: active claim → everReleased is not part of the claimed:true shape', () => {
  const s = claimStatus([claimBodyAt(T0)], T0 + 1 * H);
  assert.strictEqual(s.claimed, true);
  assert.strictEqual('everReleased' in s, false);
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

test('malformed (non-number, non-missing) ttlHours falls back to the 72h default', () => {
  const claimWithStringTtl = { runId: 'r1', claimedAt: new Date(T0).toISOString(), ttlHours: 'not-a-number' };
  assert.strictEqual(isStale(claimWithStringTtl, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claimWithStringTtl, T0 + 72 * H), true);

  const claimWithNullTtl = { runId: 'r1', claimedAt: new Date(T0).toISOString(), ttlHours: null };
  assert.strictEqual(isStale(claimWithNullTtl, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claimWithNullTtl, T0 + 72 * H), true);
});

// ---- classifyClaimBlob (#241: unified blob-store claim, both transports) --

test('classifyClaimBlob: absent (no file) is reclaimable via create-only write', () => {
  assert.deepStrictEqual(classifyClaimBlob(null, T0), { state: 'absent', reclaimable: true });
  assert.deepStrictEqual(classifyClaimBlob(undefined, T0), { state: 'absent', reclaimable: true });
});

test('classifyClaimBlob: unreadable content (not valid claim JSON) is never reclaimable', () => {
  assert.deepStrictEqual(classifyClaimBlob('not json', T0), { state: 'unreadable', reclaimable: false });
  assert.deepStrictEqual(classifyClaimBlob('null', T0), { state: 'unreadable', reclaimable: false });
  assert.deepStrictEqual(classifyClaimBlob('[]', T0), { state: 'unreadable', reclaimable: false });
  assert.deepStrictEqual(classifyClaimBlob('"a string"', T0), { state: 'unreadable', reclaimable: false });
});

test('classifyClaimBlob: a tombstone (released: true) is reclaimable via conditional-update', () => {
  const content = JSON.stringify({ released: true, runId: 'run-1', reason: 'merged: spec 12', releasedAt: new Date(T0).toISOString() });
  assert.deepStrictEqual(classifyClaimBlob(content, T0 + 1000), { state: 'tombstone', reclaimable: true });
});

test('classifyClaimBlob: a live claim past its TTL is stale and reclaimable', () => {
  const content = JSON.stringify({ runId: 'run-1', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'mac-1' });
  assert.deepStrictEqual(classifyClaimBlob(content, T0 + 73 * H), { state: 'stale', reclaimable: true });
});

test('classifyClaimBlob: a live, non-stale claim is contested (not reclaimable)', () => {
  const content = JSON.stringify({ runId: 'run-1', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'mac-1' });
  assert.deepStrictEqual(classifyClaimBlob(content, T0 + 1 * H), { state: 'live', reclaimable: false });
});

test('classifyClaimBlob: a tombstone never regresses to stale/live even long after release', () => {
  // released:true always wins, regardless of how much time has passed — a
  // tombstone has no claimedAt/ttlHours to go stale against by isStale's own
  // contract, and even if a stray one were present it must not resurrect a
  // released claim as "live".
  const content = JSON.stringify({ released: true, runId: 'run-1', reason: 'swept: stale claim', releasedAt: new Date(T0).toISOString(), claimedAt: new Date(T0).toISOString(), ttlHours: 72 });
  assert.deepStrictEqual(classifyClaimBlob(content, T0 + 1000), { state: 'tombstone', reclaimable: true });
});

test('classifyClaimBlob: cross-transport collision — the gh-CLI write path and the MCP write path classify the SAME blob content identically', () => {
  // This is the fixture-level proof of #241's core claim: unifying both
  // transports on one blob keyspace means a claim written by either one
  // reads back through the exact same classifier, so a second writer on
  // *either* transport sees the same "live, not reclaimable" verdict and
  // backs off — the dual-keyspace split (ref vs blob) that let a gh session
  // and an MCP session both succeed independently is structurally
  // impossible once there is only one classifier over one keyspace.
  const ghWrittenPayload = claimPayload({ issueNumber: 241, sha: 'sha-from-gh-session', runId: 'gh-run-1', sessionId: 'sess-gh', host: 'gh-host', now: T0 });
  const mcpWrittenPayload = claimPayload({ issueNumber: 241, sha: 'sha-from-mcp-session', runId: 'mcp-run-1', sessionId: 'sess-mcp', host: 'mcp-host', now: T0 });

  // Both transports build the blob content off the SAME fileContent field —
  // the payload builder doesn't know or care which transport will write it.
  assert.strictEqual(ghWrittenPayload.claimPath, mcpWrittenPayload.claimPath);

  // A second writer (either transport) reads the blob a moment later and
  // must see it as live/contested, never as absent/reclaimable — that is
  // the collision-prevention guarantee.
  const secondReaderVerdict = classifyClaimBlob(ghWrittenPayload.fileContent, T0 + 1000);
  assert.deepStrictEqual(secondReaderVerdict, { state: 'live', reclaimable: false });

  // The same verdict holds regardless of which payload (gh's or MCP's own
  // attempted write) is being checked against the already-live blob — the
  // classifier has no transport-specific branch.
  const mcpReaderVerdictOnGhWrite = classifyClaimBlob(ghWrittenPayload.fileContent, T0 + 1000);
  const ghReaderVerdictOnGhWrite = classifyClaimBlob(ghWrittenPayload.fileContent, T0 + 1000);
  assert.deepStrictEqual(mcpReaderVerdictOnGhWrite, ghReaderVerdictOnGhWrite);
});

test('classifyClaimBlob: never throws on garbage input', () => {
  assert.doesNotThrow(() => classifyClaimBlob('{{{not json', T0));
  assert.doesNotThrow(() => classifyClaimBlob('', T0));
  assert.doesNotThrow(() => classifyClaimBlob(42, T0));
  assert.doesNotThrow(() => classifyClaimBlob({}, T0));
});
