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
      // This stale-runs block running BEFORE the reaper block is load-bearing
      // ordering: the reaper removes merged worktrees, which breaks branch
      // derivation for the integrity check.
      const lines = stale.map(({ dir, state }) => {
        const base = `- ${path.basename(dir)} (status: ${(state && state.status) || 'unknown'})`;
        try {
          const verdict = runIntegrity.checkRunIntegrity(dir);
          if (verdict.state === 'shipped-unclosed') {
            // Evidence names what was checked so the reader can judge the claim.
            const how = verdict.evidence.merged === 'cherry' ? 'squash/rebase-equivalent' : 'merged';
            return (
              `${base} — work appears shipped (branch ${verdict.evidence.branch} ${how} into the integration branch, ` +
              'no wrap-up recorded): close out with /claude-tweaks:wrap-up, or bookkeeping-only: ' +
              `node "${process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}'}/bin/hooks.js" close-run --run ${dir}`
            );
          }
        } catch { /* integrity check is advisory — never break the scan */ }
        return base;
      });
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
      parts.push(
        'claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:\n' +
          lines.join('\n') +
          `\nReview {run}/decisions.md and staged/ to resume, or close a finished run with: node "${pluginRoot}/bin/hooks.js" close-run --run <dir>`,
      );
    }
  } catch { /* best-effort */ }
  try {
    // mainCheckoutRoot, not repoInfo().repoRoot: from inside a linked
    // worktree, repoInfo() resolves to that worktree's OWN toplevel, and its
    // HEAD is the very feature branch this session is standing on — comparing
    // siblings against that instead of the shared trunk is how a sibling
    // worktree gets reaped for matching this branch, not for being merged.
    // mainCheckoutRoot always resolves the one shared checkout regardless of
    // which worktree the session started in (same root reapWorktrees itself
    // computes internally), so policy lookup and the HEAD fallback below both
    // land on the real repository, not the caller's local vantage point.
    const repoRoot = wtDetect.mainCheckoutRoot(ctx.cwd);
    // The canonical ladder, via reaper.resolveIntegrationBranch — policy.yml's
    // `integration-branch:` then refs/remotes/origin/HEAD, and never the main
    // checkout's current branch (`_shared/integration-branch.md`'s own named
    // anti-pattern: a concurrent session switches it underfoot). Never hardcode
    // `main` either — this plugin runs against projects using a
    // dev -> staging -> main model, where main is the one branch nothing should
    // be measured against. Unresolved means reap nothing: this consumer's
    // recorded fallback in that fragment's per-consumer table.
    const integration = reaper.resolveIntegrationBranch(repoRoot);
    if (!integration) throw new Error('no integration branch');
    const { reaped, skipped, deferred } = reaper.reapWorktrees({ cwd: ctx.cwd, integration });
    // log tier (CLAUDE.md Hooks: block/warn/inform/log) — write to
    // ctx.ownedRun, NOT ctx.runDir. runDir is the enforcement-scoped "newest
    // non-terminal run regardless of owner"; ownedRun is the narrower run
    // this session may actually write to (#62). post-tool-use.js's E2
    // commit-breadcrumb block follows the identical pattern.
    const ownedRun = ctx.ownedRun || {};
    if (ownedRun.dir) {
      for (const p of reaped) {
        ctxLib.appendEvent(ownedRun.dir, 'worktree-reaped', { path: p, integration }, ownedRun.attribution);
      }
      for (const s of skipped) {
        ctxLib.appendEvent(ownedRun.dir, 'worktree-reap-skipped', { path: s.path, reason: s.reason, integration }, ownedRun.attribution);
      }
      // Candidates the per-run cap never examined. Without this the audit trail
      // cannot distinguish "nothing else to consider" from "stopped counting" —
      // a silent truncation reads as full coverage (CLAUDE.md: no silent caps).
      if (deferred) {
        ctxLib.appendEvent(ownedRun.dir, 'worktree-reap-deferred', { count: deferred, cap: reaper.MAX_EXAMINED_PER_RUN, integration }, ownedRun.attribution);
      }
    }
    if (reaped.length) {
      parts.push(
        `claude-tweaks: removed ${reaped.length} finished worktree(s) whose work is already in ${integration}:\n` +
          reaped.map((p) => `- ${path.basename(p)}`).join('\n'),
      );
    }
    // Reasons that describe the normal state of a healthy repo (a live
    // session's own worktree, the `.worktrees/` domain this reaper does not
    // own, a stale-pid lock still inside its grace period) are logged but not
    // reprinted on every session start — see QUIET_SKIP_REASONS.
    const notable = skipped.filter((s) => !reaper.QUIET_SKIP_REASONS.has(s.reason));
    if (notable.length) {
      parts.push(
        'claude-tweaks: worktree(s) left in place:\n' +
          notable.map((s) => `- ${path.basename(s.path)} — ${s.reason}`).join('\n'),
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
            '(policy: worktree.always in .claude-tweaks/policy.yml). Before making any edits, ' +
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
