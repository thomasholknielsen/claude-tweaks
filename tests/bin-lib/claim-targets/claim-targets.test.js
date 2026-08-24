// tests/bin-lib/claim-targets/claim-targets.test.js
// Fake ghApi (claim-store contract: never throws, returns {stdout,failure,status})
// and fake gh (generic-runner contract: throws on failure, returns stdout) per
// the gh-api-module-pattern skill — never real `gh`. Record calls inside the
// fakes, assert after `run()` returns.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  run, BOT_IN_PROGRESS, ABORT_REASON,
} = require('../../../plugin/bin/lib/claim-targets/claim-targets');

const REPO = 'acme/w';
const NOW = Date.parse('2026-08-17T00:00:00.000Z');

function readPath(issue) {
  return `repos/${REPO}/contents/claims/issue-${issue}.json?ref=claims-registry`;
}
function isRead(args, issue) {
  return args[0] === readPath(issue);
}
function isWrite(args, issue) {
  return args[0] === '--method' && args[1] === 'PUT' && args[2] === `repos/${REPO}/contents/claims/issue-${issue}.json`;
}
function fieldOf(args, name) {
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '-f' && String(args[k + 1]).startsWith(`${name}=`)) return args[k + 1].slice(name.length + 1);
  }
  return undefined;
}

function readOk(content, sha) {
  return { stdout: JSON.stringify({ content, sha }), failure: null, status: null };
}
const readAbsent = { stdout: null, failure: null, status: 404 };
const readFail = (failure) => ({ stdout: null, failure, status: null });
const writeOk = { stdout: '{}', failure: null, status: null };
const writeFail = (failure) => ({ stdout: null, failure, status: null });

function liveMarker(runId, claimedAtIso = new Date(NOW).toISOString(), ttlHours = 72) {
  return JSON.stringify({
    runId, sessionId: 's', claimedAt: claimedAtIso, ttlHours, host: 'h',
  });
}
function tombstoneMarker(runId) {
  return JSON.stringify({
    released: true, runId, reason: 'x', releasedAt: new Date(NOW).toISOString(),
  });
}
// #315 — a `pr-opened:` tombstone carries a `link` to the PR that build
// produced; `run()` must consult it (via `tombstoneInFlightPr`, now
// exported from claim-store.js — moved there from claim-engine.js, retired
// #787) before treating this like any other reclaimable tombstone.
function prOpenedTombstoneMarker(runId, link) {
  return JSON.stringify({
    released: true, runId, reason: 'pr-opened: spec 272', releasedAt: new Date(NOW).toISOString(), link,
  });
}

// reads/writes: { [issue]: [response, response, ...] } — consumed in call
// order, last entry repeats once exhausted. Throws on any unhandled argv
// shape so a wrong endpoint fails loudly rather than silently.
function makeGhApi({ reads = {}, writes = {} } = {}) {
  const calls = [];
  const readIdx = {};
  const writeIdx = {};
  function ghApi(args) {
    calls.push(args);
    for (const issue of Object.keys(reads)) {
      if (isRead(args, issue)) {
        const q = reads[issue];
        const i = readIdx[issue] || 0;
        readIdx[issue] = i + 1;
        return q[Math.min(i, q.length - 1)];
      }
    }
    for (const issue of Object.keys(writes)) {
      if (isWrite(args, issue)) {
        const q = writes[issue];
        const i = writeIdx[issue] || 0;
        writeIdx[issue] = i + 1;
        return q[Math.min(i, q.length - 1)];
      }
    }
    throw new Error(`unexpected ghApi ${args.join(' ')}`);
  }
  return { ghApi, calls };
}

// gh: throwing-style generic runner. `fail` names which call classes throw.
function makeGh({
  repoSlug = REPO, labelExists = false, fail = {}, prState = null,
} = {}) {
  const calls = [];
  function gh(args) {
    calls.push(args);
    if (args[0] === 'repo' && args[1] === 'view') {
      if (fail.repoView) throw new Error('repo view failed');
      return `${repoSlug}\n`;
    }
    if (args[0] === 'label' && args[1] === 'list') return labelExists ? `${BOT_IN_PROGRESS}\n` : '';
    if (args[0] === 'label' && args[1] === 'create') return '';
    if (args[0] === 'issue' && args[1] === 'edit' && args.includes('--add-label')) {
      if (fail.labelAdd) throw new Error('label add failed');
      return '';
    }
    if (args[0] === 'issue' && args[1] === 'edit' && args.includes('--remove-label')) return '';
    if (args[0] === 'issue' && args[1] === 'comment') {
      if (fail.comment) throw new Error('comment failed');
      return '';
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      if (fail.prView) throw new Error('pr view failed');
      return `${prState}\n`;
    }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  }
  return { gh, calls };
}

