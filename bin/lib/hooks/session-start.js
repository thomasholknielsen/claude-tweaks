// bin/lib/hooks/session-start.js — A1: deps check + stale pipeline-run
// detection + advisory nudge toward worktree setup when the project's
// policy requires it.
'use strict';
const path = require('path');
const deps = require('../deps');
const ctxLib = require('./context');
const policy = require('../policy');
const wtDetect = require('./worktree-detect');
const reaper = require('./worktree-reap');
const runIntegrity = require('./run-integrity');
const { reconcile } = require('../reconcile');

const MAX_REPORTED = 3;

function run(ctx) {
  const parts = [];
  try { parts.push(...deps.collect()); } catch { /* best-effort */ }
  try {
    // Only the newest MAX_REPORTED entries are ever shown — pull from the
    // lazy iterator and stop early instead of materializing (and reading
    // run-state.json for) every non-clean run dir under pipelines/, most of
    // which would just be sliced off and discarded.
    const stale = [];
    for (const entry of ctxLib.iterRunDirsWithState(ctx.cwd)) {
      stale.push(entry);
      if (stale.length >= MAX_REPORTED) break;
    }
    if (stale.length) {
      // Hoisted once and reused below — this expression was previously
      // computed twice (once per stale entry inside the .map, once here),
      // and each copy could only drift from the other.
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
      // This stale-runs block running BEFORE the reaper block is load-bearing
      // ordering: the reaper removes merged worktrees, which breaks branch
      // derivation for the integrity check.
      const lines = stale.map(({ dir, state }) => {
        // #410: read-only — the URL run-state.json already recorded, never a
        // fresh gh call from this hot path. Absent for local-merge runs and
        // any pr-first run whose run-start push/create degraded.
        const prSuffix = state && state.pr && state.pr.url ? ` — PR ${state.pr.url}` : '';
        const base = `- ${path.basename(dir)} (status: ${(state && state.status) || 'unknown'})${prSuffix}`;
        try {
          const verdict = runIntegrity.checkRunIntegrity(dir);
          if (verdict.state === 'shipped-unclosed') {
            // Evidence names what was checked so the reader can judge the claim.
            const how = verdict.evidence.merged === 'cherry' ? 'squash/rebase-equivalent' : 'merged';
            return (
              `${base} — work appears shipped (branch ${verdict.evidence.branch} ${how} into the integration branch, ` +
              'no wrap-up recorded): close out with /claude-tweaks:wrap-up, or bookkeeping-only: ' +
              `node "${pluginRoot}/bin/hooks.js" close-run --run "${dir}"`
            );
          }
        } catch { /* integrity check is advisory — never break the scan */ }
        return base;
      });
      parts.push(
        'claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:\n' +
          lines.join('\n') +
          `\nReview {run}/decisions.md and staged/ to resume, or close a finished run with: node "${pluginRoot}/bin/hooks.js" close-run --run <dir>`,
      );
    }
  } catch { /* best-effort */ }
  try {
    // reconcile() resolves the shared main checkout internally the same way
    // the pre-#408 direct reaper.reapWorktrees call did (mainCheckoutRoot,
    // never repoInfo().repoRoot — see `_shared/integration-branch.md`'s named
    // anti-pattern for why a linked worktree's own HEAD must never stand in
    // for the shared trunk). Under pr-first this replaces the old block with
    // mirror-ff + release + archive + reap, in that order — reap dispatches
    // last inside the module precisely so a just-reaped worktree can't starve
    // release/archive's own branch derivation (the ordering hazard this
    // block used to guard by hand, now the module's own contract, asserted
    // by `tests/reconcile.test.js`'s dispatch-order pin rather than a comment
    // here). Under local-merge, the module falls back to the same
    // ancestry-based reap this block always ran, so a project that has not
    // opted into pr-first sees no behavior change.
    const result = reconcile({ cwd: ctx.cwd });
    const reaped = (result.worktrees || []).filter((w) => w.action === 'reaped').map((w) => w.path);
    const skippedWorktrees = (result.worktrees || []).filter((w) => w.action === 'skipped');

    // log tier (CLAUDE.md Hooks: block/warn/inform/log) — write to
    // ctx.ownedRun, NOT ctx.runDir. runDir is the enforcement-scoped "newest
    // non-terminal run regardless of owner"; ownedRun is the narrower run
    // this session may actually write to (#62). post-tool-use.js's E2
    // commit-breadcrumb block follows the identical pattern.
    const ownedRun = ctx.ownedRun || {};
    if (ownedRun.dir) {
      for (const p of reaped) {
        ctxLib.appendEvent(ownedRun.dir, 'worktree-reaped', { path: p }, ownedRun.attribution);
      }
      for (const s of skippedWorktrees) {
        ctxLib.appendEvent(ownedRun.dir, 'worktree-reap-skipped', { path: s.path, reason: s.reason }, ownedRun.attribution);
      }
      // Candidates the per-run cap never examined (local-merge fallback
      // only — the pr-first reap check has no such cap). Without this the
      // audit trail cannot distinguish "nothing else to consider" from
      // "stopped counting" — a silent truncation reads as full coverage
      // (CLAUDE.md: no silent caps).
      const deferredEntry = (result.skipped || []).find((s) => s.check === 'reap' && s.reason === 'deferred');
      if (deferredEntry) {
        ctxLib.appendEvent(ownedRun.dir, 'worktree-reap-deferred', { count: deferredEntry.count, cap: reaper.MAX_EXAMINED_PER_RUN }, ownedRun.attribution);
      }
    }
    if (reaped.length) {
      parts.push(
        `claude-tweaks: removed ${reaped.length} finished worktree(s) whose work is already merged:\n` +
          reaped.map((p) => `- ${path.basename(p)}`).join('\n'),
      );
    }
    // Reasons that describe the normal state of a healthy repo (a live
    // session's own worktree, the `.worktrees/` domain this reaper does not
    // own, a stale-pid lock still inside its grace period) are logged but not
    // reprinted on every session start — see QUIET_SKIP_REASONS.
    const notableWorktrees = skippedWorktrees.filter((s) => !reaper.QUIET_SKIP_REASONS.has(s.reason));
    if (notableWorktrees.length) {
      parts.push(
        'claude-tweaks: worktree(s) left in place:\n' +
          notableWorktrees.map((s) => `- ${path.basename(s.path)} — ${s.reason}`).join('\n'),
      );
    }

    // One added summary line for what reconcile() did beyond reap — mirror
    // ff, claim releases, run-dir archival. An addition within the existing
    // additionalContext shape, not a reshape: silent when nothing changed.
    const summary = [];
    if (result.mirror && result.mirror.action === 'fast-forwarded') {
      summary.push('integration branch fast-forwarded to origin');
    }
    const released = (result.claims || []).filter((c) => c.action === 'released');
    if (released.length) summary.push(`${released.length} issue claim(s) released`);
    const archived = (result.runs || []).filter((r) => r.action === 'archived');
    if (archived.length) summary.push(`${archived.length} pipeline run(s) archived`);
    const archivedBranches = (result.branches || []).filter((b) => b.kind === 'branch' && (b.action === 'delete' || b.action === 'tag-and-delete'));
    if (archivedBranches.length) summary.push(`${archivedBranches.length} local branch(es) archived/deleted`);
    const prunedRemote = (result.remoteBranches || []).filter((b) => b.action === 'delete');
    if (prunedRemote.length) summary.push(`${prunedRemote.length} merged remote branch(es) deleted on origin`);
    if (summary.length) {
      parts.push(`claude-tweaks: reconciled — ${summary.join('; ')}.`);
    }
    // #561: an unconditional, inform-tier line when reconcile() detected a
    // failing CI conclusion on the integration branch's tip — the only
    // coverage for direct pushes (fast-lane commits, bookkeeping, releases)
    // that no merge gate ever sees. Not gated on any policy value; silent
    // when result.redTip is null (green, pending, no CI, gh absent, or any
    // API error — red-tip.js's own degrade posture).
    if (result.redTip) {
      parts.push(`claude-tweaks: ${result.redTip.message}`);
    }
    // #413: a console whose "Resolve console" box is already ticked on the
    // PR is answered-but-unexecuted work — surface it the same way an
    // unfinished pipeline run is surfaced above, pointing at the procedure
    // (`_shared/console-execution.md`) rather than executing here: several
    // item kinds are judgment-bearing and only an agent session can run
    // them (see that file's header).
    const readyConsoles = (result.console && result.console.ready) || [];
    if (readyConsoles.length) {
      parts.push(
        `claude-tweaks: ${readyConsoles.length} answered console(s) awaiting execution:\n` +
          readyConsoles.map((c) => `- ${path.basename(c.runDir)} — PR #${c.prNumber}`).join('\n') +
          '\nRead skills/_shared/console-execution.md and execute per its Execution routing.',
      );
    }
  } catch { /* best-effort */ }
  try {
    // Cheap fs-only pre-check: if no policy.yml exists anywhere in the
    // ancestor chain, there is definitely nothing to enforce — skip forking
    // git entirely for the overwhelming majority of projects that never opt
    // into this policy. Same fast-reject pre-tool-use.js's own copy of this
    // check already applies for the same reason; this file's copy
    // previously forked git on every single SessionStart regardless.
    if (wtDetect.findPolicyFile(ctx.cwd)) {
      const { repoRoot, isLinkedWorktree } = wtDetect.repoInfo(ctx.cwd);
      if (repoRoot && policy.isWorktreeAlwaysOn(repoRoot) && !isLinkedWorktree) {
        parts.push(
          'claude-tweaks: this project requires an isolated worktree for all work ' +
            '(policy: worktree-always in .claude-tweaks/policy.yml). Before making any edits, ' +
            'invoke /superpowers:using-git-worktrees to set one up, then follow ' +
            "`_shared/worktree-setup.md`'s post-creation catch-up before any other action.",
        );
      }
    }
  } catch { /* best-effort */ }
  if (!parts.length) return {};
  return { json: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } } };
}

module.exports = { run };
