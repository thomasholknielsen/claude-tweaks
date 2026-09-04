#!/usr/bin/env node
// plugin/bin/plan-audit.js — mechanized plan audit (#903): Checks A/B/C plus
// a size-headroom check, replacing the hand-run prose procedure that used to
// live entirely in plugin/skills/build/plan-audit.md. Exit 0 iff every check
// is ok (a `nearCeiling` headroom flag alone does not fail).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parseArgs, UsageError, USAGE } = require('./lib/plan-audit/args');
const {
  extractFileEntries, extractScopeKeywords, extractVerificationChecks,
} = require('./lib/plan-audit/parser');
const { checkA, checkB, checkC, headroomCheck } = require('./lib/plan-audit/checks');

function resolveRepoRoot(explicit, cwd) {
  if (explicit) return path.resolve(explicit);
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return cwd;
  }
}

function summaryLine(report) {
  const parts = [];
  if (!report.checkA.ok) parts.push(`Check A: ${report.checkA.missing.length} missing path(s)`);
  if (!report.checkB.ok) parts.push(`Check B: ${report.checkB.unplanned.length} unplanned file(s)`);
  if (!report.checkC.ok) parts.push(`Check C: ${report.checkC.findings.length} non-discriminating command(s)`);
  if (!report.headroom.ok) parts.push(`Headroom: ${report.headroom.breaches.length} breach(es)`);
  if (report.headroom.nearCeiling.length) parts.push(`Headroom: ${report.headroom.nearCeiling.length} near-ceiling`);
  if (parts.length === 0) return 'plan-audit: clean — no findings.';
  return `plan-audit: ${parts.join('; ')}.`;
}

function main() {
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

  let text;
  try {
    text = fs.readFileSync(parsed.planFile, 'utf8');
  } catch (err) {
    process.stderr.write(`plan-audit.js: cannot read plan file ${parsed.planFile}: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  const repoRoot = resolveRepoRoot(parsed.repoRoot, process.cwd());
  const entries = extractFileEntries(text);
  const scopeKeywords = extractScopeKeywords(text);
  const verificationChecks = extractVerificationChecks(text);

  const report = {
    checkA: checkA(entries, repoRoot),
    checkB: checkB(scopeKeywords, entries.map((e) => e.path), repoRoot),
    checkC: checkC(verificationChecks, repoRoot),
    headroom: headroomCheck(entries, repoRoot),
  };

  // Compact JSON on its own first line (never pretty-printed — a caller
  // parsing stdout takes JSON.parse(stdout.split('\n')[0])), then the
  // human summary line.
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.stdout.write(`${summaryLine(report)}\n`);

  const pass = report.checkA.ok && report.checkB.ok && report.checkC.ok && report.headroom.ok;
  process.exitCode = pass ? 0 : 1;
}

main();
