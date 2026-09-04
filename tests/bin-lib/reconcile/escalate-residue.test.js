'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { escalateResidue, residueFingerprint, residueBody } = require('../../../plugin/bin/lib/reconcile/escalate-residue');

test('residueFingerprint: stable for the same (reason, path), distinct across either', () => {
  const a = residueFingerprint('move-failed', '/x/run-1');
  const b = residueFingerprint('move-failed', '/x/run-1');
  const c = residueFingerprint('move-failed', '/x/run-2');
  const d = residueFingerprint('removal-failed', '/x/run-1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});

test('residueBody: embeds the path, reason, and the fingerprint marker', () => {
  const { body, marker } = residueBody({ reason: 'move-failed', targetPath: '/x/run-1', count: 3, firstFailedAt: null, lastError: 'ENOENT' });
  assert.match(body, /move-failed/);
  assert.match(body, /\/x\/run-1/);
  assert.match(body, /ENOENT/);
  assert.ok(body.includes(marker));
});

test('escalateResidue: no prior issue -> files one via the injected runner, returns its number', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args[0] === 'issue' && args[1] === 'list') return '[]';
    if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/o/r/issues/99\n';
    throw new Error('unexpected call: ' + args.join(' '));
  };
  const result = escalateResidue({ repo: 'o/r', reason: 'move-failed', targetPath: '/x/run-1', count: 3, runner });
  assert.deepEqual(result, { status: 'filed', number: 99 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'issue');
  assert.equal(calls[0][1], 'list');
  assert.equal(calls[1][1], 'create');
});

test('escalateResidue: a prior matching issue already exists -> dedup-hit, never files a second one', () => {
  const calls = [];
  const marker = `<!-- fingerprint: ${residueFingerprint('move-failed', '/x/run-1')} -->`;
  const runner = (args) => {
    calls.push(args);
    return JSON.stringify([{ number: 42, title: 'reconcile: move-failed stuck on /x/run-1', body: `body\n${marker}`, createdAt: '2024-01-01T00:00:00Z' }]);
  };
  const result = escalateResidue({ repo: 'o/r', reason: 'move-failed', targetPath: '/x/run-1', count: 3, runner });
  assert.deepEqual(result, { status: 'dedup-hit', number: 42 });
  assert.equal(calls.length, 1, 'must never call issue create after a dedup hit');
});

test('escalateResidue: runner throws (gh absent / network) -> escalation-failed, never throws itself', () => {
  const runner = () => { throw new Error('gh: command not found'); };
  const result = escalateResidue({ repo: 'o/r', reason: 'move-failed', targetPath: '/x/run-1', count: 3, runner });
  assert.equal(result.status, 'escalation-failed');
  assert.match(result.reason, /gh: command not found/);
});

test('escalateResidue: no repo slug -> escalation-failed without calling the runner', () => {
  let called = false;
  const runner = () => { called = true; return '[]'; };
  const result = escalateResidue({ repo: null, reason: 'move-failed', targetPath: '/x/run-1', count: 3, runner });
  assert.equal(result.status, 'escalation-failed');
  assert.equal(called, false);
});
