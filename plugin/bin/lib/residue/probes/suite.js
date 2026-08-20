// bin/lib/residue/probes/suite.js — the project's own test suite at close time.
//
// This is the `blast-radius` class: a suite red at close time is this run's
// own concern regardless of why it's red — the session hit it, so it belongs
// in the report under every scope, not just `repo`. A suite that could not be
// run, or timed out, reports `ran: false` — never green.
'use strict';

const { makeFinding } = require('../finding');

function probeSuite({ scope, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const result = run();
  if (result === null) return { ran: false, reason: 'could not run the project test command', findings: [] };
  if (result.timedOut) return { ran: false, reason: 'test command timed out', findings: [] };
  if (result.code === 0) return { ran: true, reason: null, findings: [] };

  const allFailing = String(result.stdout || '').split('\n').filter((l) => l.startsWith('not ok'));
  const failing = allFailing.slice(0, 5);
  const truncated = allFailing.length > failing.length ? ` (+${allFailing.length - failing.length} more)` : '';
  return {
    ran: true,
    reason: null,
    findings: [makeFinding({
      kind: 'suite',
      scope: 'blast-radius',
      subject: `test suite exit ${result.code}`,
      remedy: 'record',
      evidence: failing.length ? `${failing.join('; ')}${truncated}` : `test command exited ${result.code}`,
    })],
  };
}

module.exports = { probeSuite };