function makeStdio() {
  const out = []; const err = [];
  return { stdout: (s) => out.push(s), stderr: (s) => err.push(s), out, err };
}

function baseDeps({ ghApi, gh, hostname = 'host1', sessionId = 'sess1' }) {
  const io = makeStdio();
  return {
    deps: {
      ghApi, gh, now: () => NOW, stdout: io.stdout, stderr: io.stderr, hostname, sessionId,
    },
    io,
  };
}

// (a) two absent targets -> both claimed, create-only PUTs (no sha), label+comment calls made
test('(a) two absent targets: both claimed, create-only writes, label + comment made, exit 0', () => {
  const { ghApi, calls: apiCalls } = makeGhApi({
    reads: { 720: [readAbsent], 721: [readAbsent] },
    writes: { 720: [writeOk], 721: [writeOk] },
  });
  const { gh, calls: ghCalls } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body, {
    claimed: [720, 721], alreadyOwned: [], skipped: [], labelFailures: [],
  });
  const w720 = apiCalls.find((a) => isWrite(a, '720'));
  const w721 = apiCalls.find((a) => isWrite(a, '721'));
  assert.equal(fieldOf(w720, 'sha'), undefined, 'create-only write must omit sha');
  assert.equal(fieldOf(w721, 'sha'), undefined, 'create-only write must omit sha');
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '720' && a.includes('--add-label')));
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '721' && a.includes('--add-label')));
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'comment' && a[2] === '720'));
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'comment' && a[2] === '721'));
  assert.ok(ghCalls.some((a) => a[0] === 'label' && a[1] === 'create'), 'label did not exist -> bootstrap create call made');
});

// (b) tombstone target -> conditional PUT with sha
test('(b) tombstone target: conditional write carries the blob sha', () => {
  const { ghApi, calls } = makeGhApi({
    reads: { 722: [readOk(tombstoneMarker('otherRun'), 'sha722')] },
    writes: { 722: [writeOk] },
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '722'], deps);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(io.out[0]).claimed, [722]);
  const w = calls.find((a) => isWrite(a, '722'));
  assert.equal(fieldOf(w, 'sha'), 'sha722');
});

// ---- #315: pr-opened tombstone in-flight check -----------------------------
// A `pr-opened:` tombstone whose linked PR is still OPEN means a build for
// this issue already completed and is awaiting merge — `run()` must not
// reclaim/re-write over it. Uses claim-store.js's `tombstoneInFlightPr`
// (moved there from claim-engine.js's `claimOne`, retired #787) — this
// loop has its own inline classify-then-write sequence.

test('(k) pr-opened tombstone, linked PR OPEN, default mode: no reclaim write, exit 3, inFlight envelope', () => {
  const { ghApi, calls } = makeGhApi({
    reads: { 760: [readOk(prOpenedTombstoneMarker('otherRun', 'https://github.com/acme/w/pull/304'), 'sha760')] },
    writes: {},
  });
  const { gh, calls: ghCalls } = makeGh({ prState: 'OPEN' });
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '760'], deps);

  assert.equal(code, 3);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.inFlight, [{ issue: 760, link: 'https://github.com/acme/w/pull/304' }]);
  assert.deepEqual(body.released, []);
  assert.ok(!calls.some((a) => isWrite(a, '760')), 'must not write a fresh claim while the linked PR is open');
  assert.ok(ghCalls.some((a) => a[0] === 'pr' && a[1] === 'view' && a[2] === 'https://github.com/acme/w/pull/304'));
});

test('(k2) pr-opened tombstone, linked PR OPEN, --keep-going: skipped with in-flight reason, no write, exit 0', () => {
  const { ghApi, calls } = makeGhApi({
    reads: { 761: [readOk(prOpenedTombstoneMarker('otherRun', 'https://github.com/acme/w/pull/305'), 'sha761')] },
    writes: {},
  });
  const { gh } = makeGh({ prState: 'OPEN' });
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '761', '--keep-going'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.claimed, []);
  assert.equal(body.skipped.length, 1);
  assert.deepEqual(body.skipped[0], { issue: 761, reason: 'in-flight', link: 'https://github.com/acme/w/pull/305' });
  assert.ok(!calls.some((a) => isWrite(a, '761')), 'must not write a fresh claim while the linked PR is open');
});

