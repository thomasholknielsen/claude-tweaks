'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isHttp404, isHttp422, ensureClaimsBranch, readClaimBlob, writeClaimBlob,
  claimOne, releaseOne, claimGroup, claimFilePath, tombstoneInFlightPr,
} = require('../../../plugin/bin/lib/issues/claim-engine');

const T0 = 1720000000000;

function http(code, msg) { const e = new Error(`${msg || 'error'} (HTTP ${code})`); return e; }

// ---- claimFilePath -----------------------------------------------------

test('claimFilePath matches the claims-registry blob path shape', () => {
  assert.equal(claimFilePath(123), 'claims/issue-123.json');
});

// ---- isHttp404 / isHttp422 ----------------------------------------------

test('isHttp404: matches only the literal (HTTP 404) suffix, not a bare 404 elsewhere', () => {
  assert.equal(isHttp404(http(404, 'Not Found')), true);
  assert.equal(isHttp404(http(500, 'issue #404 mentioned')), false, 'a 404 appearing as an issue number, not a status, must not match');
  assert.equal(isHttp404(new Error('ECONNRESET')), false);
});

test('isHttp422: matches only the literal (HTTP 422) suffix', () => {
  assert.equal(isHttp422(http(422, 'Validation Failed')), true);
  assert.equal(isHttp422(http(404, 'Not Found')), false);
});

// ---- readClaimBlob: THE 404-vs-error branch this module exists to get right ----
// This is the exact bug class the hand-rolled zsh claim loop shipped: a
// never-claimed issue (404 on the contents read) must read as a clean
// 'absent' outcome, never as an error and never as unreadable/empty content
// silently misclassified. Every other failure (auth, network, a malformed
// non-404 response) must propagate as a real thrown error instead of being
// swallowed into a false 'absent'.

test('readClaimBlob: a 404 (never-claimed issue) returns absent — content/sha both null, no throw', () => {
  const runner = () => { throw http(404, 'Not Found'); };
  const result = readClaimBlob({ owner: 'acme', repo: 'w', issueNumber: 123, runner });
  assert.deepEqual(result, { content: null, sha: null });
});

test('readClaimBlob: a non-404 failure (500, auth, network) throws — never silently treated as absent', () => {
  const cases = [http(500, 'Internal Server Error'), http(401, 'Bad credentials'), new Error('ECONNRESET')];
  for (const err of cases) {
    const runner = () => { throw err; };
    assert.throws(() => readClaimBlob({ owner: 'a', repo: 'b', issueNumber: 1, runner }), (thrown) => thrown === err);
  }
});

test('readClaimBlob: a live claim reads back content and sha from the gh -q envelope', () => {
  const marker = { runId: 'run-1', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'h' };
  const runner = (args) => {
    assert.ok(args.join(' ').includes('contents/claims/issue-123.json?ref=claims-registry'));
    return JSON.stringify({ content: JSON.stringify(marker), sha: 'abc123' });
  };
  const result = readClaimBlob({ owner: 'acme', repo: 'w', issueNumber: 123, runner });
  assert.equal(result.sha, 'abc123');
  assert.deepEqual(JSON.parse(result.content), marker);
});

// ---- writeClaimBlob: create-only vs conditional --------------------------

test('writeClaimBlob: omitting sha is a create-only write (no -f sha=...)', () => {
  const calls = [];
  const runner = (args) => { calls.push(args); return '{}'; };
  writeClaimBlob({ owner: 'a', repo: 'b', issueNumber: 1, message: 'Claim issue #1', content: '{}', runner });
  const joined = calls[0].join(' ');
  assert.doesNotMatch(joined, /-f sha=/);
  assert.match(joined, /--method PUT/);
});

