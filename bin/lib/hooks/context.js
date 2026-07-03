// bin/lib/hooks/context.js
'use strict';
const fs = require('fs');
const path = require('path');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function parseInput(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

function readRunState(runDir) {
  try { return JSON.parse(fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8')); } catch { return null; }
}

function isTerminal(runDir) {
  const s = readRunState(runDir);
  return !!s && s.status === 'clean';
}

function listRunDirs(cwd) {
  const base = path.join(cwd || process.cwd(), '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(base, e.name))
    .sort()
    .reverse()
    .filter((d) => !isTerminal(d));
}

function resolveRunDir(cwd, env) {
  if (env && env.PIPELINE_RUN_DIR) {
    try { if (fs.statSync(env.PIPELINE_RUN_DIR).isDirectory()) return env.PIPELINE_RUN_DIR; } catch { /* fall through */ }
  }
  const dirs = listRunDirs(cwd);
  return dirs.length ? dirs[0] : null;
}

function writeRunState(runDir, patch) {
  try {
    const next = { ...(readRunState(runDir) || {}), ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(next, null, 2) + '\n');
    return next;
  } catch { return null; }
}

function appendEvent(runDir, type, data) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), type, ...(data || {}) });
    fs.appendFileSync(path.join(runDir, 'events.jsonl'), line + '\n');
  } catch { /* best-effort */ }
}

module.exports = { readStdin, parseInput, resolveRunDir, listRunDirs, readRunState, writeRunState, appendEvent, isTerminal };