test('(k3) pr-opened tombstone, linked PR CLOSED/MERGED: falls through to normal reclaim, exit 0', () => {
  const { ghApi, calls } = makeGhApi({
    reads: { 762: [readOk(prOpenedTombstoneMarker('otherRun', 'https://github.com/acme/w/pull/306'), 'sha762')] },
    writes: { 762: [writeOk] },
  });
  const { gh } = makeGh({ prState: 'MERGED' });
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '762'], deps);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(io.out[0]).claimed, [762]);
  const w = calls.find((a) => isWrite(a, '762'));
  assert.equal(fieldOf(w, 'sha'), 'sha762', 'closed/merged PR must fall through to the ordinary conditional reclaim write');
});

test('(k4) pr-opened tombstone whose gh pr view call itself fails: fails open, reclaims as before', () => {
  const { ghApi } = makeGhApi({
    reads: { 763: [readOk(prOpenedTombstoneMarker('otherRun', 'https://github.com/acme/w/pull/307'), 'sha763')] },
    writes: { 763: [writeOk] },
  });
  const { gh } = makeGh({ fail: { prView: true } });
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '763'], deps);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(io.out[0]).claimed, [763], 'a gh failure on the in-flight check must never wedge the claim path');
});

test('(k5) pr-opened tombstone whose link points at a DIFFERENT repo: falls through to normal reclaim, exit 0', () => {
  const { ghApi, calls } = makeGhApi({
    reads: { 764: [readOk(prOpenedTombstoneMarker('otherRun', 'https://github.com/other-owner/other-repo/pull/308'), 'sha764')] },
    writes: { 764: [writeOk] },
  });
  const { gh, calls: ghCalls } = makeGh({ prState: 'OPEN' });
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '764'], deps);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(io.out[0]).claimed, [764]);
  const w = calls.find((a) => isWrite(a, '764'));
  assert.equal(fieldOf(w, 'sha'), 'sha764', 'a wrong-repo link must fall through to the ordinary conditional reclaim write');
  assert.ok(!ghCalls.some((a) => a[0] === 'pr' && a[1] === 'view'), 'a wrong-repo link must never trigger the PR-state check');
});

// (c) stale target -> conditional PUT (re-claim)
test('(c) stale target: conditional write re-claims with the blob sha', () => {
  const staleClaimedAt = new Date(NOW - 100 * 3600 * 1000).toISOString(); // 100h ago, ttl 72h
  const { ghApi, calls } = makeGhApi({
    reads: { 723: [readOk(liveMarker('otherRun', staleClaimedAt), 'sha723')] },
    writes: { 723: [writeOk] },
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '723'], deps);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(io.out[0]).claimed, [723]);
  const w = calls.find((a) => isWrite(a, '723'));
  assert.equal(fieldOf(w, 'sha'), 'sha723');
});

// (d) second target live -> first released (tombstone PUT, abort reason), exit 3, holder on stdout
test('(d) second target live: first target released with the abort reason, exit 3, holder JSON', () => {
  const { ghApi, calls } = makeGhApi({
    reads: {
      720: [readAbsent, readOk('irrelevant', 'sha720-release')], // 2nd = release's fresh read
      721: [readOk(liveMarker('otherRun'), 'sha721')],
    },
    writes: {
      720: [writeOk, writeOk], // 1st = claim, 2nd = abort-release tombstone
    },
  });
  const { gh, calls: ghCalls } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721'], deps);

  assert.equal(code, 3);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.released, [720]);
  assert.equal(body.contested.length, 1);
  assert.equal(body.contested[0].issue, 721);
  assert.equal(body.contested[0].holder.runId, 'otherRun');
  const releaseWrite = calls.filter((a) => isWrite(a, '720'))[1];
  assert.equal(fieldOf(releaseWrite, 'sha'), 'sha720-release');
  assert.match(fieldOf(releaseWrite, 'message'), new RegExp(ABORT_REASON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '720' && a.includes('--remove-label')));
});

