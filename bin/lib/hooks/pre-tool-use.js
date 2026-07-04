// bin/lib/hooks/pre-tool-use.js — E1: working-directory discipline (block tier).
// Denies ONLY on a provable mismatch. Ambiguity -> allow: a false-positive
// freeze in an unattended run is worse than a missed catch (E2 still records).
// "Provable" includes ownership: a deny requires the commit to come from the
// session that recorded the worktree (or identity to be unavailable on either
// side, which preserves the pre-stamp behavior). A commit from a DIFFERENT
// session — e.g. unrelated fix work in the main checkout while a pipeline runs
// elsewhere — is not provably this run's work: allow, warn, log.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
}

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
  if (ctx.runState.status === 'clean') return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  const command = ctx.input.tool_input && ctx.input.tool_input.command;
  if (typeof command !== 'string' || !command) return {};
  const assigned = safeReal(ctx.runState.worktree);
  if (!assigned) return {};

  // Multi-run project: the fallback resolver in bin/hooks.js always picks the
  // newest non-terminal run, so a terminal committing in its OWN assigned
  // worktree can land here with ctx.runDir pointing at a DIFFERENT (newer)
  // run. Build the full set of live worktrees (this run's plus every other
  // non-terminal run's) so such a commit is allowed rather than false-denied.
  const otherWorktrees = new Map(); // realpath (excluding this run's own) -> run dir
  for (const dir of ctxLib.listRunDirs(ctx.cwd)) {
    const state = ctxLib.readRunState(dir);
    if (!state || !state.worktree) continue;
    const real = safeReal(state.worktree);
    if (!real || real === assigned) continue;
    if (!otherWorktrees.has(real)) otherWorktrees.set(real, dir);
  }

  for (const target of gitTargets(command, ctx.cwd)) {
    const top = toplevel(target.dir);
    if (!top) continue; // cannot prove the target -> allow
    const actual = safeReal(top);
    if (!actual) continue;
    if (actual === assigned) continue;
    if (otherWorktrees.has(actual)) {
      // Matches a DIFFERENT live run's worktree -> allow, but a commit isn't
      // provably in the run this hook resolved, so flag it for review.
      if (target.action !== 'push') {
        ctxLib.appendEvent(ctx.runDir, 'wd-ambiguous', { matched: actual });
      }
      continue;
    }
    if (target.action === 'push') {
      ctxLib.appendEvent(ctx.runDir, 'wd-push-mismatch', { expected: assigned, actual, command: command.slice(0, 200) });
      continue;
    }
    const owner = typeof ctx.runState.sessionId === 'string' ? ctx.runState.sessionId : '';
    const caller = typeof ctx.input.session_id === 'string' ? ctx.input.session_id : '';
    if (owner && caller && owner !== caller) {
      ctxLib.appendEvent(ctx.runDir, 'wd-foreign-session', { expected: assigned, actual, owner, caller, command: command.slice(0, 200) });
      return {
        exit: 0,
        json: {
          systemMessage:
            `claude-tweaks: pipeline run ${path.basename(ctx.runDir)} is active in worktree ${assigned}; ` +
            `allowing this commit because it comes from a different session. ` +
            `If this IS that pipeline's work, run it inside the worktree (git -C "${assigned}").`,
        },
      };
    }
    ctxLib.appendEvent(ctx.runDir, 'wd-deny', { expected: assigned, actual, session: caller || undefined, command: command.slice(0, 200) });
    const others = [...otherWorktrees.keys()];
    const othersNote = others.length ? ` Other active runs' worktrees: ${others.join(', ')}.` : '';
    return {
      exit: 0,
      json: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `claude-tweaks working-directory discipline: this run's assigned worktree is ${assigned} but the commit targets ${actual}.` +
            othersNote +
            ` Re-run inside the worktree (cd "${assigned}") or use git -C "${assigned}". ` +
            `If this checkout is intentionally correct (e.g. finishing the branch), clear the assignment first: node "${pluginRoot()}/bin/hooks.js" close-run`,
        },
      },
    };
  }
  return {};
}

module.exports = { run };
