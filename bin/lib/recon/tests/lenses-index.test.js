const { test } = require('node:test');
const assert = require('node:assert');
const { buildLenses, ALL_LENSES } = require('../lenses/index');

test('every lens satisfies the {id, kind:mechanical, run} contract', () => {
  for (const lens of ALL_LENSES) {
    assert.strictEqual(typeof lens.id, 'string');
    assert.strictEqual(lens.kind, 'mechanical');
    assert.strictEqual(typeof lens.run, 'function');
  }
});

test('buildLenses always returns [] (lenses demoted from run spine in v2)', () => {
  assert.deepStrictEqual(buildLenses({}), []);
});

test('buildLenses returns [] even when enabledLenses is specified (v2 spine)', () => {
  assert.deepStrictEqual(buildLenses({ enabledLenses: ['project-command', 'todo-comments'] }), []);
});
