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

// Run dirs are named as ISO-timestamp-prefixed slugs (e.g. 2026-07-01T090000-spec-1).
// Other siblings under pipelines/ — notably archive/, the wrap-up archival
// destination — are not runs. archive/ sorts AFTER ISO names lexically, so an
// unfiltered .sort().reverse() would rank it first and shadow live runs.
const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T/;

// Reads each candidate's run-state.json once and keeps it alongside its dir
// — callers that need both the dir list and each entry's state (session-start's
// stale-run report, pre-tool-use's other-worktrees scan) would otherwise read
// run-state.json a second time per dir via a separate readRunState() call.
function listRunDirsWithState(cwd) {
  const base = path.join(cwd || process.cwd(), '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && RUN_ID_RE.test(e.name))
    .map((e) => path.join(base, e.name))
    .sort()
    .reverse()
    .map((dir) => ({ dir, state: readRunState(dir) }))
    .filter(({ state }) => !(state && state.status === 'clean'));
}

function listRunDirs(cwd) {
  return listRunDirsWithState(cwd).map(({ dir }) => dir);
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

module.exports = { readStdin, parseInput, resolveRunDir, listRunDirs, listRunDirsWithState, readRunState, writeRunState, appendEvent };
