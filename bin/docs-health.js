#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/docs-health/fingerprint');
const { computeWordCount } = require('./lib/docs-health/depth');
const { readCache, writeCache, readDurableState, writeDurableState, buildValidateFindingsUpdate } = require('./lib/docs-health/cache');
const { computeChurn } = require('./lib/health-core/runs');
const { makeRetryQueueCommands } = require('./lib/health-core/retry-cli');
const { decide } = require('./lib/docs-health/dedup');
const { validateFinding } = require('./lib/docs-health/validate-finding');
const { toIssuePayload } = require('./lib/docs-health/issue-payload');
const { selectTarget, listDocs } = require('./lib/docs-health/scope');
const path = require('path');
const { computeInboundReferences } = require('./lib/docs-health/findability');
const { checkTrackedFreshness } = require('./lib/docs-health/freshness');

const retryQueueCommands = makeRetryQueueCommands({ readDurableState, writeDurableState });

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--budget') args.budget = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects.
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`[docs-health] validate-findings: could not read or parse --issues file: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  if (!Array.isArray(arr)) {
    process.stderr.write(`[docs-health] validate-findings: --issues file must contain a JSON array: ${file} — dedup falls back to the local cache only\n`);
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

  if (args.target) {
    const found = listDocs(root).find((t) => t.id === args.target) || null;
    const target = found ? { ...found, why: 'manual' } : null;
    process.stdout.write(JSON.stringify({ target }, null, 2) + '\n');
    return;
  }

  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  let cursors = readDurableState(root).cursors;

  if (budget === 1) {
    const target = selectTarget(root, cursors, { now });
    process.stdout.write(JSON.stringify({ target }, null, 2) + '\n');
    return;
  }

  const targets = [];
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now });
    if (!target) break;
    targets.push(target);
    const key = `doc:${target.id}`;
    cursors = { ...cursors, [key]: { ...(cursors[key] || {}), lastAuditedMs: now } };
  }
  process.stdout.write(JSON.stringify({ targets }, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1];
  if (!findingsPath) {
    process.stderr.write(
      'usage: docs-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--target <id>] [--run-id <id>] [--dry-run]\n',
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
        `[docs-health] validate-findings: dropped finding for target "${(f && f.target) || '?'}": ${v.errors.join('; ')}\n`,
      );
      continue;
    }
    const id = fingerprint({
      assetType: v.value.assetType,
      target: v.value.target,
      section: v.value.section,
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

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, lastSeenMs: Date.now() }
        : { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
  }

  if (!args.dryRun) {
    writeCache(root, cache);
    const runRecord = { runId: args.runId, runAt: new Date().toISOString(), fingerprints: [...seen] };
    const result = writeDurableState(root, (current) => buildValidateFindingsUpdate(current, { target: args.target, runRecord }));
    if (!result.ok) {
      process.stderr.write(`[docs-health] validate-findings: health-state persistence failed after retries: ${result.error}\n`);
    }
  }

  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[docs-health] validate-findings: ${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdChurnReport(args) {
  const root = args.root || process.cwd();
  const runs = readDurableState(root).runs;
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

const MARK_STATUSES = new Set(['declined']);

function cmdMark(args) {
  const root = args.root || process.cwd();
  const fp = args._[1];
  const status = args._[2];
  if (!fp || !MARK_STATUSES.has(status)) {
    process.stderr.write(`usage: docs-health.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
    process.exit(2);
  }
  const cache = readCache(root);
  cache[fp] = { status, lastSeenMs: Date.now() };
  writeCache(root, cache);
  process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
}

function cmdWordCount(args) {
  const targetPath = args._[1];
  if (!targetPath) {
    process.stderr.write('usage: docs-health.js word-count <path>\n');
    process.exit(2);
  }
  let content;
  try {
    content = fs.readFileSync(targetPath, 'utf8');
  } catch {
    process.stderr.write(`word-count: could not read file: ${targetPath}\n`);
    process.exit(1);
  }
  const result = computeWordCount(content);
  process.stdout.write(JSON.stringify({ result }, null, 2) + '\n');
}

// Derives a doc's id (relative to docs/, no .md extension) from a raw
// path argument — mirrors scope.js's own id-deriving logic in walk().
function deriveDocId(targetPath, root) {
  const docsRoot = path.join(root, 'docs');
  const rel = path.relative(docsRoot, path.resolve(targetPath));
  return rel.split(path.sep).join('/').replace(/\.md$/, '');
}

function cmdFindRefs(args) {
  const targetPath = args._[1];
  if (!targetPath) {
    process.stderr.write('usage: docs-health.js find-refs <path> [--root <dir>]\n');
    process.exit(2);
  }
  const root = args.root || process.cwd();
  if (!fs.existsSync(targetPath)) {
    process.stderr.write(`find-refs: could not read file: ${targetPath}\n`);
    process.exit(1);
  }
  const docId = deriveDocId(targetPath, root);
  const result = computeInboundReferences(docId, root);
  process.stdout.write(JSON.stringify({ result }, null, 2) + '\n');
}

function cmdCheckFreshness(args) {
  const targetPath = args._[1];
  if (!targetPath) {
    process.stderr.write('usage: docs-health.js check-freshness <path> [--root <dir>]\n');
    process.exit(2);
  }
  const root = args.root || process.cwd();
  let content;
  try {
    content = fs.readFileSync(targetPath, 'utf8');
  } catch {
    process.stderr.write(`check-freshness: could not read file: ${targetPath}\n`);
    process.exit(1);
  }
  const docId = deriveDocId(targetPath, root);
  const cursors = readDurableState(root).cursors;
  const cursor = cursors[`doc:${docId}`];
  const sinceTimestamp = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
  const result = checkTrackedFreshness(content, root, sinceTimestamp);
  process.stdout.write(JSON.stringify({ result }, null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  if (cmd === 'word-count') return cmdWordCount(args);
  if (cmd === 'find-refs') return cmdFindRefs(args);
  if (cmd === 'check-freshness') return cmdCheckFreshness(args);
  if (cmd === 'retry-queue' && args._[1] === 'drain') return retryQueueCommands.drain(args);
  if (cmd === 'retry-queue' && args._[1] === 'update') return retryQueueCommands.update({ ...args, _: args._.slice(1) });
  process.stderr.write(
    'usage: docs-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--issues <file>] [--dry-run], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>, ' +
    'word-count <path>, find-refs <path> [--root <dir>], check-freshness <path> [--root <dir>], ' +
    'retry-queue drain, retry-queue update <results.json>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, cmdWordCount, cmdFindRefs, cmdCheckFreshness, main };
