'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listClaimNames, readClaimBlob, writeClaimBlob, defaultGhApi, classifyGhApiError,
} = require('../../../bin/lib/issues/claim-store');

// Fake ghApi functions mirror release-merged.js's own ghApi shape: a
// non-throwing function returning {stdout, failure, status} — never the
// real `gh`. Branch on the args shape (per the gh-api-module-pattern
// skill); throw on anything unhandled so a wrong endpoint fails loudly.
const isRead = (args, path) => args[0] === `repos/acme/w/contents/${path}?ref=claims-registry`;
const isWrite = (args, path) => args[0] === '--method' && args[1] === 'PUT' && args[2] === `repos/acme/w/contents/${path}`;

function fieldOf(args, name) {
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '-f' && String(args[k + 1]).startsWith(`${name}=`)) return args[k + 1].slice(name.length + 1);
  }
  return undefined;
}

test('readClaimBlob: status 404 -> absent:true, failure:null, never treated as a failure', () => {
  const ghApi = (args) => {
    if (isRead(args, 'claims/issue-42.json')) return { stdout: null, failure: null, status: 404 };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = readClaimBlob(ghApi, 'acme/w', 42);
  assert.deepEqual(r, { content: null, sha: null, failure: null, absent: true });
});

test('readClaimBlob: live blob -> content and sha parsed from the -q output', () => {
  const ghApi = (args) => {
    if (isRead(args, 'claims/issue-42.json')) {
      assert.match(args.join(' '), /-q \{content: \(\.content \| @base64d\), sha: \.sha\}/);
      return { stdout: JSON.stringify({ content: '{"runId":"r1"}', sha: 'abc123' }), failure: null, status: null };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = readClaimBlob(ghApi, 'acme/w', 42);
  assert.deepEqual(r, { content: '{"runId":"r1"}', sha: 'abc123', failure: null, absent: false });
});

test('readClaimBlob: network failure propagates, absent stays false', () => {
  const ghApi = (args) => {
    if (isRead(args, 'claims/issue-42.json')) return { stdout: null, failure: 'network-failure', status: null };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = readClaimBlob(ghApi, 'acme/w', 42);
  assert.deepEqual(r, { content: null, sha: null, failure: 'network-failure', absent: false });
});

test('readClaimBlob: gh-absent propagates, absent stays false (never confused with a 404)', () => {
  const ghApi = (args) => {
    if (isRead(args, 'claims/issue-42.json')) return { stdout: null, failure: 'gh-absent', status: null };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = readClaimBlob(ghApi, 'acme/w', 42);
  assert.deepEqual(r, { content: null, sha: null, failure: 'gh-absent', absent: false });
});

test('writeClaimBlob: create-only omits sha from argv', () => {
  const calls = [];
  const ghApi = (args) => {
    calls.push(args);
    if (isWrite(args, 'claims/issue-7.json')) return { stdout: '{}', failure: null, status: null };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = writeClaimBlob(ghApi, 'acme/w', 7, { content: '{"a":1}', message: 'Claim issue-7.json' });
  assert.equal(r.ok, true);
  assert.equal(r.failure, null);
  assert.equal(calls.length, 1);
  assert.equal(fieldOf(calls[0], 'sha'), undefined, 'create-only write must never send a sha field');
  assert.equal(fieldOf(calls[0], 'branch'), 'claims-registry');
  assert.equal(fieldOf(calls[0], 'content'), Buffer.from('{"a":1}', 'utf8').toString('base64'));
});

test('writeClaimBlob: sha present -> conditional write sends it in argv', () => {
  const calls = [];
  const ghApi = (args) => {
    calls.push(args);
    if (isWrite(args, 'claims/issue-7.json')) return { stdout: '{}', failure: null, status: null };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = writeClaimBlob(ghApi, 'acme/w', 7, { content: '{"a":1}', sha: 'deadbeef', message: 'Release issue-7.json' });
  assert.equal(r.ok, true);
  assert.equal(fieldOf(calls[0], 'sha'), 'deadbeef');
});

test('writeClaimBlob: failure propagates, ok:false', () => {
  const ghApi = (args) => {
    if (isWrite(args, 'claims/issue-7.json')) return { stdout: null, failure: 'network-failure', status: null };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = writeClaimBlob(ghApi, 'acme/w', 7, { content: '{}', message: 'x' });
  assert.deepEqual(r, { ok: false, failure: 'network-failure' });
});

test('listClaimNames: happy path extracts names from the {name,sha} entries listClaimEntries returns', () => {
  const ghApi = (args) => {
    assert.equal(args[0], 'repos/acme/w/contents/claims?ref=claims-registry');
    assert.deepEqual(args.slice(1), ['-q', '[.[] | {name, sha}]']);
    return { stdout: JSON.stringify([{ name: 'issue-1.json', sha: 'sha1' }, { name: 'issue-2.json', sha: 'sha2' }]), failure: null, status: null };
  };
  const r = listClaimNames(ghApi, 'acme/w');
  assert.deepEqual(r, { names: ['issue-1.json', 'issue-2.json'], failure: null });
});

test('listClaimNames: failure -> empty names, failure propagated', () => {
  const ghApi = () => ({ stdout: null, failure: 'gh-absent', status: null });
  const r = listClaimNames(ghApi, 'acme/w');
  assert.deepEqual(r, { names: [], failure: 'gh-absent' });
});

test('defaultGhApi is exported (existence only — no real gh call)', () => {
  assert.equal(typeof defaultGhApi, 'function');
});

// classifyGhApiError is the pure text-matching classifier defaultGhApi's own
// catch block delegates to — tested directly against synthetic error shapes
// so the regexes are pinned without touching the real `gh` binary.

test('classifyGhApiError: ENOENT -> gh-absent', () => {
  const e = { code: 'ENOENT', message: 'spawn gh ENOENT' };
  assert.deepEqual(classifyGhApiError(e), { failure: 'gh-absent', status: null });
});

test('classifyGhApiError: "HTTP 404" / "Not Found" text -> status 404, failure null', () => {
  assert.deepEqual(classifyGhApiError(new Error('gh: Not Found (HTTP 404)')), { failure: null, status: 404 });
});

test('classifyGhApiError: "HTTP 422" status text -> write-conflict, status 422, failure null', () => {
  const e = { message: '', stderr: 'gh: HTTP 422: Unprocessable Entity (...)', stdout: '' };
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 422 });
});

test('classifyGhApiError: "Unprocessable" reason phrase alone -> status 422', () => {
  const e = { message: '', stderr: 'Unprocessable Entity', stdout: '' };
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 422 });
});

test('classifyGhApiError: live-confirmed "Validation failed" body wording -> status 422', () => {
  // Live-confirmed wording (gh-api-module-pattern skill) for a lost
  // create-only race: GitHub answers "Validation failed: Target issue has
  // already been taken" — accepted even without the literal "HTTP 422" or
  // "Unprocessable" substrings present.
  const e = new Error('gh: Validation failed: Target issue has already been taken (HTTP 422)');
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 422 });
});

test('classifyGhApiError: 404 text wins over a coincidental 422 mention', () => {
  const e = new Error('gh: Not Found (HTTP 404) — see HTTP 422 docs');
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 404 });
});

