// plugin/bin/lib/verify/report.js — report.json composition + atomic write
// (#892 AC3). The atomic write is load-bearing: a crashed run must never
// leave a half-written report.json a downstream gate reads as pass evidence.
// gitInfo fails toward null — sha alone is not proof on a dirty tree, which
// is why dirty rides alongside it.
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

function gitInfo(execImpl = execFileSync) {
  let sha = null;
  let dirty = null;
  try {
    sha = String(execImpl('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim();
  } catch {
    return { sha: null, dirty: null };
  }
  try {
    dirty = String(execImpl('git', ['status', '--porcelain'], { encoding: 'utf8' })).trim() !== '';
  } catch {
    dirty = null;
  }
  return { sha, dirty };
}

function entryFor(check) {
  if (check.skipped) return { command: check.command, skipped: check.skipped };
  const entry = {
    command: check.command,
    exitCode: check.exitCode,
    durationMs: check.durationMs,
    logPath: check.logPath,
    summary: check.summary === undefined ? null : check.summary,
    failingRegion: check.failingRegion === undefined ? null : check.failingRegion,
  };
  if (check.spawnError !== undefined) entry.spawnError = check.spawnError;
  if (check.counts !== undefined && check.counts !== null) entry.counts = check.counts;
  return entry;
}

function composeReport({ checks, startedAt, durationMs, git }) {
  const byName = {};
  for (const check of checks) byName[check.name] = entryFor(check);
  const pass = checks
    .filter((c) => !c.skipped)
    .every((c) => c.exitCode === 0);
  return {
    sha: git.sha, dirty: git.dirty,
    startedAt, durationMs, pass,
    checks: byName,
  };
}

function writeReportAtomic(report, jsonPath, fsImpl = fs) {
  const tmpPath = `${jsonPath}.tmp`;
  fsImpl.writeFileSync(tmpPath, `${JSON.stringify(report, null, 2)}\n`);
  fsImpl.renameSync(tmpPath, jsonPath);
}

module.exports = { gitInfo, composeReport, writeReportAtomic };
