// tests/bin-lib/claim-targets/cli.test.js
// Wiring, not behavior — the claim-side twin of tests/bin-lib/release-claim/cli.test.js's
// `realDeps` test. Every test in claim-targets.test.js injects its own deps into `run()`,
// so a dropped or mis-wired dep in bin/claim-targets.js's own `realDeps` leaves that whole
// suite green while the real CLI degrades silently: without `gitRunner` every claim write
// falls back to the contents-API PUT — the rate-limited endpoint #787 moved the fleet's
// most-contended write off — and nothing fails, it just gets slower and more contended.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, realDeps } = require('../../../plugin/bin/claim-targets');
const claimsGitCas = require('../../../plugin/bin/lib/issues/claims-git-cas');
const claimStore = require('../../../plugin/bin/lib/issues/claim-store');
const lib = require('../../../plugin/bin/lib/claim-targets/claim-targets');

test('realDeps wires the real git-CAS runner and the real claim-store ghApi', () => {
  assert.equal(realDeps.gitRunner, claimsGitCas.defaultRunner, 'gitRunner is claims-git-cas.js\'s defaultRunner export');
  assert.equal(realDeps.ghApi, claimStore.defaultGhApi, 'ghApi is claim-store.js\'s defaultGhApi export');
  assert.equal(typeof realDeps.gh, 'function', 'the generic throwing gh runner is wired too');
});

test('the CLI re-exports the library `run`, so realDeps is what the entry point actually passes', () => {
  assert.equal(run, lib.run);
});
