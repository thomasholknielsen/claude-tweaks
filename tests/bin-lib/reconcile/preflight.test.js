'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ghHealthCheck } = require('../../../bin/lib/reconcile/preflight');

test('ghHealthCheck: healthy when the runner returns cleanly', () => {
  const r = ghHealthCheck({ runner: () => '5000\n' });
  assert.deepEqual(r, { ok: true, reason: null });
});

test('ghHealthCheck: gh-absent on ENOENT', () => {
  const r = ghHealthCheck({ runner: () => { const e = new Error('not found'); e.code = 'ENOENT'; throw e; } });
  assert.deepEqual(r, { ok: false, reason: 'gh-absent' });
});

test('ghHealthCheck: github-unreachable on any other failure (timeout, network, non-zero exit)', () => {
  const r = ghHealthCheck({ runner: () => { throw new Error('ETIMEDOUT'); } });
  assert.deepEqual(r, { ok: false, reason: 'github-unreachable' });
});

test('ghHealthCheck: calls `gh api rate_limit`, not a repo-scoped endpoint', () => {
  let seen = null;
  ghHealthCheck({ runner: (args) => { seen = args; return '5000\n'; } });
  assert.ok(seen.includes('rate_limit'), `expected rate_limit in ${JSON.stringify(seen)}`);
});
