// bin/lib/hooks/session-start.js — A1: deps check + stale pipeline-run detection.
'use strict';
const path = require('path');
const deps = require('../deps');
const ctxLib = require('./context');

const MAX_REPORTED = 3;

function run(ctx) {
  const parts = [];
  try { parts.push(...deps.collect()); } catch { /* best-effort */ }
  try {
    const stale = ctxLib.listRunDirs(ctx.cwd).slice(0, MAX_REPORTED);
    if (stale.length) {
      const lines = stale.map((d) => {
        const s = ctxLib.readRunState(d);
        return `- ${path.basename(d)} (status: ${(s && s.status) || 'unknown'})`;
      });
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
      parts.push(
        'claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:\n' +
          lines.join('\n') +
          `\nReview {run}/decisions.md and staged/ to resume, or close a finished run with: node "${pluginRoot}/bin/hooks.js" close-run --run <dir>`,
      );
    }
  } catch { /* best-effort */ }
  if (!parts.length) return {};
  return { json: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } } };
}

module.exports = { run };
