'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { makeCmdMark, MARK_STATUSES, mergeDeclinedIntoCache } = require('../mark');

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

// --- optional atomic local write (updateCache) and durable persistence
// (readDurableState/writeDurableState) — both additive, backward compatible ---

function fakeUpdateCache(initial = {}) {
  let cache = { ...initial };
  let calls = 0;
  return {
    updateCache: (root, mutatorFn) => { calls += 1; cache = mutatorFn({ ...cache }); return { ...cache }; },
    get: () => cache,
    callCount: () => calls,
  };
}

function fakeDurableStateStore(initial = { declined: {} }) {
  let state = { ...initial };
  return {
    readDurableState: () => ({ ...state }),
    writeDurableState: (root, mutatorFn) => { state = mutatorFn(state); return { ok: true }; },
    get: () => state,
  };
}

test('when updateCache is supplied, the local write goes through it instead of bare readCache/writeCache', () => {
  const store = fakeCacheStore();
  const uc = fakeUpdateCache();
  const cmdMark = makeCmdMark({ readCache: store.readCache, writeCache: store.writeCache, updateCache: uc.updateCache, toolName: 'journey-health' });
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    cmdMark({ _: ['mark', 'fp-1', 'declined'], root: '/tmp' });
  } finally {
    process.stdout.write = origWrite;
  }
  assert.strictEqual(uc.callCount(), 1, 'must route the write through updateCache when supplied');
  assert.strictEqual(uc.get()['fp-1'].status, 'declined');
  assert.deepStrictEqual(store.get(), {}, 'must not ALSO write through the plain writeCache path when updateCache handled it');
});

test('when readDurableState/writeDurableState are BOTH supplied, the declined mark is also persisted durably', () => {
  const store = fakeCacheStore();
  const durable = fakeDurableStateStore();
  const cmdMark = makeCmdMark({
    readCache: store.readCache, writeCache: store.writeCache,
    readDurableState: durable.readDurableState, writeDurableState: durable.writeDurableState,
    toolName: 'docs-health',
  });
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    cmdMark({ _: ['mark', 'fp-2', 'declined'], root: '/tmp' });
  } finally {
    process.stdout.write = origWrite;
  }
  // Local cache still gets the mark (unchanged pre-existing behavior).
  assert.strictEqual(store.get()['fp-2'].status, 'declined');
  // AND the durable declined slice now carries it too.
  assert.ok('fp-2' in durable.get().declined, 'the durable declined map must carry the fingerprint');
  assert.strictEqual(typeof durable.get().declined['fp-2'].lastSeenMs, 'number');
});

test('omitting readDurableState/writeDurableState entirely preserves the pre-existing local-only behavior (backward compatible)', () => {
  const store = fakeCacheStore();
  const cmdMark = makeCmdMark({ readCache: store.readCache, writeCache: store.writeCache, toolName: 'harness-health' });
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    cmdMark({ _: ['mark', 'fp-3', 'declined'], root: '/tmp' });
  } finally {
    process.stdout.write = origWrite;
  }
  assert.strictEqual(store.get()['fp-3'].status, 'declined');
});

test('a failed durable write does not lose the local mark, and reports the failure on stderr instead of silently dropping it', () => {
  const store = fakeCacheStore();
  const readDurableState = () => ({ declined: {} });
  const writeDurableState = () => ({ ok: false, error: 'exhausted 3 CAS attempts' });
  const cmdMark = makeCmdMark({
    readCache: store.readCache, writeCache: store.writeCache,
    readDurableState, writeDurableState,
    toolName: 'harness-health',
  });
  let stderrOut = '';
  const origStderrWrite = process.stderr.write;
  const origStdoutWrite = process.stdout.write;
  process.stderr.write = (chunk) => { stderrOut += chunk; return true; };
  process.stdout.write = () => true;
  try {
    cmdMark({ _: ['mark', 'fp-4', 'declined'], root: '/tmp' });
  } finally {
    process.stderr.write = origStderrWrite;
    process.stdout.write = origStdoutWrite;
  }
  assert.strictEqual(store.get()['fp-4'].status, 'declined', 'the local mark must still be saved even when the durable write fails');
  assert.match(stderrOut, /durable health-state persistence failed/);
});

// mergeDeclinedIntoCache: pure unit coverage for the durable-declined merge every
// cmdValidateFindings wired with includeDeclined applies before handing readCache off to
// dedupAndDispatch — mark.js's optional readDurableState/writeDurableState wiring above
// persists a "declined" mark to the health-state branch, but nothing reads that branch back
// into the dedup decision unless something merges it into the local cache shape decide()
// already understands. A scheduled Routine's fresh container never shares the local
// gitignored cache.json a prior firing wrote, so without this merge a declined finding would
// resurface there even though the mark itself was durably persisted. Shared by harness-health,
// docs-health, and journey-health — previously duplicated per skill before this extraction.

test('mergeDeclinedIntoCache: an empty declined map leaves the cache untouched', () => {
  const cache = { 'skill-aaaa0001': { status: 'staged', lastSeenMs: 1 } };
  const merged = mergeDeclinedIntoCache(cache, {});
  assert.deepStrictEqual(merged, cache);
});

test('mergeDeclinedIntoCache: a declined fingerprint absent from the local cache is added as status: declined', () => {
  const merged = mergeDeclinedIntoCache({}, { 'skill-bbbb0002': { lastSeenMs: 42 } });
  assert.deepStrictEqual(merged['skill-bbbb0002'], { status: 'declined', lastSeenMs: 42 });
});

test('mergeDeclinedIntoCache: a durable-declined fingerprint overrides a conflicting local cache entry', () => {
  const cache = { 'skill-cccc0003': { status: 'staged', lastSeenMs: 1 } };
  const merged = mergeDeclinedIntoCache(cache, { 'skill-cccc0003': { lastSeenMs: 99 } });
  assert.deepStrictEqual(
    merged['skill-cccc0003'],
    { status: 'declined', lastSeenMs: 99 },
    'durable declined must win — matches each skill\'s own dedup.js decide() precedence',
  );
});

test('mergeDeclinedIntoCache: an unrelated local cache entry survives untouched', () => {
  const cache = { 'skill-dddd0004': { status: 'regressed', issue: 5, lastSeenMs: 1 } };
  const merged = mergeDeclinedIntoCache(cache, { 'skill-eeee0005': { lastSeenMs: 2 } });
  assert.deepStrictEqual(merged['skill-dddd0004'], { status: 'regressed', issue: 5, lastSeenMs: 1 });
  assert.deepStrictEqual(merged['skill-eeee0005'], { status: 'declined', lastSeenMs: 2 });
});

test('mergeDeclinedIntoCache: does not mutate the original cache object', () => {
  const cache = {};
  mergeDeclinedIntoCache(cache, { 'skill-ffff0006': { lastSeenMs: 3 } });
  assert.deepStrictEqual(cache, {}, 'the input cache object must not be mutated in place');
});