test('writeClaimBlob: passing sha adds a conditional -f sha=...', () => {
  const calls = [];
  const runner = (args) => { calls.push(args); return '{}'; };
  writeClaimBlob({ owner: 'a', repo: 'b', issueNumber: 1, message: 'Release issue #1', content: '{}', sha: 'deadbeef', runner });
  assert.match(calls[0].join(' '), /-f sha=deadbeef/);
});

// ---- ensureClaimsBranch ---------------------------------------------------

test('ensureClaimsBranch: ref already exists — no create call', () => {
  const calls = [];
  const runner = (args) => { calls.push(args); if (args[1].includes('git/refs/heads/claims-registry')) return '{}'; throw new Error('unexpected ' + args.join(' ')); };
  ensureClaimsBranch({ owner: 'a', repo: 'b', runner });
  assert.equal(calls.length, 1);
});

test('ensureClaimsBranch: ref 404 — resolves default branch sha and creates', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (args[1] === 'repos/a/b/git/refs/heads/claims-registry') throw http(404, 'Not Found');
    if (joined.includes('repos/a/b -q .default_branch')) return 'main\n';
    if (joined.includes('commits/main')) return 'sha1234\n';
    if (args[1] === 'repos/a/b/git/refs') return '{}';
    throw new Error('unexpected ' + joined);
  };
  ensureClaimsBranch({ owner: 'a', repo: 'b', runner });
  const createCall = calls.find((c) => c[1] === 'repos/a/b/git/refs');
  assert.ok(createCall);
  assert.ok(createCall.includes('sha=sha1234'));
});

test('ensureClaimsBranch: create races a concurrent bootstrap (422) — tolerated as success', () => {
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.includes('git/refs/heads/claims-registry')) throw http(404);
    if (joined.includes('.default_branch')) return 'main\n';
    if (joined.includes('commits/main')) return 'sha1\n';
    if (joined === 'api repos/a/b/git/refs -f ref=refs/heads/claims-registry -f sha=sha1') throw http(422, 'Reference already exists');
    throw new Error('unexpected ' + joined);
  };
  assert.doesNotThrow(() => ensureClaimsBranch({ owner: 'a', repo: 'b', runner }));
});

test('ensureClaimsBranch: a non-404 failure on the ref check propagates', () => {
  const runner = () => { throw http(500, 'boom'); };
  assert.throws(() => ensureClaimsBranch({ owner: 'a', repo: 'b', runner }), /boom/);
});

// ---- claimOne --------------------------------------------------------------

function fakeRunnerFor({ readResult, writeErr, mirrorOk = true }) {
  return (args) => {
    const joined = args.join(' ');
    if (joined.includes('contents/claims/')) {
      if (joined.startsWith('api --method PUT')) {
        if (writeErr) throw writeErr;
        return '{}';
      }
      if (readResult === 'absent') throw http(404);
      if (readResult === 'error') throw http(500, 'boom');
      return JSON.stringify(readResult);
    }
    if (joined.includes('issue edit') || joined.includes('issue comment')) {
      if (!mirrorOk) throw new Error('mirror failed');
      return '{}';
    }
    throw new Error('unexpected ' + joined);
  };
}

test('claimOne: absent -> claimed via create-only write', () => {
  const runner = fakeRunnerFor({ readResult: 'absent' });
  const result = claimOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'claimed');
  assert.equal(result.state, 'absent');
});

test('claimOne: live, non-stale claim -> contested, holder identity surfaced', () => {
  const holder = { runId: 'run-1', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'other-host' };
  const runner = fakeRunnerFor({ readResult: { content: JSON.stringify(holder), sha: 'x' } });
  const result = claimOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-2', sessionId: 's', host: 'h', now: T0 + 1000, runner });
  assert.equal(result.outcome, 'contested');
  assert.equal(result.state, 'live');
  assert.equal(result.holder.runId, 'run-1');
});

test('claimOne: unreadable blob -> contested (fails closed, never a false reclaim)', () => {
  const runner = fakeRunnerFor({ readResult: { content: 'not json', sha: 'x' } });
  const result = claimOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'contested');
  assert.equal(result.state, 'unreadable');
});

