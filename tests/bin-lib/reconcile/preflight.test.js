'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ghHealthCheck, ghHealthCheckAsync } = require('../../../plugin/bin/lib/reconcile/preflight');

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

// Async twin (#872) — same contract as ghHealthCheck above, just awaited.
// Mirrors the sync suite's exact scenarios rather than a subset, so the two
// implementations can't silently drift on classification.

test('ghHealthCheckAsync: healthy when the runner returns cleanly', async () => {
  const r = await ghHealthCheckAsync({ runner: async () => '5000\n' });
  assert.deepEqual(r, { ok: true, reason: null });
});

test('ghHealthCheckAsync: gh-absent on ENOENT', async () => {
  const r = await ghHealthCheckAsync({
    runner: async () => { const e = new Error('not found'); e.code = 'ENOENT'; throw e; },
  });
  assert.deepEqual(r, { ok: false, reason: 'gh-absent' });
});

test('ghHealthCheckAsync: github-unreachable on any other failure (timeout, network, non-zero exit)', async () => {
  const r = await ghHealthCheckAsync({ runner: async () => { throw new Error('ETIMEDOUT'); } });
  assert.deepEqual(r, { ok: false, reason: 'github-unreachable' });
});

test('ghHealthCheckAsync: calls `gh api rate_limit`, not a repo-scoped endpoint', async () => {
  let seen = null;
  await ghHealthCheckAsync({ runner: async (args) => { seen = args; return '5000\n'; } });
  assert.ok(seen.includes('rate_limit'), `expected rate_limit in ${JSON.stringify(seen)}`);
});

test('ghHealthCheckAsync: does not block the event loop (real concurrency, not execFileSync in disguise)', async () => {
  // Same technique as pr-state.test.js's resolvePrStateAsync concurrency
  // proof: a runner that sleeps briefly, then compare N-concurrent wall time
  // against N-sequential. A blocking implementation would make the ratio
  // ~1; real concurrency keeps it well under.
  const sleepyRunner = () => new Promise((resolve) => setTimeout(() => resolve('5000\n'), 60));

  const concurrentStart = Date.now();
  await Promise.all([
    ghHealthCheckAsync({ runner: sleepyRunner }),
    ghHealthCheckAsync({ runner: sleepyRunner }),
    ghHealthCheckAsync({ runner: sleepyRunner }),
  ]);
  const concurrentElapsed = Date.now() - concurrentStart;

  const sequentialStart = Date.now();
  await ghHealthCheckAsync({ runner: sleepyRunner });
  await ghHealthCheckAsync({ runner: sleepyRunner });
  await ghHealthCheckAsync({ runner: sleepyRunner });
  const sequentialElapsed = Date.now() - sequentialStart;

  assert.ok(
    concurrentElapsed < sequentialElapsed * 0.9,
    `expected concurrent (${concurrentElapsed}ms) under sequential (${sequentialElapsed}ms) — a blocking implementation would make these roughly equal (ratio ~1)`,
  );
});
