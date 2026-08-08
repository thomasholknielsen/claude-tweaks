// bin/lib/residue/probes/suite.js — the project's own test suite at close time.
//
// This is the `observed` class: a suite red for reasons unrelated to this
// work still belongs in the report, because the session hit it. A suite that
// could not be run, or timed out, reports `ran: false` — never green.
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

  const failing = String(result.stdout || '').split('\n').filter((l) => l.startsWith('not ok')).slice(0, 5);
  return {
    ran: true,
    reason: null,
    findings: [makeFinding({
      kind: 'suite',
      scope: 'observed',
      subject: `test suite exit ${result.code}`,
      remedy: 'record',
      evidence: failing.length ? failing.join('; ') : `test command exited ${result.code}`,
    })],
  };
}

module.exports = { probeSuite };
