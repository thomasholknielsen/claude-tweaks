#!/usr/bin/env node
// bin/phase-timing.js — render a run's per-phase timing (#1928).
//
//   node bin/phase-timing.js --run <dir> [--json] [--markdown]
//
// Reads {run-dir}/events.jsonl (per-line JSON; a malformed line is skipped,
// a missing file is an empty run), {run-dir}/manifest.yml (optional) and
// {run-dir}/run-state.json (optional, pr.mergedAt), writes
// {run-dir}/timing.json, and prints the markdown table (--markdown) or the
// JSON object (--json); with neither it prints the path it wrote. Exit 0 in
// every derivable case — missing events degrade per row to `unattributed`.
// `--run ""` (present but empty — the canonical skill snippet's unset-
// $PIPELINE_RUN_DIR idiom, matching verify.js's own treatment of it) prints
// "no run directory" to stderr, writes nothing, and returns 0. Exit 2 only
// on a genuinely malformed invocation: a MISSING --run flag, a --run that
// is not a directory, or an events.jsonl that exists but cannot be read.
'use strict';
const fs = require('fs');
const path = require('path');
const { derivePhases } = require('./lib/timing/derive');
const { readManifest } = require('./lib/flow/manifest');

const USAGE = 'usage: phase-timing.js --run <dir> [--json] [--markdown]\n';

function parseArgs(argv) {
  const o = { run: null, json: false, markdown: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run') { o.run = argv[i + 1]; i++; if (o.run === undefined) return null; continue; }
    if (a === '--json') { o.json = true; continue; }
    if (a === '--markdown') { o.markdown = true; continue; }
    return null;
  }
  if (o.run === null) return null; // flag never supplied — malformed
  return o;
}

function readEvents(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, events: [] };
    return { ok: false, error: err.message };
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* per-row skip, never fatal */ }
  }
  return { ok: true, events };
}

function readJsonOrNull(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function verifyCell(verify) {
  if (!verify.length) return '—';
  const counts = new Map();
  for (const v of verify) counts.set(v.mode || 'unknown', (counts.get(v.mode || 'unknown') || 0) + 1);
  return [...counts].map(([m, n]) => `${m} ×${n}`).join(', ');
}

function renderMarkdown(out) {
  const lines = ['| Phase | Minutes | Verify |', '|---|---|---|'];
  for (const p of out.phases) {
    const minutes = p.ownMinutes !== p.minutes ? `${p.minutes} (own ${p.ownMinutes})` : String(p.minutes);
    lines.push(p.source === 'unattributed'
      ? `| ${p.phase} | ${minutes} | unattributed |`
      : `| ${p.phase} | ${minutes} | ${verifyCell(p.verify)} |`);
  }
  if (out.totals.minutes > 0 || out.totals.verifyRuns > 0) {
    lines.push(`| total | ${out.totals.minutes} | ${out.totals.verifyRuns} run(s)${out.totals.verifyModes.length ? ` (${out.totals.verifyModes.join(', ')})` : ''} |`);
  }
  return lines.join('\n') + '\n';
}

function main(argv) {
  const o = parseArgs(argv);
  if (!o) { process.stderr.write(USAGE); return 2; }
  if (o.run === '') {
    process.stderr.write('timing: no run directory (PIPELINE_RUN_DIR unset)\n');
    return 0;
  }
  const runDir = path.resolve(o.run);
  let stat;
  try { stat = fs.statSync(runDir); } catch { process.stderr.write(`phase-timing.js: --run ${o.run} is not a directory\n${USAGE}`); return 2; }
  if (!stat.isDirectory()) { process.stderr.write(`phase-timing.js: --run ${o.run} is not a directory\n${USAGE}`); return 2; }
  const events = readEvents(path.join(runDir, 'events.jsonl'));
  if (!events.ok) { process.stderr.write(`phase-timing.js: events.jsonl unreadable (${events.error})\n`); return 2; }
  const out = derivePhases({ events: events.events, manifest: readManifest(runDir), runState: readJsonOrNull(path.join(runDir, 'run-state.json')) });
  const timing = { runDir, generatedAt: new Date().toISOString(), phases: out.phases, totals: out.totals };
  const timingPath = path.join(runDir, 'timing.json');
  fs.writeFileSync(timingPath, JSON.stringify(timing, null, 2) + '\n');
  if (o.markdown) process.stdout.write(renderMarkdown(out));
  else if (o.json) process.stdout.write(JSON.stringify(timing, null, 2) + '\n');
  else process.stdout.write(`timing: wrote ${timingPath}\n`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, parseArgs, renderMarkdown };