test('claimOne: stale claim -> claimed via conditional write (sha included)', () => {
  const stale = { runId: 'run-1', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 1, host: 'h' };
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) return JSON.stringify({ content: JSON.stringify(stale), sha: 'shaX' });
    return '{}';
  };
  const result = claimOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-2', sessionId: 's', host: 'h', now: T0 + 2 * 3600 * 1000, runner });
  assert.equal(result.outcome, 'claimed');
  assert.equal(result.state, 'stale');
  const writeCall = calls.find((c) => c[1] === '--method');
  assert.ok(writeCall.includes('-f'));
  assert.ok(writeCall.join(' ').includes('sha=shaX'));
});

test('claimOne: a rejected write (raced by another writer) is a contest, not a transport error', () => {
  const runner = fakeRunnerFor({ readResult: 'absent', writeErr: http(422, 'sha mismatch') });
  const result = claimOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'contested');
});

test('claimOne: a transport error on read surfaces as outcome error, not contested', () => {
  const runner = fakeRunnerFor({ readResult: 'error' });
  const result = claimOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'error');
  assert.match(result.error, /boom/);
});

test('claimOne: a failed label/comment mirror never flips a successful claim to failure', () => {
  const runner = fakeRunnerFor({ readResult: 'absent', mirrorOk: false });
  const result = claimOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'claimed');
  assert.equal(result.mirror.labelOk, false);
  assert.equal(result.mirror.commentOk, false);
});

// ---- claimOne: pr-opened tombstone in-flight check ------------------------
// #315 — a tombstone whose reason is `pr-opened: spec {n}` and carries a
// `link` may point at a still-open PR: an already-completed build for this
// same issue. Re-claiming (and re-building) in that case would race a live
// PR. `claimOne` must consult the linked PR's state before treating the
// tombstone as a plain reclaim, and must fail OPEN (fall through to today's
// reclaim behavior) on anything but a positive `OPEN` reading.

function prOpenedTombstone(link) {
  return JSON.stringify({ released: true, runId: 'run-1', reason: 'pr-opened: spec 272', releasedAt: new Date(T0).toISOString(), link });
}

test('claimOne: pr-opened tombstone with an OPEN linked PR -> in-flight, never reclaims', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) throw new Error('must not write a fresh claim while the linked PR is still open');
    if (joined.includes('contents/claims/')) return JSON.stringify({ content: prOpenedTombstone('https://github.com/acme/w/pull/304'), sha: 'shaT' });
    if (joined.startsWith('pr view')) {
      assert.ok(joined.includes('https://github.com/acme/w/pull/304'));
      return 'OPEN\n';
    }
    throw new Error('unexpected ' + joined);
  };
  const result = claimOne({ owner: 'acme', repo: 'w', issueNumber: 272, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'in-flight');
  assert.equal(result.state, 'tombstone');
  assert.equal(result.link, 'https://github.com/acme/w/pull/304');
  assert.ok(!calls.some((c) => c.join(' ').startsWith('api --method PUT')), 'no claim write must happen while the PR is open');
});

test('claimOne: pr-opened tombstone whose linked PR is CLOSED/MERGED -> falls through to today\'s reclaim', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) return JSON.stringify({ content: prOpenedTombstone('https://github.com/acme/w/pull/304'), sha: 'shaT' });
    if (joined.startsWith('pr view')) return 'MERGED\n';
    if (joined.includes('issue edit') || joined.includes('issue comment')) return '{}';
    throw new Error('unexpected ' + joined);
  };
  const result = claimOne({ owner: 'acme', repo: 'w', issueNumber: 272, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'claimed');
  assert.equal(result.state, 'tombstone');
  assert.ok(calls.some((c) => c.join(' ').startsWith('api --method PUT') && c.join(' ').includes('sha=shaT')), 'must reclaim via a conditional write once the linked PR is closed/merged');
});

