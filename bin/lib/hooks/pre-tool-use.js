// bin/lib/hooks/pre-tool-use.js — E1: working-directory discipline (block tier).
// Denies ONLY on a provable mismatch. Ambiguity -> allow: a false-positive
// freeze in an unattended run is worse than a missed catch (E2 still records).
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');

function toplevel(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch { return null; }
}

function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

function run(ctx) {
  if (!ctx.runDir || !ctx.runState || !ctx.runState.worktree) return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  const command = ctx.input.tool_input && ctx.input.tool_input.command;
  if (typeof command !== 'string' || !command) return {};
  const assigned = safeReal(ctx.runState.worktree);
  if (!assigned) return {};
  for (const target of gitTargets(command, ctx.cwd)) {
    const top = toplevel(target.dir);
    if (!top) continue; // cannot prove the target -> allow
    const actual = safeReal(top);
    if (!actual || actual === assigned) continue;
    if (target.action === 'push') {
      ctxLib.appendEvent(ctx.runDir, 'wd-push-mismatch', { expected: assigned, actual, command: command.slice(0, 200) });
      continue;
    }
    ctxLib.appendEvent(ctx.runDir, 'wd-deny', { expected: assigned, actual, command: command.slice(0, 200) });
    return {
      exit: 0,
      json: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `claude-tweaks working-directory discipline: this run's assigned worktree is ${assigned} but the commit targets ${actual}. ` +
            `Re-run inside the worktree (cd "${assigned}") or use git -C "${assigned}". ` +
            'If this checkout is intentionally correct (e.g. finishing the branch), clear the assignment first: node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run',
        },
      },
    };
  }
  return {};
}

module.exports = { run };
