'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { makeCmdMark, MARK_STATUSES } = require('../mark');

// Regression: cmdMark used to be duplicated near-verbatim across
// harness-health.js, journey-health.js, and docs-health.js (code-health.js
// has no mark command) — now a single shared implementation parameterized
// by { readCache, writeCache, toolName }.

function fakeCacheStore(initial = {}) {
  let cache = { ...initial };
  return {
    readCache: () => ({ ...cache }),
    writeCache: (root, next) => { cache = next; },
    get: () => cache,
  };
}

test('MARK_STATUSES only allows "declined"', () => {
  assert.deepStrictEqual([...MARK_STATUSES], ['declined']);
});

test('writes a declined status to the cache and echoes it on stdout', () => {
  const store = fakeCacheStore();
  const cmdMark = makeCmdMark({ readCache: store.readCache, writeCache: store.writeCache, toolName: 'journey-health' });
  const origWrite = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try {
    cmdMark({ _: ['mark', 'fp-1', 'declined'], root: '/tmp/whatever' });
  } finally {
    process.stdout.write = origWrite;
  }
  assert.strictEqual(store.get()['fp-1'].status, 'declined');
  assert.ok(typeof store.get()['fp-1'].lastSeenMs === 'number');
  const printed = JSON.parse(out);
  assert.strictEqual(printed.status, 'declined');
});

test('exits non-zero with a usage message for an invalid status', () => {
  const store = fakeCacheStore();
  const cmdMark = makeCmdMark({ readCache: store.readCache, writeCache: store.writeCache, toolName: 'docs-health' });
  const origExit = process.exit;
  const origErr = process.stderr.write;
  let exitCode = null;
  let errOut = '';
  process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
  process.stderr.write = (chunk) => { errOut += chunk; return true; };
  try {
    assert.throws(() => cmdMark({ _: ['mark', 'fp-1', 'bogus'], root: '/tmp' }), /__exit__/);
  } finally {
    process.exit = origExit;
    process.stderr.write = origErr;
  }
  assert.strictEqual(exitCode, 2);
  assert.match(errOut, /usage: docs-health\.js mark/);
  assert.deepStrictEqual(store.get(), {}, 'cache must not be written on an invalid status');
});

test('exits non-zero when the fingerprint positional is missing', () => {
  const store = fakeCacheStore();
  const cmdMark = makeCmdMark({ readCache: store.readCache, writeCache: store.writeCache, toolName: 'harness-health' });
  const origExit = process.exit;
  process.exit = (code) => { throw new Error(`__exit_${code}__`); };
  try {
    assert.throws(() => cmdMark({ _: ['mark'], root: '/tmp' }), /__exit_2__/);
  } finally {
    process.exit = origExit;
  }
});