test('claimOne: pr-opened tombstone whose gh pr view call itself fails -> fails open, reclaims', () => {
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) return JSON.stringify({ content: prOpenedTombstone('https://github.com/acme/w/pull/304'), sha: 'shaT' });
    if (joined.startsWith('pr view')) throw new Error('gh: could not resolve to a PullRequest (HTTP 404)');
    if (joined.includes('issue edit') || joined.includes('issue comment')) return '{}';
    throw new Error('unexpected ' + joined);
  };
  const result = claimOne({ owner: 'acme', repo: 'w', issueNumber: 272, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'claimed', 'a gh failure on the in-flight check must never wedge the claim path');
});

test('claimOne: merged: tombstone reason is unaffected — no gh pr view call, reclaims as before', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) {
      return JSON.stringify({ content: JSON.stringify({ released: true, runId: 'run-1', reason: 'merged: spec 12', releasedAt: new Date(T0).toISOString(), link: 'https://github.com/acme/w/commit/deadbeef' }), sha: 'shaT' });
    }
    if (joined.includes('issue edit') || joined.includes('issue comment')) return '{}';
    throw new Error('unexpected ' + joined);
  };
  const result = claimOne({ owner: 'acme', repo: 'w', issueNumber: 12, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'claimed');
  assert.ok(!calls.some((c) => c.join(' ').startsWith('pr view')), 'a non-pr-opened reason must never trigger the PR-state check');
});

test('claimOne: plain tombstone with no link at all -> reclaims exactly as before (no in-flight check applies)', () => {
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) {
      return JSON.stringify({ content: JSON.stringify({ released: true, runId: 'run-1', reason: 'pr-opened: spec 9', releasedAt: new Date(T0).toISOString() }), sha: 'shaT' });
    }
    if (joined.includes('issue edit') || joined.includes('issue comment')) return '{}';
    throw new Error('unexpected ' + joined);
  };
  const result = claimOne({ owner: 'acme', repo: 'w', issueNumber: 9, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'claimed');
});

// ---- tombstoneInFlightPr: same-repo link validation (#315 review follow-up) ----
// `link` is read straight from a claims-registry blob, writable by any
// session with registry-branch access. An unvalidated `link` could point at
// a permanently-open PR in an unrelated repo (or a malformed/non-string
// value) and wedge every future reclaim of the real issue — a stored-DoS on
// the claim path. Every invalid shape must return null WITHOUT ever calling
// `runner` (no `gh pr view`), falling through to ordinary reclaim exactly
// like a missing link.

function refusesWithoutRunnerCall(link) {
  const calls = [];
  const runner = (args) => { calls.push(args); return 'OPEN\n'; };
  const content = prOpenedTombstone(link);
  const result = tombstoneInFlightPr(content, runner, 'acme', 'w');
  assert.equal(result, null);
  assert.equal(calls.length, 0, 'an invalid link must never reach the runner (no gh pr view call)');
}

test('tombstoneInFlightPr: link pointing at a DIFFERENT repo -> null, no runner call', () => {
  refusesWithoutRunnerCall('https://github.com/other-owner/other-repo/pull/304');
});

test('tombstoneInFlightPr: malformed/non-URL link -> null, no runner call', () => {
  refusesWithoutRunnerCall('not-a-url');
});

test('tombstoneInFlightPr: non-string link (a number) -> null, no runner call', () => {
  const calls = [];
  const runner = (args) => { calls.push(args); return 'OPEN\n'; };
  const content = JSON.stringify({ released: true, runId: 'run-1', reason: 'pr-opened: spec 272', releasedAt: new Date(T0).toISOString(), link: 304 });
  const result = tombstoneInFlightPr(content, runner, 'acme', 'w');
  assert.equal(result, null);
  assert.equal(calls.length, 0, 'a non-string link must never reach the runner');
});

