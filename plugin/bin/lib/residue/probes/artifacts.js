// bin/lib/residue/probes/artifacts.js — QA artifact retention (#1078).
// Two finding classes, both kind 'artifact', both scope 'observed' (repo
// housekeeping unattributable to the current run — never blast-radius, so
// /wrap-up's --scope blast-radius sweep deliberately never surfaces these;
// /tidy's default --scope repo does):
//   - aged artifact dir: a first-level entry under one of the three
//     .claude-tweaks/artifacts/ roots whose newest contained file (recursive;
//     the dir's own mtime when it contains no files, so empty dirs are not
//     immortal) is older than 30 days. remedy 'auto' — gitignored,
//     declared-transient evidence past its shelf life.
//   - legacy root residue: a project-root screenshots/ or traces/ tree (the
//     pre-#1077 convention). remedy 'auto' only when the same 30-day rule
//     passes; 'record' when anything fresher is inside — a trace captured the
//     day before the plugin update must surface for a human, not auto-delete.
// Per-root ENOENT is clean (a project that has only ever run /browse has no
// traces/ root); any OTHER read failure fails the whole probe loudly — a
// partial scan must never report as a clean sweep (sibling probes' contract).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { makeFinding } = require('../finding');
const { mainCheckoutRoot } = require('../../hooks/worktree-detect');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ARTIFACT_ROOTS = [
  path.join('.claude-tweaks', 'artifacts', 'screenshots', 'qa'),
  path.join('.claude-tweaks', 'artifacts', 'screenshots', 'browse'),
  path.join('.claude-tweaks', 'artifacts', 'traces'),
];
const LEGACY_ROOTS = ['screenshots', 'traces'];

// Recursive max file mtime (ms) under dir; null when it contains no files.
// Throws on any read error other than ENOENT — the caller turns that into
// the probe-level ran:false.
function newestFileMtimeMs(dir) {
  let newest = null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = newestFileMtimeMs(p);
      if (child !== null && (newest === null || child > newest)) newest = child;
    } else if (entry.isFile()) {
      const m = fs.statSync(p).mtimeMs;
      if (newest === null || m > newest) newest = m;
    }
  }
  return newest;
}

// Age basis for a directory: newest contained file, else the dir's own mtime.
function ageBasisMs(dir) {
  const newest = newestFileMtimeMs(dir);
  return newest !== null ? newest : fs.statSync(dir).mtimeMs;
}

function probeArtifacts({ cwd, now = Date.now() } = {}) {
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start) || start;
  const findings = [];
  const failed = [];

  for (const rel of ARTIFACT_ROOTS) {
    const base = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') continue; // per-root clean — never a probe failure
      failed.push(`${rel} (${(err && err.code) || err})`);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(base, entry.name);
      let basis;
      try {
        basis = ageBasisMs(dir);
      } catch (err) {
        failed.push(`${path.join(rel, entry.name)} (${(err && err.code) || err})`);
        continue;
      }
      const ageMs = now - basis;
      if (ageMs <= THIRTY_DAYS_MS) continue;
      findings.push(makeFinding({
        kind: 'artifact',
        scope: 'observed',
        subject: path.join(rel, entry.name),
        remedy: 'auto',
        evidence: `newest content ${Math.floor(ageMs / 86400000)}d old — aged past the 30-day retention window`,
      }));
    }
  }

  for (const rel of LEGACY_ROOTS) {
    const base = path.join(root, rel);
    let stat;
    try {
      stat = fs.statSync(base);
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      failed.push(`${rel} (${(err && err.code) || err})`);
      continue;
    }
    if (!stat.isDirectory()) continue;
    let basis;
    try {
      basis = ageBasisMs(base);
    } catch (err) {
      failed.push(`${rel} (${(err && err.code) || err})`);
      continue;
    }
    const aged = now - basis > THIRTY_DAYS_MS;
    findings.push(makeFinding({
      kind: 'artifact',
      scope: 'observed',
      subject: rel,
      remedy: aged ? 'auto' : 'record',
      evidence: aged
        ? 'pre-relocation artifact root, aged past the 30-day window — superseded by .claude-tweaks/artifacts/'
        : 'pre-relocation artifact root with content fresher than 30 days — superseded by .claude-tweaks/artifacts/; surface for human disposition, do not auto-delete',
    }));
  }

  if (failed.length) return { ran: false, reason: `could not read ${failed.join(', ')}`, findings: [] };
  return { ran: true, reason: null, findings };
}

module.exports = { probeArtifacts, THIRTY_DAYS_MS };
