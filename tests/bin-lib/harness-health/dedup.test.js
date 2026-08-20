const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../../../plugin/bin/lib/harness-health/dedup');

// ../dedup.js is nothing but `module.exports = require('../health-core/dedup')`
// -- a byte-identical pass-through wrapper (see that file's own header
// comment: "Shared by harness-health, journey-health, and docs-health").
// decide()'s actual branch coverage (file/skip/suppress/reopen across every
// issue-index and local-cache combination, including the 'regressed'
// cache-only fallback this file never tested) is already fully exercised,
// with a superset of cases, by tests/bin-lib/health-core/dedup.test.js --
// re-testing every branch again here through the wrapper gives zero
// additional coverage while doubling the maintenance surface for any future
// change to decide()'s contract. Mirrors the same
// shared-vs-per-subsystem-wrapper principle already documented in
// tests/bin-lib/harness-health/cache.test.js's readDurableState/
// writeDurableState sanity test.
test('decide is the shared health-core implementation, not a local reimplementation', () => {
  // Referential identity, not just call-compatible behavior: proves this
  // module still does nothing but re-export health-core's decide(), so any
  // future divergence (e.g. someone starts hand-writing harness-health-
  // specific logic here instead of re-exporting) fails loudly right here,
  // rather than silently drifting from the fully-tested shared
  // implementation while this file's own (now-removed) duplicate assertions
  // kept passing against the drifted copy.
  assert.strictEqual(decide, require('../../../plugin/bin/lib/health-core/dedup').decide);
});