test('tombstoneInFlightPr: a flag-shaped link ("--repo") -> null, no runner call', () => {
  refusesWithoutRunnerCall('--repo');
});

test('tombstoneInFlightPr: same-repo, well-formed, OPEN link -> { link }, one runner call', () => {
  const calls = [];
  const runner = (args) => { calls.push(args); return 'OPEN\n'; };
  const content = prOpenedTombstone('https://github.com/acme/w/pull/304');
  const result = tombstoneInFlightPr(content, runner, 'acme', 'w');
  assert.deepEqual(result, { link: 'https://github.com/acme/w/pull/304' });
  assert.equal(calls.length, 1);
});

test('claimOne: pr-opened tombstone whose link points at a DIFFERENT repo -> reclaims (no pr view call)', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) return JSON.stringify({ content: prOpenedTombstone('https://github.com/other-owner/other-repo/pull/304'), sha: 'shaT' });
    if (joined.includes('issue edit') || joined.includes('issue comment')) return '{}';
    throw new Error('unexpected ' + joined);
  };
  const result = claimOne({ owner: 'acme', repo: 'w', issueNumber: 272, runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.equal(result.outcome, 'claimed');
  assert.ok(!calls.some((c) => c.join(' ').startsWith('pr view')), 'a wrong-repo link must never trigger the PR-state check');
});

// ---- claimGroup: in-flight is explicit, distinct from contested/errored ---

test('claimGroup: an in-flight target is reported in its own bucket, not merged into errored', () => {
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) throw new Error('must not write while the linked PR is open');
    if (joined.includes('contents/claims/issue-272.json')) return JSON.stringify({ content: prOpenedTombstone('https://github.com/acme/w/pull/304'), sha: 'shaT' });
    if (joined.startsWith('pr view')) return 'OPEN\n';
    throw new Error('unexpected ' + joined);
  };
  const result = claimGroup({ owner: 'acme', repo: 'w', issueNumbers: [272], runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner, keepGoing: false });
  assert.deepEqual(result.claimed, []);
  assert.equal(result.errored.length, 0, 'an in-flight result must not be reported as an error');
  assert.equal(result.contested.length, 0, 'an in-flight result must not be reported as contested');
  assert.equal(result.inFlight.length, 1);
  assert.equal(result.inFlight[0].issueNumber, 272);
  assert.equal(result.inFlight[0].link, 'https://github.com/acme/w/pull/304');
});

// ---- releaseOne ------------------------------------------------------------

test('releaseOne: absent -> not-owner (nothing to release)', () => {
  const runner = () => { throw http(404); };
  const result = releaseOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-1', reason: 'merged: spec 1', now: T0, runner });
  assert.equal(result.outcome, 'not-owner');
});

test('releaseOne: ownership rule — a claim held by a different runId is never released', () => {
  const holder = { runId: 'run-OTHER', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'h' };
  const calls = [];
  const runner = (args) => { calls.push(args); return JSON.stringify({ content: JSON.stringify(holder), sha: 'x' }); };
  const result = releaseOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-1', reason: 'merged: spec 1', now: T0 + 1000, runner });
  assert.equal(result.outcome, 'not-owner');
  assert.ok(!calls.some((c) => c[1] === '--method'), 'must never write when this run does not own the claim');
});

test('releaseOne: owned live claim -> released via conditional tombstone write', () => {
  const holder = { runId: 'run-1', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'h' };
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) return JSON.stringify({ content: JSON.stringify(holder), sha: 'shaY' });
    return '{}';
  };
  const result = releaseOne({ owner: 'a', repo: 'b', issueNumber: 1, runId: 'run-1', reason: 'merged: spec 1', now: T0 + 1000, runner });
  assert.equal(result.outcome, 'released');
  const writeCall = calls.find((c) => c[1] === '--method');
  assert.ok(writeCall.join(' ').includes('sha=shaY'));
});

