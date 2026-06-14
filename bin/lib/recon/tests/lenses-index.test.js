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

test('default set excludes project-command (needs config)', () => {
  const ids = buildLenses({}).map((l) => l.id);
  assert.deepStrictEqual(ids, ['todo-comments', 'oversized-file', 'dead-export', 'dependency-freshness']);
});

test('enabledLenses selects by id, in order, including project-command', () => {
  const ids = buildLenses({ enabledLenses: ['project-command', 'todo-comments'] }).map((l) => l.id);
  assert.deepStrictEqual(ids, ['project-command', 'todo-comments']);
});
