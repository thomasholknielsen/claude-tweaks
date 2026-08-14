// bin/lib/reconcile/index.js — the reconciler's one exported entry point.
// Converges local state toward origin under the pr-first integration model:
// idempotent, safe from any session at any time. Never breaks a session —
// every error path degrades to a reported skip, never a thrown exception.
// Concurrency posture: two racing reconciles converge rather than conflict —
// the ff is a strict `--ff-only` (git itself refuses a non-ff), claim
// release rides the claim blob's own conditional-write semantics, and every
// check re-verifies state immediately before writing. Safe by these
// per-check properties, not by a global lock.
'use strict';
const { mainCheckoutRoot } = require('../hooks/worktree-detect');
const { resolveIntegrationBranch } = require('../hooks/worktree-reap');
const { resolveIntegrationModel } = require('../policy-schema');
const { mirrorFastForward } = require('./mirror-ff');
const { reapMerged } = require('./reap-merged');
const { releaseMerged } = require('./release-merged');
const { archiveMerged } = require('./archive-merged');

const ALL_CHECKS = ['mirror', 'reap', 'release', 'archive'];

// opts: { dryRun?: boolean, checks?: string[], cwd?: string }
// -> { mirror, worktrees, claims, runs, skipped }
// `local-merge` projects, and every no-forge project, skip every check with
// reason 'local-merge-model' — this module is gh-CLI-only by design (a Node
// subprocess cannot reach an agent session's MCP tools), so a gh-absent
// environment reports 'gh-absent' per-check rather than attempting an MCP
// fallback (see `_shared/integration-model.md`).
function reconcile(opts = {}) {
  const dryRun = !!opts.dryRun;
  const checks = Array.isArray(opts.checks) && opts.checks.length ? opts.checks : ALL_CHECKS;
  const cwd = opts.cwd || process.cwd();
  const result = { mirror: null, worktrees: null, claims: null, runs: null, skipped: [] };

  const root = mainCheckoutRoot(cwd);
  if (!root) {
    result.skipped.push({ check: 'all', reason: 'no-repo' });
    return result;
  }

  const model = resolveIntegrationModel(root);
  if (model !== 'pr-first') {
    result.skipped.push({ check: 'all', reason: 'local-merge-model' });
    return result;
  }

  const integration = resolveIntegrationBranch(root);
  if (!integration) {
    result.skipped.push({ check: 'all', reason: 'no-remote' });
    return result;
  }

  if (checks.includes('mirror')) {
    result.mirror = mirrorFastForward(root, integration);
  }

  if (checks.includes('reap')) {
    const r = reapMerged({ cwd: root, dryRun });
    if (r.failure) {
      result.skipped.push({ check: 'reap', reason: r.failure });
    } else {
      result.worktrees = r.reaped.map((p) => ({ path: p, action: 'reaped' }))
        .concat(r.skipped.map((s) => ({ path: s.path, action: 'skipped', reason: s.reason, prNumber: s.prNumber })));
    }
  }

  if (checks.includes('release')) {
    // Release performs one write kind (a conditional-overwrite of the claim
    // blob) with no meaningful "preview" — unlike ff/reap/archive, there is
    // no local state to diff against. dry-run skips it outright rather than
    // half-implementing a preview for a network write.
    if (dryRun) {
      result.skipped.push({ check: 'release', reason: 'dry-run-not-supported' });
    } else {
      const r = releaseMerged({ cwd: root });
      if (r.failure) {
        result.skipped.push({ check: 'release', reason: r.failure });
      } else {
        result.claims = r.released.map((c) => ({ ...c, action: 'released' }))
          .concat(r.skipped.map((s) => ({ ...s, action: 'skipped' })));
      }
    }
  }

  if (checks.includes('archive')) {
    const r = archiveMerged({ cwd: root, dryRun });
    result.runs = r.archived.map((d) => ({ runDir: d, action: 'archived' }))
      .concat(r.skipped.map((s) => ({ runDir: s.runDir, action: 'skipped', reason: s.reason })));
  }

  return result;
}

module.exports = { reconcile, ALL_CHECKS };