// ---- claimGroup: all-or-abort vs keep-going --------------------------------

test('claimGroup: default (no keep-going) — one contested target releases everything already claimed', () => {
  const holder = { runId: 'run-OTHER', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'h' };
  const writes = [];
  let issue1Written = null; // stateful: the release step must read back what the claim step just wrote
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT') && joined.includes('claims/issue-1.json')) {
      writes.push(args);
      const contentB64 = args.find((a) => a.startsWith('content=')).slice('content='.length);
      issue1Written = Buffer.from(contentB64, 'base64').toString('utf8');
      return '{}';
    }
    if (joined.startsWith('api --method PUT')) { writes.push(args); return '{}'; }
    if (joined.includes('contents/claims/issue-1.json')) {
      if (issue1Written === null) throw http(404); // absent -> claimable
      return JSON.stringify({ content: issue1Written, sha: 'sha-1-written' });
    }
    if (joined.includes('contents/claims/issue-2.json')) return JSON.stringify({ content: JSON.stringify(holder), sha: 'x' }); // live -> contested
    return '{}';
  };
  const result = claimGroup({ owner: 'a', repo: 'b', issueNumbers: [1, 2], runId: 'run-2', sessionId: 's', host: 'h', now: T0 + 1000, runner, keepGoing: false });
  assert.deepEqual(result.claimed, [], 'nothing left claimed after an all-or-abort release');
  assert.equal(result.contested.length, 1);
  assert.deepEqual(result.released, [1], 'issue 1, claimed before the contest, gets released');
  // two PUT writes total: the original claim on #1, then the release tombstone on #1
  assert.equal(writes.length, 2);
});

test('claimGroup: abort-path cleanup release itself failing keeps the target in claimed, not falsely released', () => {
  const holder = { runId: 'run-OTHER', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'h' };
  let issue1Written = null;
  let putCount = 0;
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT') && joined.includes('claims/issue-1.json')) {
      putCount += 1;
      if (putCount === 1) {
        // the original claim write succeeds
        const contentB64 = args.find((a) => a.startsWith('content=')).slice('content='.length);
        issue1Written = Buffer.from(contentB64, 'base64').toString('utf8');
        return '{}';
      }
      // the cleanup release write itself fails (e.g. a transient API error)
      throw http(500, 'Internal Server Error');
    }
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/issue-1.json')) {
      if (issue1Written === null) throw http(404); // absent -> claimable
      return JSON.stringify({ content: issue1Written, sha: 'sha-1-written' });
    }
    if (joined.includes('contents/claims/issue-2.json')) return JSON.stringify({ content: JSON.stringify(holder), sha: 'x' }); // live -> contested
    return '{}';
  };
  const result = claimGroup({ owner: 'a', repo: 'b', issueNumbers: [1, 2], runId: 'run-2', sessionId: 's', host: 'h', now: T0 + 1000, runner, keepGoing: false });
  assert.deepEqual(result.claimed, [1], 'the cleanup release failed — this run still holds issue 1, must not be reported as free');
  assert.deepEqual(result.released, [], 'a failed cleanup write must never be reported as released');
});

test('claimGroup: keep-going — a contested target is skipped, the rest of the group still claims', () => {
  const holder = { runId: 'run-OTHER', sessionId: 's', claimedAt: new Date(T0).toISOString(), ttlHours: 72, host: 'h' };
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/issue-1.json')) return JSON.stringify({ content: JSON.stringify(holder), sha: 'x' });
    if (joined.includes('contents/claims/issue-2.json')) throw http(404);
    return '{}';
  };
  const result = claimGroup({ owner: 'a', repo: 'b', issueNumbers: [1, 2], runId: 'run-2', sessionId: 's', host: 'h', now: T0 + 1000, runner, keepGoing: true });
  assert.deepEqual(result.claimed, [2]);
  assert.equal(result.contested.length, 1);
  assert.equal(result.contested[0].issueNumber, 1);
  assert.deepEqual(result.released, []);
});

