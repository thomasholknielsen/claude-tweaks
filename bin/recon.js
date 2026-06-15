#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { detectAreas } = require('./lib/recon/areas');
const { scoreAreas } = require('./lib/recon/score');
const { buildLenses } = require('./lib/recon/lenses/index');
const { fingerprint } = require('./lib/recon/fingerprint');
const { readCache, writeCache, readRuns, computeChurn, recordRun, readCursors } = require('./lib/recon/cache');
const { decide } = require('./lib/recon/dedup');
const { toIssuePayload } = require('./lib/recon/issue-payload');
const { buildWorkOrders, JUDGMENT_LENS_MAP } = require('./lib/recon/judgment');
const { validateFinding } = require('./lib/recon/validate-finding');
const { validateFindingV2 } = require('./lib/recon/validate-finding');
const { toIssuePayloadV2 } = require('./lib/recon/issue-payload');
const { getCriterion } = require('./lib/recon/criteria');
const { classifyArea } = require('./lib/recon/area-type');

const DEFAULT_JUDGMENT_LENSES = Object.keys(JUDGMENT_LENS_MAP);
const DEFAULT_MAX_SUBAGENTS = 6;

// Confidence ordering for floor comparison. Higher index = higher confidence.
const CONFIDENCE_ORDER = ['low', 'med', 'high'];

// Returns { pass: true } or { pass: false, reason: string }.
function applyConfidenceFloor(finding, criterionFloor) {
  if (!criterionFloor) return { pass: true };
  const findingIdx = CONFIDENCE_ORDER.indexOf(finding.confidence);
  const floorIdx = CONFIDENCE_ORDER.indexOf(criterionFloor);
  if (findingIdx >= floorIdx) return { pass: true };
  return {
    pass: false,
    reason: `confidence '${finding.confidence}' below floor '${criterionFloor}' for criterion '${finding.criterion}'`,
  };
}

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
    else if (a === '--fail-on') args['fail-on'] = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--label') args.label = argv[++i];
    else if (a === '--min-severity') args['min-severity'] = argv[++i];
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

// Returns areas to sweep this run. `--area` bypasses detection + scoring.
// `inject` (tests only): { areas, signals, now } supplies deterministic inputs.
function selectAreas(cfg, inject) {
  if (cfg && cfg.area) return [{ id: cfg.area, path: cfg.area, globs: [cfg.area], flags: {} }];

  const now = inject && inject.now != null ? inject.now : Date.now();
  const areas = inject && inject.areas ? inject.areas : detectAreas(cfg && cfg.root || process.cwd());
  const signals =
    inject && inject.signals ? inject.signals : collectSignals(cfg && cfg.root || process.cwd(), areas);

  const ranked = scoreAreas(areas, signals, now);
  return ranked.slice(0, (cfg && cfg.K) || 3);
}

// Impure: gathers per-area signals from git, the filesystem, and the dedup cache.
function collectSignals(rootDir, areas) {
  const cache = readCache(rootDir);
  const signals = {};
  for (const area of areas) {
    signals[area.id] = {
      lastSweptMs: areaLastSweptMs(rootDir, area.id),
      churn: gitChurn(rootDir, area.path || area.id),
      loc: areaLoc(rootDir, area.path || area.id),
      priorFindings: priorFindingCount(cache, area.id),
      fanIn: 0, // fan-in heuristic: extended in a later pass
    };
  }
  return signals;
}

