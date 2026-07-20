#!/usr/bin/env node
// bin/hooks.js — single dispatcher for all claude-tweaks hook registrations.
// Cardinal invariant: never break a session. Exit 0 on ANY error; the only
// deliberate non-zero exit is the pre-tool-use deny.
'use strict';
const fs = require('fs');
const path = require('path');
const ctxLib = require('./lib/hooks/context');

const EVENTS = ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop'];

function loadModule(event) {
  try { return require('./lib/hooks/' + event); } catch { return null; }
}

function main(argv) {
  const cmd = argv[2];
  if (cmd === 'record-worktree') {
    // --run <path> pins the target run dir explicitly, mirroring close-run
    // below — without it, this always fell through to resolveRunDir's
    // "newest non-terminal run" fallback, which a stale never-closed run
    // could win over the run genuinely making this call. Strip --run and its
    // value out of the remaining args so the worktree positional resolves
    // correctly regardless of flag placement.
    const rest = argv.slice(3);
    const flagIdx = rest.indexOf('--run');
    let explicitRun = null;
    if (flagIdx !== -1) {
      explicitRun = rest[flagIdx + 1] || null;
      rest.splice(flagIdx, 2);
    }
    const worktreeArg = rest[0];
    const runDir = explicitRun || ctxLib.resolveRunDir(process.cwd(), process.env);
    if (runDir && worktreeArg) {
      // Stamp the owning session so E1 can scope enforcement to it. Absent env
      // var: omit the key rather than write null — an env-less re-record must
      // not clobber a previous stamp.
      const patch = { worktree: path.resolve(worktreeArg), status: 'active' };
      if (process.env.CLAUDE_CODE_SESSION_ID) patch.sessionId = process.env.CLAUDE_CODE_SESSION_ID;
      const written = ctxLib.writeRunState(runDir, patch);
      if (written) {
        process.stdout.write(`claude-tweaks: worktree recorded for ${path.basename(runDir)}\n`);
      } else {
        process.stdout.write(`claude-tweaks: FAILED to record worktree for ${path.basename(runDir)} — run-state.json write failed\n`);
      }
    } else if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — worktree not recorded\n');
    }
    return 0;
  }
  if (cmd === 'close-run') {
    const flagIdx = argv.indexOf('--run');
    const runDir = flagIdx !== -1 && argv[flagIdx + 1] ? argv[flagIdx + 1] : ctxLib.resolveRunDir(process.cwd(), process.env);
    if (runDir) {
      const prev = ctxLib.readRunState(runDir);
      const me = process.env.CLAUDE_CODE_SESSION_ID;
      if (prev && typeof prev.sessionId === 'string' && prev.sessionId && me && prev.sessionId !== me) {
        process.stdout.write(`claude-tweaks: closing run ${path.basename(runDir)} recorded by another session\n`);
      }
      ctxLib.writeRunState(runDir, { status: 'clean', worktree: null });
    }
    return 0;
  }
  if (!EVENTS.includes(cmd)) return 0;
  const mod = loadModule(cmd);
  if (!mod || typeof mod.run !== 'function') return 0;
  const input = ctxLib.parseInput(ctxLib.readStdin());
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const runDir = ctxLib.resolveRunDir(cwd, process.env);
  const runState = runDir ? ctxLib.readRunState(runDir) : null;
  const out = mod.run({ input, runDir, runState, cwd }) || {};
  if (out.json) fs.writeSync(1, JSON.stringify(out.json));
  return typeof out.exit === 'number' ? out.exit : 0;
}

if (require.main === module) {
  let code = 0;
  try { code = main(process.argv); } catch { code = 0; }
  process.exit(code);
}

module.exports = { main };
