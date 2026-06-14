#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { detectAreas, selectAreas } = require('./lib/recon/areas');
const { buildLenses } = require('./lib/recon/lenses/index');
const { fingerprint } = require('./lib/recon/fingerprint');
const { readCache, writeCache } = require('./lib/recon/cache');
const { decide } = require('./lib/recon/dedup');
const { toIssuePayload } = require('./lib/recon/issue-payload');

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--area') args.area = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects
// (the shape gh issue list + fingerprint extraction produces).
// decide() expects a map { "<fingerprint>": { number, state, labels } }.
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  if (!Array.isArray(arr)) return {};
  const index = {};
  for (const issue of arr) {
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

function cmdRun(args) {
  const cfg = {}; // Phase 1: default lens set; project-command stays opt-in
  const areas = selectAreas(detectAreas(args.root), { area: args.area });
  const lenses = buildLenses(cfg);
  const issueIndex = loadIssueIndex(args.issues);
  const cache = readCache(args.root);

  const plan = [];
  const summary = { file: 0, remember: 0, reopen: 0, skip: 0, suppress: 0 };

  for (const area of areas) {
    for (const lens of lenses) {
      for (const finding of lens.run(area, args.root, cfg[lens.id])) {
        finding.id = fingerprint({
          lens: finding.lens,
          areaId: finding.area,
          signature: finding.signature,
          file: finding.files && finding.files[0],
        });
        const decision = decide(finding, issueIndex, cache);
        summary[decision.action] = (summary[decision.action] || 0) + 1;
        const entry = {
          fingerprint: finding.id,
          action: decision.action,
          severity: finding.severity,
          title: finding.title,
        };
        if (decision.issue !== undefined) entry.issue = decision.issue;
        if (decision.action === 'file' || decision.action === 'reopen') {
          entry.payload = toIssuePayload(finding);
          cache[finding.id] = { status: 'open', issue: decision.issue || null };
        } else if (decision.action === 'remember') {
          if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null };
        }
        plan.push(entry);
      }
    }
  }

  if (!args.dryRun) writeCache(args.root, cache);

  process.stdout.write(JSON.stringify({
    runId: args.runId,
    dryRun: args.dryRun,
    areas: areas.map((a) => a.id),
    plan,
    summary,
  }, null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'run') return cmdRun(args);
  process.stderr.write('usage: recon.js run [--area <path>] [--dry-run] [--root <dir>] [--issues <file>]\n');
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdRun, main };
