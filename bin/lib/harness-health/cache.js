'use strict';
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');

// Local, gitignored: cache.json only (rebuildable-from-issues dedup state).
// Canonical path: <root>/.claude-tweaks/harness-health/cache.json
//
// Cursors (per-target audit + gap-scan), the retry queue, and run history
// are durable instead — they live on the health-state branch (see
// _shared/health-state.md), not local disk, since local disk doesn't
// survive a scheduled cloud-routine firing's container recycling.

const core = createCache('harness-health');
const durable = createDurableState('harness-health');

// Pure: computes the next durable-state object for a validate-findings run.
// current: { cursors, retryQueue, runs } — the current durable health-state
// shape (as returned by readDurableState). Unlike code-health, harness-health
// has no `remembered` tier (every surviving finding files unconditionally),
// so there is no remembered-delta to merge here.
// opts: { target, kind, gapScan, runRecord, now? }
//
// This is the exact logic bin/harness-health.js's cmdValidateFindings hands
// to writeDurableState as its mutator — extracted here (no git, no gh, no
// I/O) so its behaviors (target+kind cursor set, gap-scan cursor set,
// unrelated cursor keys preserved, run-history append) can be unit tested
// directly with plain-object fixtures, the same way code-health's
// buildValidateFindingsUpdate is tested in
// bin/lib/code-health/tests/build-validate-findings-update.test.js — see
// bin/lib/harness-health/tests/build-validate-findings-update.test.js.
// Every CLI-level test that reaches cmdValidateFindings's persistence step
// fails its `git fetch origin health-state` first (no real GitHub-hosted
// remote configured in any test), so the mutator itself is never actually
// invoked by any CLI-level test.
function buildValidateFindingsUpdate(current, { target, kind, gapScan, runRecord, now = Date.now() }) {
  const cursors = { ...current.cursors };
  if (target && kind) {
    cursors[`${kind}:${target}`] = { lastAuditedSha: null, lastAuditedMs: now };
  }
  if (gapScan) {
    cursors.__gapScan = { lastScannedSha: null, lastScannedMs: now };
  }
  return { ...current, cursors, runs: [...current.runs, runRecord] };
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
  buildValidateFindingsUpdate,
};
