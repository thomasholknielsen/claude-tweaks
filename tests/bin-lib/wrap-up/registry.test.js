'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { REGISTRY, rowById, ROW_IDS } = require('../../../plugin/bin/lib/wrap-up/registry');

test('registry has the 8 rows in canonical order', () => {
  assert.deepStrictEqual(ROW_IDS, [
    'skills', 'docs', 'journeys', 'claude-md', 'decision-records',
    'references', 'memory', 'upstream',
  ]);
});

test('memory and upstream come after every other routing row', () => {
  const idx = (id) => ROW_IDS.indexOf(id);
  for (const id of ROW_IDS.filter((r) => r !== 'memory' && r !== 'upstream')) {
    assert.ok(idx(id) < idx('memory') && idx(id) < idx('upstream'), id);
  }
});

test('every row is complete and claude-md is stage-only', () => {
  for (const r of REGISTRY) {
    assert.ok(r.id && r.target && r.judge && r.disposition && r.gate && r.scope, r.id);
  }
  assert.strictEqual(rowById('claude-md').disposition, 'stage-only');
  assert.strictEqual(rowById('memory').disposition, 'stage');
  assert.strictEqual(rowById('upstream').disposition, 'stage');
});

test('registry is frozen', () => {
  assert.ok(Object.isFrozen(REGISTRY));
  assert.throws(() => { REGISTRY.push({}); }, TypeError);
});
