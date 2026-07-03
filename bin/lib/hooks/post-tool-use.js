// bin/lib/hooks/post-tool-use.js — E2: commit breadcrumbs (log tier).
'use strict';
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');

function shortHead(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch { return null; }
}

function run(ctx) {
  if (!ctx.runDir) return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  const command = ctx.input.tool_input && ctx.input.tool_input.command;
  if (typeof command !== 'string' || !command) return {};
  for (const target of gitTargets(command, ctx.cwd)) {
    ctxLib.appendEvent(ctx.runDir, 'commit', {
      action: target.action,
      dir: target.dir,
      hash: target.action === 'commit' ? shortHead(target.dir) : undefined,
    });
  }
  return {};
}

module.exports = { run };
