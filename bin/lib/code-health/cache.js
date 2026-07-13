'use strict';
const fs = require('fs');
const path = require('path');
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');

// Local, gitignored: cache.json only (open/closed/wontfix/regressed dedup —
// rebuildable from `gh issue list`, so it's fine to stay local/ephemeral).
// Canonical path: <root>/.claude-tweaks/code-health/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'regressed', issue: <number|null> } }
//
// Cursors, the sub-threshold "remembered" cache, the retry queue, and run
// history are durable instead — they live on the health-state branch (see
// _shared/health-state.md), not local disk, since local disk doesn't survive
// a scheduled cloud-routine firing's container recycling between runs.

const core = createCache('code-health');
const durable = createDurableState('code-health', { includeRemembered: true });

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
// PORT.md delta #5: union denominator, NOT max(prior, current).
// A complete turnover gives ratio 1.0; no changes gives ratio 0.0.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);

  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const stayed = currentFps.filter((fp) => prior.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const raw = (appeared.length + disappeared.length) / total;
  const ratio = Math.round(raw * 1000) / 1000;

  return { appeared, disappeared, stayed, ratio };
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  computeChurn,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
};
