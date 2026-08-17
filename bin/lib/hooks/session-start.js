// bin/lib/hooks/session-start.js — A1: deps check + stale pipeline-run
// detection + advisory nudge toward worktree setup when the project's
// policy requires it.
'use strict';
const fs = require('fs');
const path = require('path');
const deps = require('../deps');
const ctxLib = require('./context');
const policy = require('../policy');
const wtDetect = require('./worktree-detect');
const runIntegrity = require('./run-integrity');
const { reconcile } = require('../reconcile');

const MAX_REPORTED = 3;
// The fast/background split (#820, D8, corrected): SessionStart's own
// process runs only the cheap read/detect checks inline — everything
// write-only and janitorial (release/archive/archive-branches/remote-prune/
// reap) is deferred to a detached `reconcile-background` child process (see
// bin/hooks.js's `reconcile-background` subcommand), whose result is
// surfaced on a LATER SessionStart firing via the status-file read below.
// This corrects the original issue's premise (hooks.json's `async: true`
// discards a hook's stdout/JSON output entirely — unusable for a check
// whose whole point is to report what it did).
const FAST_CHECKS = ['mirror', 'red-tip', 'console'];

async function run(ctx) {
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
    // for the shared trunk). FAST_CHECKS restricts this inline call to the
    // cheap read/detect checks only (mirror, red-tip, console) — the
    // write-only janitorial checks (release/archive/archive-branches/
    // remote-prune/reap) run in a detached background process instead (see
    // the spawn block below), and their results are surfaced on a LATER
    // SessionStart firing via the status-file read below, not here (#820,
    // D8, corrected).
    const result = await reconcile({ cwd: ctx.cwd, checks: FAST_CHECKS });

    // One added summary line for what the fast path did — today just mirror
    // ff, the only FAST_CHECKS member that ever populates it. The write-only
    // checks that used to contribute to this same line (claim releases,
    // run-dir archival, branch/remote-branch pruning) moved to the
    // background pass and are surfaced separately below.
    const summary = [];
    if (result.mirror && result.mirror.action === 'fast-forwarded') {
      summary.push('integration branch fast-forwarded to origin');
    }
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
    // Surface a PRIOR session's background reconcile pass exactly once
    // (#820, D8). The background pass (bin/hooks.js's `reconcile-background`
    // subcommand, spawned below) writes its outcome to a status file with no
    // reader of its own — this is that reader. `surfaced` flips to true the
    // first time a SessionStart firing reports it, so a summary from three
    // sessions ago doesn't reappear on every subsequent session start.
    const root = wtDetect.mainCheckoutRoot(ctx.cwd);
    if (root) {
      const statusPath = path.join(root, '.claude-tweaks', 'reconcile-background-status.json');
      let status = null;
      try { status = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch { /* none yet */ }
      if (status && status.surfaced === false) {
        const s = status.summary || {};
        const lines = [];
        if (s.reaped) lines.push(`${s.reaped} finished worktree(s) removed (already merged)`);
        if (s.released) lines.push(`${s.released} issue claim(s) released`);
        if (s.archived) lines.push(`${s.archived} pipeline run(s) archived`);
        if (s.archivedBranches) lines.push(`${s.archivedBranches} local branch(es) archived/deleted`);
        if (s.prunedRemote) lines.push(`${s.prunedRemote} merged remote branch(es) deleted on origin`);
        if (lines.length) {
          parts.push(`claude-tweaks: background reconcile (from a prior session) — ${lines.join('; ')}.`);
        }
        try {
          fs.writeFileSync(statusPath, JSON.stringify({ ...status, surfaced: true }));
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }
  try {
    // Spawn the detached background pass — TTL-gated by the same
    // skipIfFresh cache (bin/lib/reconcile/cache.js, Task 6/9) reconcile()
    // itself uses, so near-simultaneous session starts don't each spawn a
    // redundant background process. `detached: true` + `stdio: 'ignore'` +
    // `child.unref()` together let this process exit without waiting on the
    // child, and without the child dying alongside it.
    const { spawn } = require('child_process');
    const { readCache, isFresh } = require('../reconcile/cache');
    const root = wtDetect.mainCheckoutRoot(ctx.cwd);
    if (root) {
      const cache = readCache(root);
      if (!isFresh(cache, Date.now())) {
        const child = spawn(
          process.execPath,
          [path.join(__dirname, '..', '..', 'hooks.js'), 'reconcile-background'],
          { cwd: ctx.cwd, detached: true, stdio: 'ignore' },
        );
        child.unref();
      }
    }
  } catch { /* best-effort — a failed spawn just means this session's background pass didn't fire; the next one tries again */ }
  try {
    // Cheap fs-only pre-check: if no policy.yml exists anywhere in the
    // ancestor chain, there is definitely nothing to enforce — skip forking
    // git entirely for the overwhelming majority of projects that never opt
    // into this policy. Same fast-reject pre-tool-use.js's own copy of this
    // check already applies for the same reason; this file's copy
    // previously forked git on every single SessionStart regardless.
    if (wtDetect.findPolicyFile(ctx.cwd)) {
      const { repoRoot, isLinkedWorktree } = wtDetect.repoInfo(ctx.cwd);
      if (repoRoot) {
        const { on, matchedKey } = policy.resolveWorktreeAlways(repoRoot);
        parts.push(
          `claude-tweaks: worktree-always: ${on ? 'ON' : 'OFF'} (${matchedKey ? `matched key: ${matchedKey}` : 'no key'})`,
        );
        if (on && !isLinkedWorktree) {
          parts.push(
            'claude-tweaks: this project requires an isolated worktree for all work ' +
              '(policy: worktree-always in .claude-tweaks/policy.yml). Before making any edits, ' +
              'invoke /superpowers:using-git-worktrees to set one up, then follow ' +
              "`_shared/worktree-setup.md`'s post-creation catch-up before any other action.",
          );
        }
      }
    }
  } catch { /* best-effort */ }
  if (!parts.length) return {};
  return { json: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } } };
}

module.exports = { run };
