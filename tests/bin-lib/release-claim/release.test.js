// tests/bin-lib/release-claim/release.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  readClaimBlob, writeTombstone, isAlreadyReleasedError, releaseClaim, removeLabel,
} = require('../../../bin/lib/release-claim/release');

const NOW = Date.parse('2026-08-16T12:00:00Z');
const OWN = '2026-08-16T100000-spec-999';
const live = (runId) => JSON.stringify({ runId, sessionId: 's', claimedAt: '2026-08-16T11:00:00.000Z', ttlHours: 72, host: 'h' });
const isGet = (a) => a[0] === 'api' && a[1] === 'repos/acme/w/contents/claims/issue-999.json?ref=claims-registry';
const isPut = (a) => a[0] === 'api' && a[1] === '--method' && a[2] === 'PUT' && a[3] === 'repos/acme/w/contents/claims/issue-999.json';
const isComment = (a) => a[0] === 'issue' && a[1] === 'comment' && a[2] === '999';
const isEdit = (a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '999';
const fieldOf = (a, name) => { for (let k = 0; k < a.length; k++) if (a[k] === '-f' && String(a[k + 1]).startsWith(name + '=')) return a[k + 1].slice(name.length + 1); return undefined; };
function fakeRunner({ content, sha = 'blobsha1', putThrows, commentThrows, editThrows }) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (isGet(args)) {
      if (content === null) throw new Error('gh: Not Found (HTTP 404)');
      return JSON.stringify({ content, sha });
    }
    if (isPut(args)) { if (putThrows) throw new Error(putThrows); return '{"content":{"sha":"newsha"}}'; }
    if (isComment(args)) { if (commentThrows) throw new Error(commentThrows); return ''; }
    if (isEdit(args)) { if (editThrows) throw new Error(editThrows); return ''; }
    throw new Error('unexpected ' + args.join(' '));
  };
  return { runner, calls };
}

test('readClaimBlob: 404 -> absent; otherwise decoded content + sha', () => {
  const absent = fakeRunner({ content: null });
  assert.deepEqual(readClaimBlob({ owner: 'acme', repo: 'w', issueNumber: 999, runner: absent.runner }), { content: null, sha: null, absent: true });
  const present = fakeRunner({ content: live(OWN), sha: 'abc' });
  const r = readClaimBlob({ owner: 'acme', repo: 'w', issueNumber: 999, runner: present.runner });
  assert.equal(r.sha, 'abc');
  assert.equal(JSON.parse(r.content).runId, OWN);
  assert.match(present.calls[0].join(' '), /-q \{content: \(\.content \| @base64d\), sha: \.sha\}/);
});

test('releaseClaim happy path: read -> PUT with the read sha -> comment; exact call order + payloads', () => {
  const f = fakeRunner({ content: live(OWN), sha: 'blobsha1' });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', link: 'https://x/pr/1', runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'released');
  assert.equal(f.calls.length, 3, 'exactly read, PUT, comment — no label edits without flags');
  assert.ok(isGet(f.calls[0]));
  assert.ok(isPut(f.calls[1]));
  assert.equal(fieldOf(f.calls[1], 'sha'), 'blobsha1', 'PUT carries the sha from the read');
  assert.equal(fieldOf(f.calls[1], 'branch'), 'claims-registry');
  const tomb = JSON.parse(Buffer.from(fieldOf(f.calls[1], 'content'), 'base64').toString('utf8'));
  assert.equal(tomb.released, true);
  assert.equal(tomb.runId, OWN);
  assert.equal(tomb.reason, 'merged: spec 999');
  assert.equal(tomb.link, 'https://x/pr/1');
  assert.doesNotMatch(f.calls[1].join(' '), /-F /, 'contents-API fields are resolved strings -> -f only');
  assert.ok(isComment(f.calls[2]));
  const body = f.calls[2][f.calls[2].indexOf('--body') + 1];
  assert.match(body, /<!-- agent-claim-release: \{"runId":"2026-08-16T100000-spec-999","reason":"merged: spec 999"/);
  assert.equal(r.commentPosted, true);
});

test('releaseClaim --remove-grants adds exactly two label removals after the comment; --remove-in-progress adds bot:in-progress', () => {
  const f = fakeRunner({ content: live(OWN) });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, removeInProgress: true, runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'released');
  const edits = f.calls.filter(isEdit).map((a) => a[a.indexOf('--remove-label') + 1]);
  assert.deepEqual(edits, ['auto:build', 'auto:merge', 'bot:in-progress']);
  assert.ok(f.calls.findIndex(isComment) < f.calls.findIndex(isEdit), 'labels come after the comment');
  assert.deepEqual(r.labelsRemoved, ['auto:build', 'auto:merge', 'bot:in-progress']);
});

