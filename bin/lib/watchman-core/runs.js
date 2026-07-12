'use strict';
const fs = require('fs');
const path = require('path');

// Simple run-record persistence + churn calc, shared by harness-health and
// journey-health (byte-identical between the two today). code-health keeps
// its own recordRun/computeChurn locally — its recordRun also sweeps area
// cursors as a side effect, and its computeChurn returns an extra `stayed`
// field, neither of which the other two skills have.
function recordRun(runsDir, runId, fingerprints) {
  fs.mkdirSync(runsDir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(runsDir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

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

module.exports = { recordRun, computeChurn };
