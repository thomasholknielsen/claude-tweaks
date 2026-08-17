'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { selectBudget } = require('../../../plugin/bin/lib/health-core/budget');

// Regression: this is the extraction target for the "pick up to --budget
// distinct targets, simulating post-audit cursor state in-memory between
// picks" loop that used to be hand-rolled separately in code-health.js's
// cmdNextSlice and all three sibling cmdNextTargets (harness-health,
// journey-health, docs-health) — these tests exercise the shared
// implementation those four call sites now delegate to.

function makePool(ids) {
  // A trivial selectOne stand-in: picks the first id whose cursor key isn't
  // present yet (mirrors how a real selectFn stops proposing an
  // already-audited candidate once its cursor patch lands).
  return (cursors) => {
    const id = ids.find((i) => !cursors[i]);
    return id ? { id } : null;
  };
}

test('picks exactly `budget` distinct candidates when enough are available', () => {
  const selectOne = makePool(['a', 'b', 'c', 'd']);
  const picked = selectBudget(2, {}, selectOne, {
    getCursorKey: (c) => c.id,
    buildCursorPatch: () => ({ picked: true }),
  });
  assert.deepStrictEqual(picked.map((c) => c.id), ['a', 'b']);
});

test('stops early (returns fewer than budget) once selectOne runs out and returns null', () => {
  const selectOne = makePool(['a', 'b']);
  const picked = selectBudget(5, {}, selectOne, {
    getCursorKey: (c) => c.id,
    buildCursorPatch: () => ({ picked: true }),
  });
  assert.deepStrictEqual(picked.map((c) => c.id), ['a', 'b']);
});

test('returns an empty array when selectOne never has anything to pick', () => {
  const picked = selectBudget(3, {}, () => null, {
    getCursorKey: (c) => c.id,
    buildCursorPatch: () => ({}),
  });
  assert.deepStrictEqual(picked, []);
});

test('threads the simulated cursor patch into the next selectOne call (does not repeat the same pick)', () => {
  const calls = [];
  const selectOne = (cursors) => {
    calls.push({ ...cursors });
    if (cursors.a) return null; // only one candidate, already "picked"
    return { id: 'a' };
  };
  const picked = selectBudget(3, {}, selectOne, {
    getCursorKey: (c) => c.id,
    buildCursorPatch: (existing, c) => ({ ...(existing || {}), lastAuditedMs: 12345 }),
  });
  assert.strictEqual(picked.length, 1);
  assert.deepStrictEqual(calls[0], {}, 'first call sees the initial cursors untouched');
  assert.deepStrictEqual(calls[1], { a: { lastAuditedMs: 12345 } }, 'second call sees the simulated patch from the first pick');
});

test('buildCursorPatch receives the existing cursor entry so it can be merged, not overwritten', () => {
  const selectOne = makePool(['a']);
  const initialCursors = { a: { someOtherField: 'keep-me' } };
  // makePool's selectOne stops once cursors.a is truthy, so this only runs once —
  // but the existing entry passed into buildCursorPatch must still be the real one.
  let seenExisting = 'unset';
  const picked = selectBudget(1, initialCursors, () => ({ id: 'a' }), {
    getCursorKey: (c) => c.id,
    buildCursorPatch: (existing) => { seenExisting = existing; return { ...(existing || {}), lastAuditedMs: 1 }; },
  });
  assert.strictEqual(picked.length, 1);
  assert.deepStrictEqual(seenExisting, { someOtherField: 'keep-me' });
});

test('onPick fires after each pick, before the next selectOne call (journey-health alreadyPicked shape)', () => {
  const seenAtCallTime = [];
  const alreadyPicked = new Set();
  const selectOne = (cursors) => {
    seenAtCallTime.push([...alreadyPicked]);
    const candidates = ['x', 'y', 'z'];
    const id = candidates.find((c) => !alreadyPicked.has(c));
    return id ? { id } : null;
  };
  const picked = selectBudget(3, {}, selectOne, {
    getCursorKey: (c) => c.id,
    buildCursorPatch: () => ({}),
    onPick: (c) => alreadyPicked.add(c.id),
  });
  assert.deepStrictEqual(picked.map((c) => c.id), ['x', 'y', 'z']);
  assert.deepStrictEqual(seenAtCallTime, [[], ['x'], ['x', 'y']], 'onPick must run before the following selectOne call sees it');
});

test('does not mutate the caller-supplied initialCursors object', () => {
  const initialCursors = { a: { lastAuditedMs: 1 } };
  const frozen = JSON.stringify(initialCursors);
  selectBudget(2, initialCursors, makePool(['a', 'b']), {
    getCursorKey: (c) => c.id,
    buildCursorPatch: () => ({ lastAuditedMs: 999 }),
  });
  assert.strictEqual(JSON.stringify(initialCursors), frozen, 'initialCursors must not be mutated in place');
});