test('a 404/422 on the PUT still posts the comment and reports already-released', () => {
  for (const msg of ['gh: Not Found (HTTP 404)', 'gh: sha does not match (HTTP 422)']) {
    const f = fakeRunner({ content: live(OWN), putThrows: msg });
    const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', runner: f.runner, now: NOW });
    assert.equal(r.outcome, 'already-released', msg);
    assert.equal(f.calls.filter(isComment).length, 1, 'comment still posted');
    assert.equal(r.commentPosted, true);
  }
  assert.equal(isAlreadyReleasedError(new Error('HTTP 500')), false);
});

test('an absent or tombstoned blob is already-released: no PUT, comment posted, labels still processed', () => {
  const f = fakeRunner({ content: null });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'already-released');
  assert.equal(f.calls.filter(isPut).length, 0);
  assert.equal(f.calls.filter(isComment).length, 1);
  assert.equal(f.calls.filter(isEdit).length, 2);

  const ownTombstone = JSON.stringify({ released: true, runId: OWN, reason: 'merged: spec 999', releasedAt: '2026-08-16T11:30:00.000Z' });
  const t1 = fakeRunner({ content: ownTombstone, sha: 'tomb1' });
  const r1 = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, runner: t1.runner, now: NOW });
  assert.equal(r1.outcome, 'already-released');
  assert.equal(t1.calls.filter(isPut).length, 0);
  assert.equal(t1.calls.filter(isComment).length, 1);
  assert.equal(t1.calls.filter(isEdit).length, 2);

  // A tombstone is not a held lock, so the ownership rule doesn't apply here
  // (see skills/_shared/issue-claims.md's Release triggers "Ownership rule" —
  // it's scoped to a successor that *holds* the lock) — a FOREIGN tombstone
  // gets the same outcome and calls.
  const foreignTombstone = JSON.stringify({ released: true, runId: '2026-08-16T110000-spec-999', reason: 'merged: spec 999', releasedAt: '2026-08-16T11:30:00.000Z' });
  const t2 = fakeRunner({ content: foreignTombstone, sha: 'tomb1' });
  const r2 = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, runner: t2.runner, now: NOW });
  assert.equal(r2.outcome, 'already-released');
  assert.equal(t2.calls.filter(isPut).length, 0);
  assert.equal(t2.calls.filter(isComment).length, 1);
  assert.equal(t2.calls.filter(isEdit).length, 2);
});

test('a blob owned by another run exits skipped-not-owner and writes nothing', () => {
  const f = fakeRunner({ content: live('2026-08-16T110000-spec-999') });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'skipped-not-owner');
  assert.equal(r.holder, '2026-08-16T110000-spec-999');
  assert.equal(f.calls.length, 1, 'only the read');
});

test('unreadable blob fails closed to skipped-not-owner; other PUT failures -> failed with no comment', () => {
  const u = fakeRunner({ content: 'not json' });
  assert.equal(releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'r', runner: u.runner, now: NOW }).outcome, 'skipped-not-owner');
  const f = fakeRunner({ content: live(OWN), putThrows: 'HTTP 500 boom' });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'r', runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'failed');
  assert.match(r.error, /500/);
  assert.equal(f.calls.filter(isComment).length, 0);
});

test('comment failure never changes the outcome; removeLabel never throws', () => {
  const f = fakeRunner({ content: live(OWN), commentThrows: 'HTTP 502' });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'r', runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'released');
  assert.equal(r.commentPosted, false);
  assert.match(r.note, /502/);
  assert.ok(r.error === undefined || r.error === null);
  const e = fakeRunner({ content: live(OWN), editThrows: 'HTTP 404' });
  assert.equal(removeLabel({ owner: 'acme', repo: 'w', issueNumber: 999, label: 'auto:build', runner: e.runner }).ok, false);
});

test('writeTombstone composes the contents-API PUT with -f fields only', () => {
  const f = fakeRunner({ content: live(OWN) });
  writeTombstone({ owner: 'acme', repo: 'w', issueNumber: 999, sha: 's1', tombstoneContent: '{"released":true}', message: 'Release claim on issue #999', runner: f.runner });
  const a = f.calls[0];
  assert.deepEqual(a.slice(0, 4), ['api', '--method', 'PUT', 'repos/acme/w/contents/claims/issue-999.json']);
  assert.equal(fieldOf(a, 'message'), 'Release claim on issue #999');
  assert.equal(Buffer.from(fieldOf(a, 'content'), 'base64').toString('utf8'), '{"released":true}');
  assert.equal(fieldOf(a, 'sha'), 's1');
});
