// bin/lib/residue/probes/pipeline-runs.js — un-archived, already-closed run
// dirs. `iterRunDirsWithState` (bin/lib/hooks/context.js) permanently skips
// any run dir once its run-state.json reaches status: 'clean' — that is
// correct for every OTHER consumer (a clean run has nothing left to reconcile
// against live git/PR state), but it also means a run whose archival step
// got missed (the bug this file's sibling skill-prose fix, #717, addresses)
// becomes invisible to bin/lib/reconcile/archive-merged.js's own sweep
// forever after. This probe deliberately reads .claude-tweaks/pipelines/
// directly instead of going through iterRunDirsWithState, so it catches
// exactly the dirs that blind spot already produced.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { makeFinding } = require('../finding');
const { mainCheckoutRoot } = require('../../hooks/worktree-detect');
const { RUN_ID_RE } = require('../../hooks/context');

function probePipelineRuns({ cwd } = {}) {
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start) || start;
  const base = path.join(root, '.claude-tweaks', 'pipelines');
  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // No .claude-tweaks/pipelines/ at all is a normal, clean state (a repo
      // that has never run a claude-tweaks pipeline) — not a probe failure.
      return { ran: true, reason: null, findings: [] };
    }
    // Any other readdirSync failure (EACCES, EIO, ...) is a genuine probe
    // failure, not "nothing to report" — match the sibling probes'
    // ran: false / reason contract (probeRelease, probeBranches, probeSuite)
    // instead of silently reporting a clean sweep.
    return { ran: false, reason: `could not read .claude-tweaks/pipelines/ (${err.code || err.message})`, findings: [] };
  }

  const findings = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_ID_RE.test(entry.name)) continue; // skips archive/ and any non-run sibling
    const dir = path.join(base, entry.name);
    let state = null;
    try {
      state = JSON.parse(fs.readFileSync(path.join(dir, 'run-state.json'), 'utf8'));
    } catch {
      continue; // no readable run-state.json — nothing to classify as closed
    }
    if (!state || state.status !== 'clean') continue;
    findings.push(makeFinding({
      kind: 'pipeline-run',
      // Hardcoded, like probeRelease/probeSuite — this is cheap, mechanical
      // housekeeping any wrap-up cycle should surface and fix regardless of
      // which run originally produced the orphan, not something to hide
      // behind --scope repo the way another session's live worktree is.
      scope: 'blast-radius',
      subject: path.relative(root, dir),
      remedy: 'auto',
      evidence: 'run-state.json status: clean, not under .claude-tweaks/pipelines/archive/ — see wrap-up/cleanup-procedures.md Section B for the archival move',
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probePipelineRuns };
