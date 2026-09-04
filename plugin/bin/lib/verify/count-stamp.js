// plugin/bin/lib/verify/count-stamp.js — suite-count regression stamp (#881).
// Persists the "tests" check's executed-test count across runs so a quieter
// suite is surfaced as a caveat instead of reading identical to a clean pass
// (IL-84: an enumerated glob silently excluded a whole test directory —
// fifteen tests never ran, and `npm test` still exited 0). This is a
// caveat/surfacing mechanism, not a hard gate: a legitimate removal also
// drops the count, so the caveat flags the drop for a human to judge rather
// than failing the run.
//
// Counts fail toward absence, matching extract.js's own rule (a wrong count
// would poison this module's comparison): a missing, unreadable, or
// malformed stamp reads as "no baseline yet" — bootstrap, never a false
// regression.
'use strict';

const fs = require('fs');

// Read-side only: the stamp is written by bin/verify.js via atomic-write.js.
function readStamp(stampPath, fsImpl = fs) {
  let parsed;
  try {
    parsed = JSON.parse(fsImpl.readFileSync(stampPath, 'utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (typeof parsed.tests !== 'number' || !Number.isFinite(parsed.tests)) return null;
  return parsed;
}

// previous/current are stamp-shaped objects ({tests, ...}) or null. Returns
// null when there is nothing to compare (no previous baseline, or this run
// produced no parseable count) — callers render no caveat in that case. Only
// a strict decrease counts as a regression; an equal or higher count does
// not, and a removed-then-readded suite naturally clears itself next run.
function detectRegression(previous, current) {
  if (previous === null || current === null) return null;
  if (typeof previous.tests !== 'number' || typeof current.tests !== 'number') return null;
  if (current.tests >= previous.tests) return null;
  return {
    previousTests: previous.tests,
    currentTests: current.tests,
    droppedBy: previous.tests - current.tests,
  };
}

function caveatLine(regression) {
  if (regression === null) return null;
  return `CAVEAT: test count dropped from ${regression.previousTests} to `
    + `${regression.currentTests} (−${regression.droppedBy}) since the last recorded run. `
    + 'A quieter suite can mean tests were silently excluded, not that fewer are failing '
    + '(see docs/incident-log.md IL-84). Confirm the drop is an intentional removal before '
    + 'treating this run as a clean pass.';
}

module.exports = { readStamp, detectRegression, caveatLine };
