#!/usr/bin/env node
// bin/hooks.js — single dispatcher for all claude-tweaks hook registrations.
// Cardinal invariant: never break a session. Every path — including a
// PreToolUse deny — exits 0; no module ever sets a non-zero `exit`. A deny
// is communicated entirely via `hookSpecificOutput.permissionDecision:
// 'deny'` in the stdout JSON (see pre-tool-use.js's own header comment for
// why: exit 2 is a cruder, stderr-only mechanism that would silently drop
// the custom permissionDecisionReason). This corrects an earlier version of
// this comment ("the only deliberate non-zero exit is the pre-tool-use
// deny") that never actually matched pre-tool-use.js's real behavior.
'use strict';
const fs = require('fs');
const path = require('path');
const ctxLib = require('./lib/hooks/context');

const EVENTS = ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop'];

function loadModule(event) {
  try { return require('./lib/hooks/' + event); } catch { return null; }
}

// Resolves an explicit `--run <path>` argument, validating it's a real
// directory, or falls back to ctxLib.resolveRunDir when --run is absent.
// Shared by record-worktree and close-run below so a future change to what
// counts as a valid --run path (e.g. also rejecting a directory that exists
// but isn't a real run dir, or resolving symlinks first) only needs to land
// once. `args` is the command's own argument list (cmd already stripped);
// when --run is found, its two-element span is spliced out of the returned
// `rest` so a caller with its own positional args (record-worktree's
// worktree path) can still find them regardless of flag placement.
function resolveRunArg(args, cwd, env) {
  const flagIdx = args.indexOf('--run');
  if (flagIdx === -1) {
    return { runDir: ctxLib.resolveRunDir(cwd, env), invalidRunArg: null, rest: args, explicit: false };
  }
  const rest = args.slice();
  const candidate = rest[flagIdx + 1] || null;
  rest.splice(flagIdx, 2);
  // An explicit --run must resolve to a real directory — falling back to
  // resolveRunDir's "newest non-terminal run" scan on a bad path would
  // silently record against the WRONG run, defeating the reason --run
  // exists at all.
  const isRealDir = candidate ? (() => { try { return fs.statSync(candidate).isDirectory(); } catch { return false; } })() : false;
  if (isRealDir) {
    return { runDir: candidate, invalidRunArg: null, rest, explicit: true };
  }
  return { runDir: null, invalidRunArg: candidate || '(missing value)', rest, explicit: true };
}

function main(argv) {
  const cmd = argv[2];
  if (cmd === 'record-worktree') {
    // --run <path> pins the target run dir explicitly, mirroring close-run
    // below — without it, this always fell through to resolveRunDir's
    // "newest non-terminal run" fallback, which a stale never-closed run
    // could win over the run genuinely making this call.
    const { runDir, invalidRunArg, rest } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    const worktreeArg = rest[0];
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — worktree not recorded\n`);
    } else if (runDir && worktreeArg) {
      // Stamp the owning session so E1 can scope enforcement to it. Absent env
      // var: omit the key rather than write null — an env-less re-record must
      // not clobber a previous stamp.
      const patch = { worktree: path.resolve(worktreeArg), status: 'active' };
      if (process.env.CLAUDE_CODE_SESSION_ID) patch.sessionId = process.env.CLAUDE_CODE_SESSION_ID;
      const result = ctxLib.writeRunState(runDir, patch);
      if (result) {
        process.stdout.write(`claude-tweaks: worktree recorded for ${path.basename(runDir)}\n`);
      } else {
        process.stdout.write(`claude-tweaks: failed to record worktree for ${path.basename(runDir)} — run-state.json could not be written\n`);
      }
    } else if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — worktree not recorded\n');
    } else {
      // runDir resolved but worktreeArg is falsy — the only remaining case
      // in this chain. Without this branch, a call that omits the worktree
      // positional (e.g. "record-worktree --run <dir>" with nothing after)
      // printed nothing and exited 0, indistinguishable from success.
      process.stdout.write(`claude-tweaks: no worktree path given for ${path.basename(runDir)} — worktree not recorded\n`);
    }
    return 0;
  }
  if (cmd === 'close-run') {
    const { runDir, invalidRunArg, explicit } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path not found: ${invalidRunArg} — run not closed\n`);
    } else if (runDir) {
      const prev = ctxLib.readRunState(runDir);
      const me = process.env.CLAUDE_CODE_SESSION_ID;
      const foreignOwner = !!(prev && typeof prev.sessionId === 'string' && prev.sessionId && me && prev.sessionId !== me);
      if (foreignOwner && !explicit) {
        // The implicit fallback ("newest non-terminal run") landed on a run
        // recorded by a DIFFERENT, still-active session — closing it here
        // would silently disarm that session's E1/E2/E3 enforcement with no
        // way for it to know (see CLAUDE.md's Hooks section). Refuse rather
        // than act; pass an explicit --run if closing someone else's run is
        // genuinely intended.
        process.stdout.write(`claude-tweaks: run ${path.basename(runDir)} was recorded by another session — refusing to close it without an explicit --run\n`);
        return 0;
      }
      if (foreignOwner) {
        process.stdout.write(`claude-tweaks: closing run ${path.basename(runDir)} recorded by another session\n`);
      }
      const result = ctxLib.writeRunState(runDir, { status: 'clean', worktree: null });
      if (!result) {
        process.stdout.write(`claude-tweaks: failed to close run ${path.basename(runDir)} — run-state.json could not be written\n`);
      }
    } else {
      // No --run was given (or it resolved to nothing) and resolveRunDir's
      // fallback also found no run dir — the only remaining case in this
      // chain. Without this branch, a call that can't resolve any run dir
      // printed nothing and exited 0, indistinguishable from success.
      process.stdout.write('claude-tweaks: no pipeline run dir found — run not closed\n');
    }
    return 0;
  }
  if (!EVENTS.includes(cmd)) return 0;
  const mod = loadModule(cmd);
  if (!mod || typeof mod.run !== 'function') return 0;
  const input = ctxLib.parseInput(ctxLib.readStdin());
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  // Two views of the same runs, because enforcement and bookkeeping want
  // different things (#62).
  //
  // `runDir`/`runState` stay UNFILTERED — the newest non-terminal run. E1's
  // working-directory gate is about this checkout, not about who owns the run:
  // its whole foreign-session branch exists to warn a bystander that the
  // checkout belongs to somebody else's worktree, which it can only do by
  // resolving a run it does not own.
  //
  // `ownedRun` is scoped to the calling session and is what may be WRITTEN to.
  // The session id comes off the hook payload, not the environment: hook
  // processes are spawned with the harness's own env, so CLAUDE_CODE_SESSION_ID
  // is not reliably present here even though `record-worktree` (a Bash-invoked
  // subcommand, not a hook) can read it.
  const runDir = ctxLib.resolveRunDir(cwd, process.env);
  const runState = runDir ? ctxLib.readRunState(runDir) : null;
  const ownedRun = ctxLib.resolveRun(cwd, process.env, input.session_id);
  const out = mod.run({ input, runDir, runState, ownedRun, cwd }) || {};
  if (out.json) fs.writeSync(1, JSON.stringify(out.json));
  return typeof out.exit === 'number' ? out.exit : 0;
}

if (require.main === module) {
  let code = 0;
  try { code = main(process.argv); } catch { code = 0; }
  process.exit(code);
}

module.exports = { main };
