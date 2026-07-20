'use strict';

// Churn calc, shared by all four health-suite engines (code-health,
// harness-health, journey-health, docs-health). code-health's churn-report
// renderer (bin/lib/health-core/churn-report.js) additionally reads the
// `stayed` field below; the other three ignore it. Run-record persistence
// (recordRun/readRuns, local-disk) was removed by the durable-state
// migration: run history now lives on the health-state git branch (see
// _shared/health-state.md), read via readDurableState(root).runs, not from
// a local runsDir.
//
// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);
  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const stayed = currentFps.filter((fp) => prior.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = Math.round(((appeared.length + disappeared.length) / total) * 1000) / 1000;
  return { appeared, disappeared, stayed, ratio };
}

module.exports = { computeChurn };
