'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listClaimNames, readClaimBlob, writeClaimBlob, defaultGhApi,
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

test('listClaimNames: happy path parses newline-separated names, trims/filters blanks', () => {
  const ghApi = (args) => {
    assert.equal(args[0], 'repos/acme/w/contents/claims?ref=claims-registry');
    assert.deepEqual(args.slice(1), ['-q', '.[].name']);
    return { stdout: 'issue-1.json\nissue-2.json\n\n', failure: null, status: null };
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
