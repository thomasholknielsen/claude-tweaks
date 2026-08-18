#!/usr/bin/env node
// plugin/bin/verify.js — deterministic verification runner (#892).
// The caller resolves the project's check commands (verification.md Step 1)
// and passes each as --cmd <name>=<command>; this CLI owns execution order,
// per-check log capture, exit-code keying, bounded extraction, and
// report.json. It never reads .claude-tweaks/policy.yml or CLAUDE.md —
// command resolution stays caller-side (spec: Option A boundary).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs, UsageError, USAGE } = require('./lib/verify/args');
const { runChecks } = require('./lib/verify/run');
const { sniffFamily, extractFailingRegion, parseCounts, summaryLine } = require('./lib/verify/extract');
const { gitInfo, composeReport, writeReportAtomic } = require('./lib/verify/report');

function enrich(result) {
  if (result.skipped) return result;
  let text = '';
  try {
    text = fs.readFileSync(result.logPath, 'utf8');
  } catch {
    // Unreadable log degrades to absence, never to a fabricated pass —
    // summary/region/counts stay empty; exitCode still decides pass/fail.
    return { ...result, summary: result.spawnError || null, failingRegion: null, counts: null };
  }
  const family = sniffFamily(text);
  const failed = result.exitCode !== 0;
  return {
    ...result,
    summary: result.spawnError || summaryLine(text, family) || null,
    failingRegion: failed ? extractFailingRegion(text, family) : null,
    counts: parseCounts(text, family),
  };
}

function statusOf(check) {
  if (check.skipped) return `skipped: ${check.skipped}`;
  return check.exitCode === 0 ? 'pass' : 'fail';
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n${USAGE}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  const logDir = parsed.logDir || fs.mkdtempSync(path.join(os.tmpdir(), 'claude-tweaks-verify-'));
  fs.mkdirSync(logDir, { recursive: true });
  const jsonPath = parsed.json || path.join(logDir, 'report.json');

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const results = (await runChecks({ cmds: parsed.cmds, logDir })).map(enrich);
  const report = composeReport({
    checks: results, startedAt, durationMs: Date.now() - startMs, git: gitInfo(),
  });
  writeReportAtomic(report, jsonPath);

  const lines = ['| Check | Status | Duration | Summary |', '|---|---|---|---|'];
  for (const check of results) {
    const duration = check.skipped ? '—' : `${(check.durationMs / 1000).toFixed(1)}s`;
    const summary = check.skipped ? '—' : (check.summary || '—');
    lines.push(`| ${check.name} | ${statusOf(check)} | ${duration} | ${summary} |`);
  }
  for (const check of results) {
    if (!check.skipped && check.exitCode !== 0 && check.failingRegion) {
      lines.push('', `### ${check.name} failing region (full log: ${check.logPath})`, check.failingRegion);
    }
  }
  lines.push('', `report: ${jsonPath}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`verify.js: ${String((err && err.stack) || err)}\n`);
  process.exitCode = 1;
});
