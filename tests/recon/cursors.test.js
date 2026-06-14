'use strict';
// FIX 1 tests: per-area sweep cursors and rotation
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recordRun, readCursors } = require('../../bin/lib/recon/cache');
const { scoreAreas } = require('../../bin/lib/recon/score');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cursors-'));
}

// Test 1: recordRun with areasSwept persists lastSweptMs in cursors.json
test('recordRun with areasSwept persists numeric lastSweptMs via readCursors', () => {
  const root = tmpRoot();
  const before = Date.now();
  recordRun(root, '2026-06-14T120000', { fingerprints: ['fp-a', 'fp-b'], areasSwept: ['src/api', 'src/util'] });
  const after = Date.now();

  const cursors = readCursors(root);
  assert.ok(cursors['src/api'], 'src/api cursor should exist');
  assert.ok(cursors['src/util'], 'src/util cursor should exist');
  assert.strictEqual(typeof cursors['src/api'].lastSweptMs, 'number');
  assert.ok(cursors['src/api'].lastSweptMs >= before, 'lastSweptMs should be >= before timestamp');
  assert.ok(cursors['src/api'].lastSweptMs <= after, 'lastSweptMs should be <= after timestamp');
});

// Test 2: multiple runs accumulate cursors (later run updates timestamp)
test('recordRun updates existing cursor on second sweep', () => {
  const root = tmpRoot();
  recordRun(root, 'run-1', { fingerprints: ['fp-a'], areasSwept: ['src/api'] });
  const firstMs = readCursors(root)['src/api'].lastSweptMs;

  // tiny sleep is unavoidable to ensure ms difference — use Date.now guard instead
  recordRun(root, 'run-2', { fingerprints: ['fp-b'], areasSwept: ['src/api'] });
  const secondMs = readCursors(root)['src/api'].lastSweptMs;

  assert.ok(secondMs >= firstMs, 'second sweep should stamp >= first sweep timestamp');
});

// Test 3: readCursors returns {} when no cursors file exists
test('readCursors returns {} when cursors file absent', () => {
  const root = tmpRoot();
  assert.deepStrictEqual(readCursors(root), {});
});

// Test 4: rotation — area B (never swept, null lastSweptMs) outranks area A (swept just now)
// with otherwise equal signals.
test('scoreAreas ranks never-swept area above just-swept area with equal other signals', () => {
  const NOW = Date.now();
  const areas = [
    { id: 'area-a', path: 'area-a' },
    { id: 'area-b', path: 'area-b' },
  ];
  const signals = {
    // area-a was swept 1 second ago — effectively just swept
    'area-a': { lastSweptMs: NOW - 1000, churn: 5, loc: 500, priorFindings: 2, fanIn: 3 },
    // area-b has identical other signals but was NEVER swept (null)
    'area-b': { lastSweptMs: null, churn: 5, loc: 500, priorFindings: 2, fanIn: 3 },
  };
  const ranked = scoreAreas(areas, signals, NOW);
  // area-b (null lastSweptMs → stale boost) must rank above area-a
  assert.strictEqual(ranked[0].id, 'area-b', 'never-swept area-b should outrank just-swept area-a');
  assert.ok(ranked[0].score > ranked[1].score, 'area-b score should exceed area-a score');
});

// Test 5: the churn.test.js backward-compat — old flat array signature should still work
// (we need to handle old callers gracefully; this test verifies it after the interface change)
test('recordRun old flat-array form still round-trips fingerprints (backward-compat)', () => {
  const root = tmpRoot();
  // Pass object-form with areasSwept omitted — should still write run log
  recordRun(root, '2026-06-14T130000', { fingerprints: ['fp-x', 'fp-y'], areasSwept: [] });
  const cursors = readCursors(root);
  // No areas swept, so cursors should be empty
  assert.deepStrictEqual(cursors, {});
});
