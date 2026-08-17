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
const { resolveIntegrationBranch, reapWorktrees: legacyReapWorktrees } = require('../hooks/worktree-reap');
const { resolveIntegrationModel } = require('../policy-schema');
const { mirrorFastForward } = require('./mirror-ff');
const { redTipCheck } = require('./red-tip');
const { reapMerged } = require('./reap-merged');
const { releaseMerged } = require('./release-merged');
const { archiveMerged } = require('./archive-merged');
const { archiveBranches } = require('./archive-branches');
const { pruneRemote } = require('./prune-remote');
const { consoleExecuteDetect } = require('./console-execute');
const { sharedFetch } = require('./shared-fetch');

// Execution order (mirror, red-tip, console, release, archive,
// archive-branches, remote-prune, reap) is significant — see the ordering
// comment above the release/archive/archive-branches/reap dispatch below.
// red-tip runs immediately after mirror specifically so it reads the ref
// mirror-ff.js's own fetch just refreshed, rather than fetching a second
// time (#561). This array is the requested-subset default only; it is never
// iterated to determine dispatch order.
const ALL_CHECKS = ['mirror', 'red-tip', 'reap', 'release', 'archive', 'archive-branches', 'remote-prune', 'console'];

// opts: { dryRun?: boolean, checks?: string[], cwd?: string }
// -> { mirror, worktrees, claims, runs, branches, console, skipped }
// This module is gh-CLI-only by design (a Node subprocess cannot reach an
// agent session's MCP tools), so a gh-absent environment reports that reason
// per-check rather than attempting an MCP fallback (see
// `_shared/integration-model.md`).
async function reconcile(opts = {}) {
  const dryRun = !!opts.dryRun;
  const checks = Array.isArray(opts.checks) && opts.checks.length ? opts.checks : ALL_CHECKS;
  const cwd = opts.cwd || process.cwd();
  const result = { mirror: null, redTip: null, worktrees: null, claims: null, runs: null, branches: null, remoteBranches: null, console: null, skipped: [] };

  const root = mainCheckoutRoot(cwd);
  if (!root) {
    result.skipped.push({ check: 'all', reason: 'no-repo' });
    return result;
  }

  const integration = resolveIntegrationBranch(root);
  if (!integration) {
    result.skipped.push({ check: 'all', reason: 'no-remote' });
    return result;
  }

  const model = resolveIntegrationModel(root);
  if (model !== 'pr-first') {
    // local-merge / no-forge: only `reap` has a defined fallback here — the
    // long-standing content-identical ancestry check worktree-reap.js has
    // always run (#407's Non-Goals: no local-merge behavior change). mirror
    // (nothing to fast-forward toward — there is no PR-lifecycle mirror
    // under this model), release, and archive have no local-merge
    // equivalent and stay skipped.
    if (checks.includes('reap')) {
      const legacy = legacyReapWorktrees({ cwd: root, integration, dryRun, now: opts.now });
      result.worktrees = legacy.reaped.map((p) => ({ path: p, action: 'reaped' }))
        .concat(legacy.skipped.map((s) => ({ path: s.path, action: 'skipped', reason: s.reason })));
      // MAX_EXAMINED_PER_RUN candidates the legacy reaper never got to this
      // pass — never drop this silently (CLAUDE.md: no silent caps). No
      // per-worktree path to attach it to, so it lands as its own skipped
      // entry with a count rather than one of the per-path ones above.
      if (legacy.deferred) {
        result.skipped.push({ check: 'reap', reason: 'deferred', count: legacy.deferred });
      }
    }
    result.skipped.push({ check: 'mirror,release,archive,archive-branches,remote-prune,console', reason: 'local-merge-model' });
    return result;
  }

  // GitHub-health preflight — every check below this point is network-
  // dependent under pr-first (mirror/red-tip/console/release/remote-prune
  // hit GitHub directly; archive/archive-branches/reap all call
  // resolvePrState, also a gh call) — so a single upfront failure/timeout
  // (~2s) skips the whole requested set in one entry, instead of each check
  // separately accumulating its own 5-10s timeout (#820). Called via
  // require(...).ghHealthCheck() rather than a module-load-time destructure
  // so a test's `require('./preflight').ghHealthCheck = fn` monkeypatch
  // actually reaches this call site.
  const health = require('./preflight').ghHealthCheck();
  if (!health.ok) {
    result.skipped.push({ check: checks.join(','), reason: `preflight-${health.reason}` });
    return result;
  }

  // Overall wall-clock ceiling for the rest of this pass (#820, D4) — bounds
  // the SUM of every dispatched check's time, not any single check's own
  // timeout. Created once here via require(...).createBudget() rather than a
  // module-load-time destructure, so a test's
  // `require('./budget').createBudget = fn` monkeypatch reaches this call
  // site. Checked before each of the 8 dispatch blocks below, in dispatch
  // order; each guard's slice is "every requested check from here on",
  // so a budget exhausted mid-pass reports the whole remainder in one
  // `skipped` entry and returns immediately rather than running a partial
  // remainder.
  const budget = require('./budget').createBudget();
  const DISPATCH_ORDER = ['mirror', 'red-tip', 'console', 'release', 'archive', 'archive-branches', 'remote-prune', 'reap'];
  function overBudget(remainingFromHere) {
    if (!budget.exceeded()) return false;
    const notYetRun = remainingFromHere.filter((c) => checks.includes(c));
    if (notYetRun.length) result.skipped.push({ check: notYetRun.join(','), reason: 'budget-exceeded' });
    return true;
  }

  if (overBudget(DISPATCH_ORDER.slice(0))) return result;
  // One shared `git fetch --prune origin` for whichever of mirror/red-tip/
  // remote-prune are requested — mirror (via classify.js) and remote-prune
  // previously each ran their own separate fetch, two full round trips to
  // the same remote per pass (#820, D2). `sharedFetchOk` gates all three
  // dispatch blocks below: red-tip is included even though it triggers no
  // fetch itself, because it reads the ref this fetch (formerly mirror's
  // own) just refreshed — see the ordering comment on red-tip's dispatch
  // below. A failed fetch is recorded once here rather than once per check.
  let sharedFetchOk = true;
  if (checks.includes('mirror') || checks.includes('remote-prune')) {
    const fetched = sharedFetch(root);
    if (fetched.failure) {
      sharedFetchOk = false;
      const affected = ['mirror', 'red-tip', 'remote-prune'].filter((c) => checks.includes(c));
      if (affected.length) result.skipped.push({ check: affected.join(','), reason: 'fetch-failed' });
    }
  }
  if (checks.includes('mirror') && sharedFetchOk) {
    result.mirror = mirrorFastForward(root, integration, { skipFetch: true });
  }

  // Detection only — never mutates repo/run state. Reads origin/{integration}
  // via the shared fetch above (formerly mirror-ff.js's own fetch) —
  // deliberately no fetch of its own (#561). Placed immediately after mirror
  // for that reason; unconditional under pr-first, no local-merge equivalent
  // (the model !== 'pr-first' early-return above already exits before this
  // line). Gated on `sharedFetchOk` too: a failed shared fetch leaves
  // origin/{integration} exactly as stale as a failed mirror fetch used to,
  // so red-tip has nothing fresh to read either.
  if (overBudget(DISPATCH_ORDER.slice(1))) return result;
  if (checks.includes('red-tip') && sharedFetchOk) {
    result.redTip = redTipCheck(root, integration, {
      onSkip: (reason) => result.skipped.push({ check: 'red-tip', reason }),
    });
  }

  // Detection only — never mutates repo/run state, so its position relative
  // to release/archive/reap's own ordering constraints (below) is
  // unconstrained. Placed here, right after mirror, since it needs neither a
  // worktree-list join nor merged-PR evidence, unlike the three that follow.
  if (overBudget(DISPATCH_ORDER.slice(2))) return result;
  if (checks.includes('console')) {
    result.console = consoleExecuteDetect({ cwd: root });
  }

  // Ordering is load-bearing, not incidental: release, archive, and
  // archive-branches all derive a run's branch from a live `git worktree
  // list` (matched by the worktree path run-state.json recorded, or, for
  // archive-branches, by branch attachment directly). `reap` PHYSICALLY
  // REMOVES worktrees — running it first would make every subsequent
  // check's branch derivation fail for exactly the runs `reap` just
  // finished with, silently starving `release`/`archive`/`archive-branches`
  // of the runs most likely to qualify (a just-reaped worktree's PR is, by
  // construction, merged — the same evidence those checks are looking
  // for). `reap` runs LAST among the five for this reason — the same class
  // of hazard `bin/lib/hooks/session-start.js` already documents for its
  // own stale-run-scan-before-reap ordering.
  if (overBudget(DISPATCH_ORDER.slice(3))) return result;
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

  if (overBudget(DISPATCH_ORDER.slice(4))) return result;
  if (checks.includes('archive')) {
    const r = archiveMerged({ cwd: root, dryRun });
    result.runs = r.archived.map((d) => ({ runDir: d, action: 'archived' }))
      .concat(r.skipped.map((s) => ({ runDir: s.runDir, action: 'skipped', reason: s.reason })));
  }

  // Same live-ref dependency as release/archive: derives branch state from
  // refs reap may remove. Runs after archive (run-dir archival may release
  // branch attachments), before reap (which stays last — see above).
  if (overBudget(DISPATCH_ORDER.slice(5))) return result;
  if (checks.includes('archive-branches')) {
    const r = archiveBranches({ cwd: root, integration, dryRun });
    if (r.failure) {
      result.skipped.push({ check: 'archive-branches', reason: r.failure });
    } else {
      result.branches = r.entries;
    }
  }

  // The family's one pushed mutation (see prune-remote.js's header for the
  // two-signal evidence bar). Same live-ref dependency as archive-branches:
  // the worktree-attachment guard must read worktrees reap has not yet
  // removed, so this too runs before reap (which stays last — see above).
  if (overBudget(DISPATCH_ORDER.slice(6))) return result;
  if (checks.includes('remote-prune') && sharedFetchOk) {
    const r = pruneRemote({ cwd: root, integration, dryRun, skipFetch: true });
    if (r.failure) {
      result.skipped.push({ check: 'remote-prune', reason: r.failure });
    } else {
      result.remoteBranches = r.entries;
    }
  }

  if (overBudget(DISPATCH_ORDER.slice(7))) return result;
  if (checks.includes('reap')) {
    const r = reapMerged({ cwd: root, dryRun });
    if (r.failure) {
      result.skipped.push({ check: 'reap', reason: r.failure });
    } else {
      result.worktrees = r.reaped.map((p) => ({ path: p, action: 'reaped' }))
        .concat(r.skipped.map((s) => ({ path: s.path, action: 'skipped', reason: s.reason, prNumber: s.prNumber })));
    }
  }

  return result;
}

module.exports = { reconcile, ALL_CHECKS };
