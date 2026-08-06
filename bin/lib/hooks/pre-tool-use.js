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
const { runGit } = require('./git-exec');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
}

// Kept returning `string | null` — E1's own callers below compare toplevels for
// a PROVABLE mismatch and already resolve any falsy value to allow, so the
// indeterminate/negative distinction that repoInfo now draws would change no
// decision here. (The worktree gate is the caller that needed it.)
function toplevel(dir) {
  return runGit(['rev-parse', '--show-toplevel'], dir).stdout;
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
// `indeterminateTargets` (optional, caller-supplied array) collects paths whose
// repo status could not be determined — see the branch below. Passed in rather
// than returned so a deny for one target never discards the warning owed for
// another in the same call.
function checkWorktreeRequired(ctx, precomputedGitTargets, indeterminateTargets = []) {
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

    const { repoRoot, isLinkedWorktree, indeterminate } = wtDetect.repoInfo(targetPath);
    // TWO different conditions reach a null repoRoot, and they are not the same
    // fact (#134):
    //   indeterminate: false -> git ran and said "not a git repository". A real
    //     answer, and nothing to enforce: allow, silently, as before.
    //   indeterminate: true  -> git never answered (timed out under load, the
    //     fork was refused, git is missing, or realpath on its answer failed).
    //     We do not know whether this path is a repo, let alone whether it opted
    //     into the policy.
    // We still ALLOW the indeterminate case: CLAUDE.md's hooks contract is
    // "never break a session" and "ambiguity resolves to allow", and denying on
    // a transient load spike would freeze unattended runs. What changes is that
    // it is no longer SILENT — before, a load spike and a non-repo produced
    // byte-identical behavior, so an enforcement gap left no trace anywhere.
    if (indeterminate) {
      indeterminateTargets.push(targetPath);
      continue;
    }
    if (!repoRoot) continue; // git answered: not a git repo at all -> allow
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

function runInner(ctx, indeterminateTargets) {
  const command = ctx.input && ctx.input.tool_name === 'Bash' && ctx.input.tool_input
    && typeof ctx.input.tool_input.command === 'string' ? ctx.input.tool_input.command : null;
  // Shared by checkWorktreeRequired's Bash branch above and the E1 loop
  // below — parsing the same command/cwd through gitTargets twice per
  // invocation was pure repeated work.
  const commandGitTargets = command ? gitTargets(command, ctx.cwd) : null;

  const gate = checkWorktreeRequired(ctx, commandGitTargets, indeterminateTargets);
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

// Attaching the worktree-gate's indeterminate warning is done HERE, once, on
// whatever runInner returned — not at runInner's own return sites. runInner has
// a dozen of them and grows more over time; enumerating them to add the message
// is the exact shape `[IL-14]` records (an enumeration silently misses a path,
// and no test notices because the omission is invisible). This wrapper states
// the unconditional rule instead: every outcome, deny or allow, carries the
// warning if one was collected.
function run(ctx) {
  const indeterminateTargets = [];
  const out = runInner(ctx, indeterminateTargets) || {};
  if (!indeterminateTargets.length) return out;

  const note =
    `claude-tweaks: could not determine the git repo status of `
    + `${indeterminateTargets.join(', ')} (git did not answer — timeout under load, refused fork, or missing git). `
    + `The worktree.always policy gate was NOT applied to ${indeterminateTargets.length > 1 ? 'these paths' : 'this path'} — `
    + `allowed rather than denied, per the never-break-a-session rule. If this project requires an isolated worktree, verify manually.`;

  const json = { ...(out.json || {}) };
  json.systemMessage = json.systemMessage ? `${json.systemMessage} ${note}` : note;
  // exit stays 0 on every path, deny included — the deny signal is the stdout
  // JSON's permissionDecision, never the exit code (see this file's header).
  return { ...out, exit: 0, json };
}

module.exports = { run };
