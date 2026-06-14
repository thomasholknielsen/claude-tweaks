'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const recon = require('../../bin/recon');

test('selectAreas delegates to scoreAreas and slices top-K', () => {
  // Inject deterministic signals so the test does not shell out to git.
  const areas = [
    { id: 'src/api', path: 'src/api' },
    { id: 'src/util', path: 'src/util' },
    { id: 'src/old', path: 'src/old' },
  ];
  const signals = {
    'src/api': { lastSweptMs: Date.now() - 86400000, churn: 30, loc: 4000, priorFindings: 8, fanIn: 12 },
    'src/util': { lastSweptMs: Date.now() - 86400000, churn: 1, loc: 200, priorFindings: 0, fanIn: 1 },
    'src/old': { lastSweptMs: null, churn: 0, loc: 0, priorFindings: 0, fanIn: 0 },
  };
  const picked = recon.selectAreas(
    { K: 2 },
    { areas, signals, now: Date.now() },
  );
  assert.strictEqual(picked.length, 2);
  // src/old (never swept → boosted) and src/api (hot) outrank src/util.
  const ids = picked.map((a) => a.id);
  assert.ok(ids.includes('src/old'));
  assert.ok(ids.includes('src/api'));
  assert.ok(!ids.includes('src/util'));
});
