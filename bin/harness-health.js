#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/harness-health/fingerprint');
const {
  readCache, writeCache, readCursors, recordAudit,
  readGapScanCursor, recordGapScan, recordRun, readRuns, computeChurn,
} = require('./lib/harness-health/cache');
const { decide } = require('./lib/harness-health/dedup');
const { validateFinding } = require('./lib/harness-health/validate-finding');
const { toIssuePayload } = require('./lib/harness-health/issue-payload');
const { selectTarget, listSkills } = require('./lib/harness-health/scope');
const { STALE_DAYS } = require('./lib/harness-health/score');

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--skill') args.skill = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--gap-scan') args.gapScan = true;
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--budget') args.budget = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects
// (the shape gh issue list + fingerprint extraction produces).
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`[harness-health] validate-findings: could not read or parse --issues file: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  if (!Array.isArray(arr)) {
    process.stderr.write(`[harness-health] validate-findings: --issues file must contain a JSON array: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  const index = {};
  for (const issue of arr) {
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

function cmdNextTarget(args) {
  const root = args.root || process.cwd();
  const now = Date.now();
  const gapScan = readGapScanCursor(root);
  const gapScanDue = gapScan.lastScannedMs == null || (now - gapScan.lastScannedMs) / 86400000 > STALE_DAYS;

  if (args.skill) {
    const found = listSkills(root).find((s) => s.id === args.skill) || null;
    const target = found ? { ...found, why: 'manual' } : null;
    process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
    return;
  }

  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  let cursors = readCursors(root);

  if (budget === 1) {
    const target = selectTarget(root, cursors, { now });
    process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
    return;
  }

  // budget > 1: iterate, simulating post-audit cursor state in-memory so each
  // pick is a different skill (mirrors recon's next-slice --budget).
  const targets = [];
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now });
    if (!target) break;
    targets.push(target);
    const key = `${target.kind}:${target.id}`;
    cursors = { ...cursors, [key]: { ...(cursors[key] || {}), lastAuditedMs: now } };
  }
  process.stdout.write(JSON.stringify({ targets, gapScanDue }, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1];
  if (!findingsPath) {
    process.stderr.write(
      'usage: harness-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--skill <id>] [--gap-scan] [--run-id <id>] [--dry-run]\n',
    );
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  } catch {
    process.stderr.write(`validate-findings: could not read or parse findings file: ${findingsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('validate-findings: findings file must contain a JSON array\n');
    process.exit(1);
  }

  const survivors = [];
  for (const f of raw) {
    const v = validateFinding(f);
    if (!v.ok) {
      process.stderr.write(
        `[harness-health] validate-findings: dropped finding for skill "${(f && f.skill) || '?'}": ${v.errors.join('; ')}\n`,
      );
      continue;
    }
    const id = fingerprint({
      skill: v.value.skill,
      section: v.value.section || v.value.kind,
      description: v.value.description,
    });
    survivors.push({ ...v.value, id });
  }

  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file') {
      cache[finding.id] = { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
  }

  if (!args.dryRun) {
    writeCache(root, cache);
    if (args.skill) recordAudit(root, `skill:${args.skill}`, {});
    if (args.gapScan) recordGapScan(root, {});
    recordRun(root, args.runId, [...seen]);
  }

  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[harness-health] validate-findings: ${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdChurnReport(args) {
  const root = args.root || process.cwd();
  const runs = readRuns(root);
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
    if (threshold != null && prior != null && c.ratio >= threshold) exceeded = true;
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

const MARK_STATUSES = new Set(['applied', 'declined']);

function cmdMark(args) {
  const root = args.root || process.cwd();
  const fp = args._[1];
  const status = args._[2];
  if (!fp || !MARK_STATUSES.has(status)) {
    process.stderr.write(`usage: harness-health.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
    process.exit(2);
  }
  const cache = readCache(root);
  cache[fp] = { status, lastSeenMs: Date.now() };
  writeCache(root, cache);
  process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  process.stderr.write(
    'usage: harness-health.js <command> [options]\n' +
    'commands: next-target [--skill <id>], validate-findings <file> [--skill <id>] [--gap-scan], churn-report [--fail-on-high-churn <r>], mark <fingerprint> <applied|declined>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, main };
