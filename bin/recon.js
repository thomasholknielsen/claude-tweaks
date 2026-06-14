#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { detectAreas, selectAreas } = require('./lib/recon/areas');
const { buildLenses } = require('./lib/recon/lenses/index');
const { fingerprint } = require('./lib/recon/fingerprint');
const { readCache, writeCache } = require('./lib/recon/cache');
const { decide } = require('./lib/recon/dedup');
const { toIssuePayload } = require('./lib/recon/issue-payload');
const { buildWorkOrders, JUDGMENT_LENS_MAP } = require('./lib/recon/judgment');
const { validateFinding } = require('./lib/recon/validate-finding');

const DEFAULT_JUDGMENT_LENSES = Object.keys(JUDGMENT_LENS_MAP);
const DEFAULT_MAX_SUBAGENTS = 6;

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--area') args.area = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--areas') args.areas = argv[++i];
    else if (a === '--lenses') args.lenses = argv[++i];
    else if (a === '--max-subagents') args.maxSubagents = Number(argv[++i]);
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

function reconRunsDir(root) {
  return path.join(root, '.claude-tweaks', 'recon', 'runs');
}

function cmdPlanJudgment(args) {
  const root = args.root || process.cwd();
  const areas = (args.areas || '').split(',').map((a) => a.trim()).filter(Boolean);
  if (areas.length === 0) {
    process.stderr.write('plan-judgment: --areas is required (comma-separated list)\n');
    process.exit(2);
  }
  const lenses = args.lenses
    ? args.lenses.split(',').map((l) => l.trim()).filter(Boolean)
    : DEFAULT_JUDGMENT_LENSES;
  const maxSubagents = Number.isFinite(args.maxSubagents) ? args.maxSubagents : DEFAULT_MAX_SUBAGENTS;

  const orders = buildWorkOrders({ areas, lenses, maxSubagents });
  const json = JSON.stringify(orders, null, 2) + '\n';

  const runId = args.runId;
  if (runId) {
    const outDir = reconRunsDir(root);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${runId}-work-orders.json`), json, 'utf8');
  }
  process.stdout.write(json);
}

function cmdIngestJudgment(args) {
  const root = args.root || process.cwd();
  const resultsPath = args._[1]; // positional after the subcommand
  if (!resultsPath) {
    process.stderr.write('usage: recon ingest-judgment <results.json> [--run-id <id>]\n');
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`ingest-judgment: results file not found or not valid JSON: ${resultsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('ingest-judgment: results file must contain a JSON array of {lensId, area, findings}\n');
    process.exit(1);
  }

  // 1. Validate every finding; drop malformed with a logged reason.
  const survivors = [];
  for (const result of raw) {
    if (!result || typeof result.lensId !== 'string' || typeof result.area !== 'string') {
      process.stderr.write('[recon] ingest-judgment: skipping malformed result entry (missing lensId/area)\n');
      continue;
    }
    const findings = Array.isArray(result.findings) ? result.findings : [];
    for (const f of findings) {
      const v = validateFinding(f);
      if (!v.ok) {
        process.stderr.write(
          `[recon] ingest-judgment: dropped finding "${(f && f.signature) || '?'}" ` +
          `(lens ${result.lensId}, area ${result.area}): ${v.errors.join('; ')}\n`);
        continue;
      }
      // 2. Fingerprint via Phase 1. Field name is areaId (not area).
      const id = fingerprint({
        lens: v.value.lens,
        areaId: v.value.area,
        signature: v.value.signature,
        file: v.value.files && v.value.files[0],
      });
      survivors.push({ ...v.value, id });
    }
  }

  // 3. Dedup via Phase 1 against the cache; emit payloads only for survivors.
  // decide(finding, issueIndex, cache) — issueIndex is empty for ingest since we
  // don't have issue JSON here; the skill wires --issues at the run step.
  const cache = readCache(root);
  const issueIndex = {};
  const payloads = [];
  for (const finding of survivors) {
    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;
    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = { status: 'open', issue: decision.issue || null };
    } else if (decision.action === 'remember') {
      if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null };
    }
    payloads.push(toIssuePayload(finding));
  }
  writeCache(root, cache);

  // 4. Emit gh-ready payloads on stdout; the SKILL.md hands these to gh.
  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[recon] ingest-judgment ${args.runId || '?'}: ` +
    `${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`);
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'run') return cmdRun(args);
  if (cmd === 'plan-judgment') return cmdPlanJudgment(args);
  if (cmd === 'ingest-judgment') return cmdIngestJudgment(args);
  process.stderr.write('usage: recon.js run [--area <path>] [--dry-run] [--root <dir>] [--issues <file>]\n');
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdRun, main };
