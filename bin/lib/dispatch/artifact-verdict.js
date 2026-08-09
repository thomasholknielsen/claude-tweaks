'use strict';
// The structural half of #296's "re-derive from raw artifacts" guarantee: a
// dispatch group's second Task() call (review,polish,wrap-up) must not trust
// the first call's (build,test) claims -- including claims persisted to files
// (decisions.md, ledger entries, staged proposals) the second call's own
// /wrap-up pass may read. This function is deliberately narrow: it reads
// ONLY the raw test-output artifact it's told to read, and nothing else --
// there is no code path here that could be swayed by a planted claim
// elsewhere, because there is no code path here that reads anything else.

const fs = require('fs');

function deriveTestVerdict({ rawTestOutputPath }) {
  const content = fs.readFileSync(rawTestOutputPath, 'utf8');
  const failMatch = content.match(/^# fail (\d+)$/m);
  const failCount = failMatch ? Number(failMatch[1]) : 0;
  return { passed: failCount === 0, failCount, source: 'raw-artifact' };
}

module.exports = { deriveTestVerdict };
