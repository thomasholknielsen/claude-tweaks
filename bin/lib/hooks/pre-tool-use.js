// bin/lib/hooks/pre-tool-use.js — E1: working-directory discipline (block tier)
// + the worktree-required policy gate (run-independent; see below).
// Denies ONLY on a provable mismatch. Ambiguity -> allow: a false-positive
// freeze in an unattended run is worse than a missed catch (E2 still records).
// "Provable" includes ownership: a deny requires the commit to come from the
// session that recorded the worktree (or identity to be unavailable on either
// side, which preserves the pre-stamp behavior). A commit from a DIFFERENT
// session — e.g. unrelated fix work in the main checkout while a pipeline runs
// elsewhere — is not provably this run's work: allow, warn, log.
//
// Deny signal: every return below — including a deny — sets `exit: 0`. A
// PreToolUse deny is communicated entirely via `hookSpecificOutput.
// permissionDecision: 'deny'` on stdout, not via the process exit code; exit
// 2 is a separate, cruder mechanism (Claude Code reads only stderr for the
// block reason and does not also parse stdout JSON), which would silently
// drop the custom permissionDecisionReason built below. This has been the
// behavior since this file's first commit (362e209). Do not "fix" this by
// setting a non-zero exit on deny — CLAUDE.md and bin/hooks.js's header
// comment both now correctly describe this (exit is always 0; the deny
// signal lives only in the stdout JSON) after correcting an earlier version
// of both that claimed "the only deliberate non-zero outcome is the
// pre-tool-use deny," which never actually matched this module's real
// contract.
'use strict';
const fs = require('fs');
const path = require('path');
const { gitTargets, fileWriteTargets } = require('./git-command');
const ctxLib = require('./context');
const policy = require('../policy');
const wtDetect = require('./worktree-detect');
const { execGit } = require('./git-exec');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
}

function toplevel(dir) {
  return execGit(['rev-parse', '--show-toplevel'], dir);
}

function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

// worktree-required policy gate: unlike E1 below, this needs no pipeline run
// state at all — it fires on the first Edit/Write/NotebookEdit/commit of a
// session, before any skill has ever run, whenever the target repo has opted
// into `worktree.always: true` in its .claude-tweaks/policy.yml.
//
// `precomputedGitTargets` (Bash calls only) lets run() share the one
// gitTargets() parse of the command with its own later E1 loop instead of
// re-running git-command.js's quote-aware segment/token walk a second time
// over the same string.
function checkWorktreeRequired(ctx, precomputedGitTargets) {
  const toolName = ctx.input && ctx.input.tool_name;
  const toolInput = ctx.input && ctx.input.tool_input;
  let targetPaths = [];

  // Keep this tool list in sync with the Edit/Write/NotebookEdit matchers in
  // hooks/hooks.json — a new file-mutation tool must be added to both or it
  // silently bypasses this gate.
  if (toolName === 'Edit' || toolName === 'Write') {
    if (toolInput && typeof toolInput.file_path === 'string') targetPaths = [toolInput.file_path];
  } else if (toolName === 'NotebookEdit') {
    if (toolInput && typeof toolInput.notebook_path === 'string') targetPaths = [toolInput.notebook_path];
  } else if (toolName === 'Bash') {
    const command = toolInput && typeof toolInput.command === 'string' ? toolInput.command : null;
    if (command) {
      // Both commit AND push are covered by this policy (see the deny
      // message below and CLAUDE.md's Hooks section) — gitTargets already
      // detects both actions, so don't narrow to 'commit' only, or a bare
      // `git push` from a non-isolated checkout silently bypasses the gate.
      // Check EVERY target the command contains, not just the first — a
      // single compound Bash call can chain multiple independent
      // git/write targets (e.g. `git -C $A commit ... && git -C $B commit
      // ...`, or a git commit alongside a separate cp/mv/tee write), and
      // each one is checked on its own below: a violation later in the
      // chain must not be masked by an earlier, compliant target.
      const targets = precomputedGitTargets || gitTargets(command, ctx.cwd);
      const gitTargetPaths = targets.filter((t) => t.action === 'commit' || t.action === 'push').map((t) => t.dir);
      // Non-git direct file writes (tee, cp, mv) — best-effort,
      // not exhaustive (see fileWriteTargets' own header comment).
      const writeTargetPaths = fileWriteTargets(command, ctx.cwd).map((t) => t.file);
      targetPaths = [...gitTargetPaths, ...writeTargetPaths];
    }
  }
  if (!targetPaths.length) return {};

  for (const targetPath of targetPaths) {
    // Cheap fs-only pre-check: if no policy.yml exists anywhere in the
    // ancestor chain, there is definitely nothing to enforce for THIS
    // target — skip forking git entirely for the overwhelming majority of
    // projects that never opt into this policy. This is a fast-reject
    // filter ONLY: once it finds a policy file somewhere, the actual
    // enforcement check below still re-scopes to the target's own git repo
    // root, since a policy file belonging to an unrelated ANCESTOR
    // directory outside this repo's boundary must not leak into a nested
    // repo (e.g. a submodule) that never opted in itself.
    if (!wtDetect.findPolicyFile(targetPath)) continue;

    const { repoRoot, isLinkedWorktree } = wtDetect.repoInfo(targetPath);
    if (!repoRoot) continue; // not a git repo at all -> allow
    if (!policy.isWorktreeAlwaysOn(repoRoot)) continue;
    if (isLinkedWorktree) continue;

    return {
      exit: 0,
      json: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `claude-tweaks: this project requires an isolated worktree for Edit/Write/NotebookEdit, ` +
            `git commit/push, and Bash cp/mv/tee writes (not every possible Bash write shape — see CLAUDE.md) ` +
            `(policy: worktree.always in .claude-tweaks/policy.yml). You're currently working in ` +
            `a non-isolated checkout (${repoRoot}). Set one up first: invoke /superpowers:using-git-worktrees, ` +
            `then retry this edit inside the new worktree.`,
        },
      },
    };
  }
  return {};
}

function run(ctx) {
  const command = ctx.input && ctx.input.tool_name === 'Bash' && ctx.input.tool_input
    && typeof ctx.input.tool_input.command === 'string' ? ctx.input.tool_input.command : null;
  // Shared by checkWorktreeRequired's Bash branch above and the E1 loop
  // below — parsing the same command/cwd through gitTargets twice per
  // invocation was pure repeated work.
  const commandGitTargets = command ? gitTargets(command, ctx.cwd) : null;

  const gate = checkWorktreeRequired(ctx, commandGitTargets);
  if (gate.json) return gate;

  if (!ctx.runDir || !ctx.runState || !ctx.runState.worktree) return {};
  if (ctx.runState.status === 'clean') return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  if (typeof command !== 'string' || !command) return {};
  const assigned = safeReal(ctx.runState.worktree);
  if (!assigned) return {};

  // Multi-run project: the fallback resolver in bin/hooks.js always picks the
  // newest non-terminal run, so a terminal committing in its OWN assigned
  // worktree can land here with ctx.runDir pointing at a DIFFERENT (newer)
  // run. Build the full set of live worktrees (this run's plus every other
  // non-terminal run's) so such a commit is allowed rather than false-denied.
  const otherWorktrees = new Map(); // realpath (excluding this run's own) -> run dir
  for (const { dir, state } of ctxLib.listRunDirsWithState(ctx.cwd)) {
    if (!state || !state.worktree) continue;
    const real = safeReal(state.worktree);
    if (!real || real === assigned) continue;
    if (!otherWorktrees.has(real)) otherWorktrees.set(real, dir);
  }

  for (const target of commandGitTargets || []) {
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