// A 409 is the Contents API's rejection for a conditional-write sha
// mismatch — someone else's write landed between this read and this write.
// Same write-conflict classification as a 422 (see the 422 block above):
// live-confirmed wording varies ("HTTP 409", the "Conflict" reason phrase,
// or the body's "...does not match..." text), so all three are accepted
// case-insensitively, symmetric with the 422 regex's three-way accept.
test('classifyGhApiError: "HTTP 409" status text -> write-conflict, status 409, failure null', () => {
  const e = { message: '', stderr: 'gh: HTTP 409: Conflict (...)', stdout: '' };
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 409 });
});

test('classifyGhApiError: "Conflict" reason phrase alone -> status 409', () => {
  const e = { message: '', stderr: 'Conflict', stdout: '' };
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 409 });
});

test('classifyGhApiError: sha-mismatch body wording ("does not match") -> status 409', () => {
  const e = new Error('gh: sha does not match (HTTP 409)');
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 409 });
});

test('classifyGhApiError: 404 text wins over a coincidental 409 mention', () => {
  const e = new Error('gh: Not Found (HTTP 404) — see HTTP 409 docs');
  assert.deepEqual(classifyGhApiError(e), { failure: null, status: 404 });
});

test('classifyGhApiError: generic error text -> network-failure, status null', () => {
  assert.deepEqual(classifyGhApiError(new Error('connection reset by peer')), { failure: 'network-failure', status: null });
});

