'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { sharedFacetDefaults } = require('../../../plugin/bin/lib/issues/facet-shape');
const { parseRecordFacets } = require('../../../plugin/bin/lib/issues/record');
const { defaultFacets } = require('../../../plugin/bin/lib/issues/local-store');

// Regression test for #26: parseRecordFacets and defaultFacets used to declare
// the same shared-key defaults independently, with nothing catching drift if a
// new key was added to one and forgotten in the other. Both now build on
// sharedFacetDefaults() — this test fails if either driver's shared-key output
// diverges from it.
test('sharedFacetDefaults matches both parseRecordFacets and defaultFacets for every shared key', () => {
  const shared = sharedFacetDefaults();
  const githubShape = parseRecordFacets([]);
  const localShape = defaultFacets();

  for (const key of Object.keys(shared)) {
    assert.deepStrictEqual(
      githubShape[key], shared[key],
      `parseRecordFacets()'s "${key}" diverged from sharedFacetDefaults()`,
    );
    assert.deepStrictEqual(
      localShape[key], shared[key],
      `defaultFacets()'s "${key}" diverged from sharedFacetDefaults()`,
    );
  }
});

test('sharedFacetDefaults returns a fresh object graph on every call', () => {
  const a = sharedFacetDefaults();
  const b = sharedFacetDefaults();
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(a.grants, b.grants);
  assert.notStrictEqual(a.bot, b.bot);
});
