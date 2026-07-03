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
    const runDir = ctxLib.resolveRunDir(process.cwd(), process.env);
    if (runDir && argv[3]) ctxLib.writeRunState(runDir, { worktree: path.resolve(argv[3]), status: 'active' });
    return 0;
  }
  if (cmd === 'close-run') {
    const flagIdx = argv.indexOf('--run');
    const runDir = flagIdx !== -1 && argv[flagIdx + 1] ? argv[flagIdx + 1] : ctxLib.resolveRunDir(process.cwd(), process.env);
    if (runDir) ctxLib.writeRunState(runDir, { status: 'clean' });
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
