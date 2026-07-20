#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/docs-health/fingerprint');
const { computeWordCount } = require('./lib/docs-health/depth');
const { readCache, writeCache, readDurableState, writeDurableState, buildValidateFindingsUpdate } = require('./lib/docs-health/cache');
const { computeChurn } = require('./lib/health-core/runs');
const { makeRetryQueueCommands } = require('./lib/health-core/retry-cli');
const { loadIssueIndex } = require('./lib/health-core/issue-index');
const { selectBudget } = require('./lib/health-core/budget');
const { makeCmdChurnReport } = require('./lib/health-core/churn-report');
const { makeCmdMark } = require('./lib/health-core/mark');
const { decide } = require('./lib/docs-health/dedup');
const { validateFinding } = require('./lib/docs-health/validate-finding');
const { toIssuePayload } = require('./lib/docs-health/issue-payload');
const { selectTarget, listDocs } = require('./lib/docs-health/scope');
const path = require('path');
const { computeInboundReferences } = require('./lib/docs-health/findability');
const { checkTrackedFreshness } = require('./lib/docs-health/freshness');

const TOOL_NAME = 'docs-health';
const retryQueueCommands = makeRetryQueueCommands({ readDurableState, writeDurableState });
const cmdChurnReport = makeCmdChurnReport({ readDurableState, computeChurn });
const cmdMark = makeCmdMark({ readCache, writeCache, toolName: TOOL_NAME });

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
  const cursors = readDurableState(root).cursors;

  if (budget === 1) {
    const target = selectTarget(root, cursors, { now });
    process.stdout.write(JSON.stringify({ target }, null, 2) + '\n');
    return;
  }

  // Budget > 1: pick up to `budget` distinct docs, simulating post-audit
  // cursor state in-memory between picks (see bin/lib/health-core/budget.js).
  const targets = selectBudget(budget, cursors, (c) => selectTarget(root, c, { now }), {
    getCursorKey: (t) => `doc:${t.id}`,
    buildCursorPatch: (existing) => ({ ...(existing || {}), lastAuditedMs: now }),
  });
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
  const issueIndex = loadIssueIndex(args.issues, TOOL_NAME);
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
  // Resolve targetPath against root, not process.cwd(): --root means
  // "audit a project elsewhere," so a relative targetPath is meant to be
  // read relative to that root, not to wherever the command happens to be
  // invoked from. path.resolve(root, targetPath) is also correct when
  // targetPath is already absolute — path.resolve discards the leading
  // `root` segment in that case, per Node's own right-to-left resolution.
  const rel = path.relative(docsRoot, path.resolve(root, targetPath));
  return rel.split(path.sep).join('/').replace(/\.md$/, '');
}

function cmdFindRefs(args) {
  const targetPath = args._[1];
  if (!targetPath) {
    process.stderr.write('usage: docs-health.js find-refs <path> [--root <dir>]\n');
    process.exit(2);
  }
  const root = args.root || process.cwd();
  // Resolve against root, not process.cwd(), the same way deriveDocId does
  // just below: --root means "audit a project elsewhere," so a relative
  // targetPath is meant to be read relative to that root.
  if (!fs.existsSync(path.resolve(root, targetPath))) {
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
    // Resolve against root, not process.cwd(), the same way deriveDocId does
    // just below: --root means "audit a project elsewhere," so a relative
    // targetPath is meant to be read relative to that root.
    content = fs.readFileSync(path.resolve(root, targetPath), 'utf8');
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

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, cmdWordCount, cmdFindRefs, cmdCheckFreshness, deriveDocId, main };
