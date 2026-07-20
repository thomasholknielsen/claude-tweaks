'use strict';

// Churn calc, shared by harness-health, journey-health, and docs-health
// (byte-identical across the three today). code-health keeps its own
// computeChurn locally — it returns an extra `stayed` field the other
// skills don't have. Run-record persistence (recordRun/readRuns, local-disk)
// was removed by the durable-state migration: run history now lives on the
// health-state git branch (see _shared/health-state.md), read via
// readDurableState(root).runs, not from a local runsDir.
//
// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);
  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = Math.round(((appeared.length + disappeared.length) / total) * 1000) / 1000;
  return { appeared, disappeared, ratio };
}

module.exports = { computeChurn };