// (e) same with --keep-going -> no release, contested recorded, exit 0
test('(e) --keep-going: contest recorded in skipped, no release, exit 0', () => {
  const { ghApi, calls } = makeGhApi({
    reads: {
      720: [readAbsent],
      721: [readOk(liveMarker('otherRun'), 'sha721')],
    },
    writes: { 720: [writeOk] },
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721', '--keep-going'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.claimed, [720]);
  assert.equal(body.skipped.length, 1);
  assert.equal(body.skipped[0].issue, 721);
  assert.equal(body.skipped[0].reason, 'contested');
  // Only one read of 720 (the claim) — no release fresh-read.
  assert.equal(calls.filter((a) => isRead(a, '720')).length, 1);
});

// (f) transient ghApi failure on second read -> first released, exit 4, error named (not holder)
test('(f) transient read failure: first released, exit 4, error named', () => {
  const { ghApi, calls } = makeGhApi({
    reads: {
      720: [readAbsent, readOk('irrelevant', 'sha720-release')],
      721: [readFail('network-failure')],
    },
    writes: { 720: [writeOk, writeOk] },
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721'], deps);

  assert.equal(code, 4);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.released, [720]);
  assert.deepEqual(body.transient, [{ issue: 721, error: 'network-failure' }]);
  assert.equal(body.transient[0].holder, undefined);
});

// (g) self-owned (blob runId == --run-id) -> skipped as already-owned, no write
test('(g) self-owned target: already-owned, no write attempted', () => {
  const { ghApi, calls } = makeGhApi({
    reads: { 730: [readOk(liveMarker('r1'), 'sha730')] },
    writes: {},
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '730'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.claimed, []);
  assert.deepEqual(body.alreadyOwned, [730]);
  assert.ok(!calls.some((a) => isWrite(a, '730')), 'self-owned target must never be re-claimed');
});

// (g2) self-owned, STALE (blob runId == --run-id, but past TTL) -> still
// already-owned, not reclaimed — the self-owned guard covers `live` OR
// `stale` (see run()'s combined `classified.state === 'live' ||
// classified.state === 'stale'` check), but only the `live` case had a test.
test('(g2) self-owned target, stale (past TTL): already-owned, no write attempted', () => {
  const staleClaimedAt = new Date(NOW - 100 * 3600 * 1000).toISOString(); // 100h ago, ttl 72h
  const { ghApi, calls } = makeGhApi({
    reads: { 731: [readOk(liveMarker('r1', staleClaimedAt), 'sha731')] },
    writes: {},
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '731'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.claimed, []);
  assert.deepEqual(body.alreadyOwned, [731]);
  assert.ok(!calls.some((a) => isWrite(a, '731')), 'self-owned stale target must never be re-claimed');
});

// (h) unreadable blob -> contested (fail-closed)
test('(h) unreadable blob: fails closed to contested, exit 3', () => {
  const { ghApi } = makeGhApi({
    reads: { 740: [readOk('not-valid-json{{{', 'sha740')] },
    writes: {},
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '740'], deps);

  assert.equal(code, 3);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.contested, [{ issue: 740, holder: null }]);
  assert.deepEqual(body.released, []);
});

// (i) malformed invocation -> exit 2, gh/ghApi never called
test('(i) malformed: missing --targets -> exit 2, no gh call', () => {
  const gh = () => { throw new Error('must not be called'); };
  const ghApi = () => { throw new Error('must not be called'); };
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1'], deps);

  assert.equal(code, 2);
  assert.equal(io.out.length, 0);
});

test('(i) malformed: --targets 0,abc -> exit 2, no gh call', () => {
  const gh = () => { throw new Error('must not be called'); };
  const ghApi = () => { throw new Error('must not be called'); };
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '0,abc'], deps);

  assert.equal(code, 2);
  assert.equal(io.out.length, 0);
});

// (j) label add failure -> claim still stands, recorded in labelFailures, exit 0
test('(j) label add failure: claim stands, recorded in labelFailures, exit 0', () => {
  const { ghApi } = makeGhApi({
    reads: { 750: [readAbsent] },
    writes: { 750: [writeOk] },
  });
  const { gh, calls: ghCalls } = makeGh({ fail: { labelAdd: true } });
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '750'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.claimed, [750]);
  assert.equal(body.labelFailures.length, 1);
  assert.equal(body.labelFailures[0].issue, 750);
  assert.match(body.labelFailures[0].error, /label add failed/);
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'comment' && a[2] === '750'), 'comment still attempted after label failure');
});

// Write-time rejection (lost race) vs write-time transient failure — the
// coordinator's ruling: a genuine write-conflict (claim-store.js's
// `writeClaimBlob` now reports `{ok:false, conflict:true, failure:null}`
// for a 422) is CONTESTED (exit 3), with a best-effort re-read to name the
// winner; a real transient ghApi failure during the write stays TRANSIENT
// (exit 4), same as a transient read failure.

