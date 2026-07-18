// bin/lib/hooks/session-start.js — A1: deps check + stale pipeline-run
// detection + advisory nudge toward worktree setup when the project's
// policy requires it.
'use strict';
const path = require('path');
const deps = require('../deps');
const ctxLib = require('./context');
const policy = require('../policy');
const wtDetect = require('./worktree-detect');

const MAX_REPORTED = 3;

function run(ctx) {
  const parts = [];
  try { parts.push(...deps.collect()); } catch { /* best-effort */ }
  try {
    const stale = ctxLib.listRunDirsWithState(ctx.cwd).slice(0, MAX_REPORTED);
    if (stale.length) {
      const lines = stale.map(({ dir, state }) => `- ${path.basename(dir)} (status: ${(state && state.status) || 'unknown'})`);
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
      parts.push(
        'claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:\n' +
          lines.join('\n') +
          `\nReview {run}/decisions.md and staged/ to resume, or close a finished run with: node "${pluginRoot}/bin/hooks.js" close-run --run <dir>`,
      );
    }
  } catch { /* best-effort */ }
  try {
    const { repoRoot, isLinkedWorktree } = wtDetect.repoInfo(ctx.cwd);
    if (repoRoot && policy.isWorktreeAlwaysOn(repoRoot) && !isLinkedWorktree) {
      parts.push(
        'claude-tweaks: this project requires an isolated worktree for all work ' +
          '(policy: worktree.always in .claude-tweaks/policy.yml). Before making any edits, ' +
          'invoke /superpowers:using-git-worktrees to set one up.',
      );
    }
  } catch { /* best-effort */ }
  if (!parts.length) return {};
  return { json: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } } };
}

module.exports = { run };
