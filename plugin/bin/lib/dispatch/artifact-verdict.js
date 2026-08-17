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
  // No `# fail N` summary line at all -- empty, truncated, or not TAP output.
  // Defaulting that to failCount 0 would hand a PASSING verdict to whoever
  // supplies the least evidence, which for a module whose whole job is
  // resisting being fooled is the easiest way to fool it. Throw instead, same
  // posture as the missing-file case readFileSync already throws on: an
  // unreadable artifact and an unparseable one are the same failure to the
  // caller, and neither is a pass.
  if (!failMatch) {
    throw new Error(
      `deriveTestVerdict: no "# fail N" summary line in ${rawTestOutputPath} — `
      + 'the artifact is empty, truncated, or not TAP output; refusing to infer a passing verdict',
    );
  }
  const failCount = Number(failMatch[1]);
  return { passed: failCount === 0, failCount, source: 'raw-artifact' };
}

module.exports = { deriveTestVerdict };