test('write conflict (lost race): contested exit 3, all-or-abort release, holder from a best-effort re-read', () => {
  const { ghApi, calls } = makeGhApi({
    reads: {
      720: [readAbsent, readOk('irrelevant', 'sha720-release')], // 2nd = abort-release fresh read
      721: [readAbsent, readOk(liveMarker('winnerRun'), 'sha721-after')], // 2nd = holder re-read after the lost race
    },
    writes: {
      720: [writeOk, writeOk],
      721: [{
        stdout: null, failure: null, status: 422,
      }],
    },
  });
  const { gh, calls: ghCalls } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721'], deps);

  assert.equal(code, 3);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.released, [720]);
  assert.equal(body.contested.length, 1);
  assert.equal(body.contested[0].issue, 721);
  assert.equal(body.contested[0].holder.runId, 'winnerRun');
  assert.equal(calls.filter((a) => isRead(a, '721')).length, 2, 'expected the initial read plus one best-effort holder re-read');
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '720' && a.includes('--remove-label')));
});

test('write conflict (409 sha-mismatch on the conditional write): contested exit 3, same handling as a 422 lost race (#723)', () => {
  const { ghApi, calls } = makeGhApi({
    reads: {
      720: [readAbsent, readOk('irrelevant', 'sha720-release')], // 2nd = abort-release fresh read
      721: [readOk(liveMarker('otherRun', new Date(NOW - 100 * 3600 * 1000).toISOString()), 'sha721'), // stale -> reclaim attempt
        readOk(liveMarker('winnerRun'), 'sha721-after')], // holder re-read after the lost race
    },
    writes: {
      720: [writeOk, writeOk],
      721: [{
        stdout: null, failure: null, status: 409,
      }],
    },
  });
  const { gh, calls: ghCalls } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721'], deps);

  assert.equal(code, 3);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.released, [720]);
  assert.equal(body.contested.length, 1);
  assert.equal(body.contested[0].issue, 721);
  assert.equal(body.contested[0].holder.runId, 'winnerRun');
  assert.equal(calls.filter((a) => isRead(a, '721')).length, 2, 'expected the initial read plus one best-effort holder re-read');
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '720' && a.includes('--remove-label')));
});

test('write conflict under --keep-going: recorded in skipped with holder, no release, exit 0', () => {
  const { ghApi } = makeGhApi({
    reads: {
      720: [readAbsent],
      721: [readAbsent, readOk(liveMarker('winnerRun'), 'sha721-after')],
    },
    writes: {
      720: [writeOk],
      721: [{ stdout: null, failure: null, status: 422 }],
    },
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721', '--keep-going'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.claimed, [720]);
  assert.equal(body.skipped.length, 1);
  assert.equal(body.skipped[0].issue, 721);
  assert.equal(body.skipped[0].reason, 'contested');
  assert.equal(body.skipped[0].holder.runId, 'winnerRun');
});

test('write network failure: transient exit 4, no holder (distinct from a write-conflict)', () => {
  const { ghApi } = makeGhApi({
    reads: { 730: [readAbsent] },
    writes: { 730: [{ stdout: null, failure: 'network-failure', status: null }] },
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '730'], deps);

  assert.equal(code, 4);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.transient, [{ issue: 730, error: 'network-failure' }]);
  assert.equal(body.transient[0].holder, undefined);
  assert.deepEqual(body.released, []);
});

// abort-release write failure: a target the release step can't safely tombstone
// must be named in releaseFailed (not silently dropped from the envelope), and
// the exit code stays the classification's own (3 here) — not a second abort.
test('abort-release write failure: target lands in releaseFailed, not released, exit code unchanged (#723)', () => {
  const { ghApi, calls } = makeGhApi({
    reads: {
      720: [readAbsent, readOk('irrelevant', 'sha720-release')], // 2nd = release's fresh read
      721: [readOk(liveMarker('otherRun'), 'sha721')],
    },
    writes: {
      720: [writeOk, writeFail('network-failure')], // 1st = claim, 2nd = abort-release tombstone fails
    },
  });
  const { gh, calls: ghCalls } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720,721'], deps);

  assert.equal(code, 3);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.released, []);
  assert.deepEqual(body.releaseFailed, [{ issue: 720, error: 'network-failure' }]);
  assert.equal(body.contested.length, 1);
  assert.equal(body.contested[0].issue, 721);
  const releaseWrite = calls.filter((a) => isWrite(a, '720'))[1];
  assert.match(fieldOf(releaseWrite, 'message'), new RegExp(ABORT_REASON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // best-effort label removal is still attempted even though the release write failed
  assert.ok(ghCalls.some((a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '720' && a.includes('--remove-label')));
});

test('--help short-circuits before any gh call, exit 0', () => {
  const gh = () => { throw new Error('must not be called'); };
  const ghApi = () => { throw new Error('must not be called'); };
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--help'], deps);

  assert.equal(code, 0);
  assert.ok(io.out[0].includes('usage:'));
});
