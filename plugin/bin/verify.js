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
const { gitInfo, composeReport } = require('./lib/verify/report');
const { readStamp, detectRegression, caveatLine } = require('./lib/verify/count-stamp');
const { writeJsonAtomic } = require('./lib/verify/atomic-write');

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
  process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
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
  const git = gitInfo();

  // Suite-count regression stamp (#881, IL-84): the "tests" check's own
  // parsed count is compared against the previous run's persisted count.
  // --count-stamp is caller-resolved (verification.md Step 2), mirroring
  // --log-dir; omitting it disables persistence and comparison entirely.
  const testsCheck = results.find((c) => c.name === 'tests' && !c.skipped);
  const currentCount = testsCheck && testsCheck.counts && typeof testsCheck.counts.tests === 'number'
    ? { tests: testsCheck.counts.tests, sha: git.sha, recordedAt: startedAt }
    : null;
  let testCountRegression = null;
  if (parsed.countStamp) {
    const previousCount = readStamp(parsed.countStamp);
    testCountRegression = detectRegression(previousCount, currentCount);
    if (currentCount !== null) {
      // Fail-toward-absence on the write side too (readStamp already does
      // this on read): a stamp-write failure (ENOSPC, EACCES, a
      // --count-stamp path whose parent directory doesn't exist) must never
      // crash the whole run and discard an otherwise-passing report — this
      // is a caveat/surfacing mechanism, not a hard gate (count-stamp.js's
      // own stated intent). report.json's own write below is deliberately
      // unguarded: it IS the run's output, so a failure there must surface.
      try {
        fs.mkdirSync(path.dirname(parsed.countStamp), { recursive: true });
        writeJsonAtomic(parsed.countStamp, currentCount);
      } catch { /* best-effort persistence; next run simply has no baseline */ }
    }
  }

  const report = composeReport({
    checks: results, startedAt, durationMs: Date.now() - startMs, git, testCountRegression,
  });
  writeJsonAtomic(jsonPath, report);

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
  if (testCountRegression) lines.push('', caveatLine(testCountRegression));
  lines.push('', `report: ${jsonPath}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`verify.js: ${String((err && err.stack) || err)}\n`);
  process.exitCode = 1;
});