test('writeClaimBlob: write-conflict (status 422) -> ok:false, conflict:true, failure:null (lost race, not a transient failure)', () => {
  const ghApi = (args) => {
    if (isWrite(args, 'claims/issue-7.json')) return { stdout: null, failure: null, status: 422 };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = writeClaimBlob(ghApi, 'acme/w', 7, { content: '{}', sha: 'deadbeef', message: 'x' });
  assert.deepEqual(r, { ok: false, conflict: true, failure: null });
});

test('writeClaimBlob: write-conflict (status 409, sha-mismatch) -> ok:false, conflict:true, failure:null — same signal as a 422 (#723)', () => {
  const ghApi = (args) => {
    if (isWrite(args, 'claims/issue-7.json')) return { stdout: null, failure: null, status: 409 };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = writeClaimBlob(ghApi, 'acme/w', 7, { content: '{}', sha: 'deadbeef', message: 'x' });
  assert.deepEqual(r, { ok: false, conflict: true, failure: null });
});

test('writeClaimBlob: a ghApi that never sets status (release-merged.js\'s own) is unaffected by the 422 branch', () => {
  // Mirrors release-merged.js's own local ghApi, which never sets `status`
  // at all — proves the new `r.status === 422` branch can never fire for
  // that consumer, so its `ok` computation (and release-race logging) stays
  // exactly as it was before this change.
  const ghApi = (args) => {
    if (isWrite(args, 'claims/issue-7.json')) return { stdout: null, failure: 'network-failure' }; // no `status` key
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = writeClaimBlob(ghApi, 'acme/w', 7, { content: '{}', message: 'x' });
  assert.deepEqual(r, { ok: false, failure: 'network-failure' });
});

test('listClaimEntries: returns name + sha per entry from the same single Contents-API call listClaimNames already made', () => {
  const { listClaimEntries } = require('../../../bin/lib/issues/claim-store');
  let seenArgs = null;
  const ghApi = (args) => {
    seenArgs = args;
    return { stdout: JSON.stringify([{ name: 'issue-7.json', sha: 'sha7' }, { name: 'issue-9.json', sha: 'sha9' }]), failure: null, status: null };
  };
  const r = listClaimEntries(ghApi, 'acme/w');
  assert.deepEqual(r, { entries: [{ name: 'issue-7.json', sha: 'sha7' }, { name: 'issue-9.json', sha: 'sha9' }], failure: null });
  assert.match(seenArgs[0], /repos\/acme\/w\/contents\/claims\?ref=/);
  assert.match(seenArgs.join(' '), /-q .*name.*sha/);
});

test('listClaimNames: still works, now a thin wrapper over listClaimEntries', () => {
  const { listClaimNames } = require('../../../bin/lib/issues/claim-store');
  const ghApi = () => ({ stdout: JSON.stringify([{ name: 'issue-7.json', sha: 'sha7' }]), failure: null, status: null });
  assert.deepEqual(listClaimNames(ghApi, 'acme/w'), { names: ['issue-7.json'], failure: null });
});