function gitChurn(rootDir, areaPath) {
  const { execFileSync } = require('child_process');
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  try {
    const out = execFileSync(
      'git',
      ['-C', rootDir, 'log', '--oneline', `--since=${since}`, '--', areaPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function areaLoc(rootDir, areaPath) {
  const { execFileSync } = require('child_process');
  const abs = path.join(rootDir, areaPath);
  try {
    const out = execFileSync(
      'find',
      [abs, '-type', 'f', '(', '-name', '*.js', '-o', '-name', '*.ts', '-o', '-name', '*.tsx', '-o', '-name', '*.jsx', ')'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let total = 0;
    for (const file of out.split('\n').filter(Boolean)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        total += content.split('\n').length;
      } catch {
        // skip unreadable files
      }
    }
    return total;
  } catch {
    return 0;
  }
}

// Reads per-area sweep cursor from the cursors store (.claude-tweaks/recon/cursors.json).
// Falls back to scanning the cache for legacy lastSweptMs entries (backward compat).
function areaLastSweptMs(rootDir, areaId) {
  const cursors = readCursors(rootDir);
  if (cursors[areaId] && typeof cursors[areaId].lastSweptMs === 'number') {
    return cursors[areaId].lastSweptMs;
  }
  // Legacy fallback: scan cache entries that embed area+lastSweptMs
  const cache = readCache(rootDir);
  let max = null;
  for (const entry of Object.values(cache)) {
    if (entry.area === areaId && typeof entry.lastSweptMs === 'number') {
      if (max === null || entry.lastSweptMs > max) max = entry.lastSweptMs;
    }
  }
  return max;
}

function priorFindingCount(cache, areaId) {
  let n = 0;
  for (const entry of Object.values(cache)) {
    if (entry.area === areaId && (entry.status === 'open' || entry.status === 'regressed')) n++;
  }
  return n;
}

function cmdRun(args) {
  const cfg = {}; // Phase 1: default lens set; project-command stays opt-in
  const areas = selectAreas({ area: args.area, root: args.root, K: 3 });
  const lenses = buildLenses(cfg);
  const issueIndex = loadIssueIndex(args.issues);
  const cache = readCache(args.root);

  const plan = [];
  const summary = { file: 0, remember: 0, reopen: 0, skip: 0, suppress: 0 };
  const seen = new Set(); // intra-run dedup: keep the first occurrence of each fingerprint

  for (const area of areas) {
    for (const lens of lenses) {
      for (const finding of lens.run(area, args.root, cfg[lens.id])) {
        finding.id = fingerprint({
          lens: finding.lens,
          areaId: finding.area,
          signature: finding.signature,
          file: finding.files && finding.files[0],
        });
        if (seen.has(finding.id)) continue; // skip duplicate fingerprint within this run
        seen.add(finding.id);
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
          cache[finding.id] = decision.action === 'reopen'
            ? { status: 'regressed', issue: decision.issue || null, severity: finding.severity }
            : { status: 'open', issue: decision.issue || null, severity: finding.severity };
        } else if (decision.action === 'remember') {
          if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null };
        }
        plan.push(entry);
      }
    }
  }

  if (!args.dryRun) {
    writeCache(args.root, cache);
    const fingerprints = plan.map((e) => e.fingerprint).filter(Boolean);
    const areasSwept = areas.map((a) => a.id);
    recordRun(args.root, args.runId, { fingerprints, areasSwept });
  }

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
  // --issues is optional: when provided (e.g. a closed-issue file signalling a
  // regression), decide() can produce 'reopen' decisions.
  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seenIngest = new Set(); // intra-run dedup: keep the first occurrence of each fingerprint
  for (const finding of survivors) {
    if (seenIngest.has(finding.id)) continue; // skip duplicate fingerprint within this run
    seenIngest.add(finding.id);
    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;
    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, severity: finding.severity }
        : { status: 'open', issue: decision.issue || null, severity: finding.severity };
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

function cmdStatus(args) {
  const cache = readCache(args.root);
  const findings = Object.values(cache);
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    critical: findings.filter((f) => f.status === 'open' && f.severity === 'critical').length,
  };
  const line = `open:${counts.open} regressed:${counts.regressed} closed:${counts.closed} wontfix:${counts.wontfix}\n`;
  const failOn = args['fail-on'];
  if (failOn === 'regressed' && counts.regressed > 0) {
    process.stdout.write(`FAIL: ${counts.regressed} regressed finding(s)\n` + line);
    process.exit(1);
  }
  if (failOn === 'critical' && counts.critical > 0) {
    process.stdout.write(`FAIL: ${counts.critical} open critical finding(s)\n` + line);
    process.exit(1);
  }
  process.stdout.write(line);
}

function cmdChurnReport(args) {
  const runs = readRuns(args.root);
  if (runs.length === 0) {
    process.stdout.write('no run logs found\n');
    return;
  }
  const threshold = args['fail-on-high-churn'] != null ? parseFloat(args['fail-on-high-churn']) : null;
  const rows = [['runId', 'runAt', 'findings', 'appeared', 'disappeared', 'ratio']];
  let exceeded = false;
  for (let i = 0; i < runs.length; i++) {
    const prior = i > 0 ? runs[i - 1] : null;
    const c = computeChurn(runs[i].fingerprints, prior);
    rows.push([
      runs[i].runId,
      (runs[i].runAt || '').slice(0, 19),
      String(runs[i].fingerprints.length),
      String(c.appeared.length),
      String(c.disappeared.length),
      String(c.ratio),
    ]);
    if (threshold != null && c.ratio >= threshold) exceeded = true;
  }
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  for (const row of rows) {
    process.stdout.write(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ') + '\n');
  }
  if (exceeded) {
    process.stdout.write(`\nhigh churn: one or more runs >= ${threshold}\n`);
    process.exit(1);
  }
}

function cmdPullIssues(args) {
  const { pullReconIssues } = require('./lib/recon/pull-issues');
  if (!args.issues) {
    process.stderr.write('usage: recon.js pull-issues --label <label> --issues <file> [--min-severity <sev>]\n');
    process.exit(2);
  }
  let issuesJson;
  try {
    issuesJson = JSON.parse(fs.readFileSync(args.issues, 'utf8'));
  } catch {
    process.stderr.write(`pull-issues: could not read or parse issues file: ${args.issues}\n`);
    process.exit(1);
  }
  if (!Array.isArray(issuesJson)) {
    process.stderr.write('pull-issues: issues file must contain a JSON array\n');
    process.exit(1);
  }
  const briefs = pullReconIssues({
    label: args.label || 'recon',
    minSeverity: args['min-severity'],
    issuesJson,
  });
  process.stdout.write(JSON.stringify(briefs, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1]; // positional after the subcommand name
  if (!findingsPath) {
    process.stderr.write(
      'usage: recon.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--run-id <id>] [--dry-run]\n',
    );
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`validate-findings: could not read or parse findings file: ${findingsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('validate-findings: findings file must contain a JSON array\n');
    process.exit(1);
  }

  // 1. Validate every finding; drop malformed ones with a logged reason.
  const survivors = [];
  for (const f of raw) {
    const v = validateFindingV2(f);
    if (!v.ok) {
      process.stderr.write(
        `[recon] validate-findings: dropped finding "${(f && f.title) || '?'}" ` +
        `(criterion ${(f && f.criterion) || '?'}, area ${(f && f.areaId) || '?'}): ` +
        `${v.errors.join('; ')}\n`,
      );
      continue;
    }
    // 1a. Confidence-floor gate: drop findings below the criterion's floor.
    const crit = getCriterion(v.value.criterion);
    const floorResult = applyConfidenceFloor(v.value, crit && crit.confidenceFloor);
    if (!floorResult.pass) {
      process.stderr.write(`[recon] validate-findings: dropped "${v.value.title}" — ${floorResult.reason}\n`);
      continue;
    }
    // 2. Fingerprint via v2 form.
    const id = fingerprint({ criterion: v.value.criterion, areaId: v.value.areaId, anchor: v.value.anchor });
    survivors.push({ ...v.value, id });
  }

  // 3. Dedup against the issue index and local cache.
  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue; // intra-run dedup
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache, { threshold: 'low' });
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, severity: finding.severity }
        : { status: 'open', issue: null, severity: finding.severity };
      payloads.push(toIssuePayloadV2(finding));
    } else if (decision.action === 'remember') {
      if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null };
    }
  }

  // 4. Persist cache (unless dry-run).
  if (!args.dryRun) {
    writeCache(root, cache);
  }

  // 5. Emit gh-ready payloads on stdout.
  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[recon] validate-findings ${args.runId || '?'}: ` +
    `${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdClassify(args) {
  const root = args.root || process.cwd();
  const areaPath = args.area || '.';
  const absDir = path.resolve(root, areaPath);
  const { types } = classifyArea(absDir, root);
  process.stdout.write(JSON.stringify({ areaId: areaPath, types }, null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'run') return cmdRun(args);
  if (cmd === 'plan-judgment') return cmdPlanJudgment(args);
  if (cmd === 'ingest-judgment') return cmdIngestJudgment(args);
  if (cmd === 'status') return cmdStatus(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'pull-issues') return cmdPullIssues(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'classify') return cmdClassify(args);
  process.stderr.write(
    'usage: recon.js <command> [options]\n' +
    '  run [--area <path>] [--dry-run] [--root <dir>] [--issues <file>]\n' +
    '  validate-findings <findings.json> [--root <dir>] [--issues <file>] [--run-id <id>] [--dry-run]\n' +
    '  plan-judgment --areas <a,b> [--lenses <l,m>] [--max-subagents <n>] [--run-id <id>]\n' +
    '  ingest-judgment <results.json> [--root <dir>] [--run-id <id>]\n' +
    '  status [--fail-on regressed|critical]\n' +
    '  churn-report [--fail-on-high-churn <ratio>]\n' +
    '  pull-issues --label <label> --issues <file> [--min-severity <sev>]\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdRun, cmdIngestJudgment, cmdValidateFindings, main, selectAreas, collectSignals, applyConfidenceFloor };
