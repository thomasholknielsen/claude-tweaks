'use strict';

const path = require('node:path');
const { makeFinding } = require('../finding');

const REAPER_DOMAIN = path.join('.claude', 'worktrees');

function probeWorktrees({ scope } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const findings = [];
  for (const wt of scope.worktrees) {
    // The first entry of `git worktree list` is the main working tree. It is
    // never residue, and removing it is not a thing that can happen.
    if (wt === scope.worktrees[0]) continue;
    const reaped = wt.path.includes(REAPER_DOMAIN);
    findings.push(makeFinding({
      kind: 'worktree',
      scope: 'blast-radius',
      subject: wt.path,
      // A live lock means a session is using it; that is a human's call.
      remedy: wt.locked ? 'record' : 'auto',
      evidence: wt.locked
        ? `git worktree list --porcelain: locked, branch ${wt.branch || 'unknown'}`
        : `git worktree list --porcelain: unlocked, branch ${wt.branch || 'unknown'}, ${reaped ? 'in reaper domain' : 'outside reaper domain (no reaper collects it)'}`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeWorktrees, REAPER_DOMAIN };