test('claimGroup: every target absent -> all claimed, nothing released', () => {
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) throw http(404);
    return '{}';
  };
  const result = claimGroup({ owner: 'a', repo: 'b', issueNumbers: [1, 2, 3], runId: 'run-2', sessionId: 's', host: 'h', now: T0, runner });
  assert.deepEqual(result.claimed, [1, 2, 3]);
  assert.deepEqual(result.contested, []);
  assert.deepEqual(result.released, []);
});

// ---- claims.js CLI ----------------------------------------------------------

const { run: cliRun } = require('../../../plugin/bin/claims');

function cliDeps({ runner, ghAvailable = true, remoteUrl = 'https://github.com/acme/w.git', now = T0 } = {}) {
  const out = []; const err = [];
  return { deps: { runner, ghAvailable: () => ghAvailable, remoteUrl: () => remoteUrl, hostname: () => 'test-host', sessionId: () => 'sess-1', now: () => now, stdout: (s) => out.push(s), stderr: (s) => err.push(s) }, out, err };
}

test('claims CLI: --help exits 0', () => {
  const { deps, out } = cliDeps({ runner: () => { throw new Error('must not call gh'); } });
  assert.equal(cliRun(['--help'], deps), 0);
  assert.match(out.join(''), /usage: claims\.js/);
});

test('claims CLI: unknown subcommand is a malformed invocation (exit 2)', () => {
  const { deps, err } = cliDeps({ runner: () => { throw new Error('must not call gh'); } });
  assert.equal(cliRun(['bogus', '1'], deps), 2);
  assert.match(err.join(''), /unknown subcommand/);
});

test('claims CLI: gh absent exits 2 and names the MCP fallback', () => {
  const { deps, err } = cliDeps({ runner: () => { throw new Error('must not call gh'); }, ghAvailable: false });
  assert.equal(cliRun(['claim', '1', '--run-id', 'run-1'], deps), 2);
  assert.match(err.join(''), /github-write-transport\.md/);
});

test('claims CLI: release without --reason is a malformed invocation (exit 2)', () => {
  const { deps, err } = cliDeps({ runner: () => { throw new Error('must not call gh'); } });
  assert.equal(cliRun(['release', '1', '--run-id', 'run-1'], deps), 2);
  assert.match(err.join(''), /requires --reason/);
});

test('claims CLI: claim happy path — absent issue claims cleanly, envelope printed', () => {
  const runner = (args) => {
    const joined = args.join(' ');
    if (joined.includes('git/refs/heads/claims-registry')) return '{}'; // branch already exists
    if (joined.startsWith('api --method PUT')) return '{}';
    if (joined.includes('contents/claims/')) throw http(404);
    if (joined.includes('issue edit') || joined.includes('issue comment')) return '{}';
    throw new Error('unexpected ' + joined);
  };
  const { deps, out } = cliDeps({ runner });
  const code = cliRun(['claim', '1,2', '--run-id', 'run-9'], deps);
  assert.equal(code, 0);
  const env = JSON.parse(out.join(''));
  assert.deepEqual(env.claimed, [1, 2]);
});

test('claims CLI: claim branch-bootstrap failure exits 1', () => {
  const runner = () => { throw http(500, 'boom'); };
  const { deps, err } = cliDeps({ runner });
  const code = cliRun(['claim', '1', '--run-id', 'run-9'], deps);
  assert.equal(code, 1);
  assert.match(err.join(''), /could not bootstrap/);
});

test('claims CLI: malformed issue list (non-positive-integer) is exit 2', () => {
  const { deps, err } = cliDeps({ runner: () => { throw new Error('must not call gh'); } });
  assert.equal(cliRun(['claim', '0,2', '--run-id', 'run-9'], deps), 2);
  assert.match(err.join(''), /positive integer/);
});
