'use strict';

// Context-cost measurement for the shipped skill payload.
//
// A SKILL.md loads in full on every invocation, and once per dispatched subagent.
// Bloat here is invisible until someone measures it by hand — which is how the
// corpus reached 931 KB before anyone looked. Phases 1-3 removed ~150 KB; this
// module exists so the next 150 KB does not accumulate unnoticed.
//
// The ceiling is CLAUDE.md's own 40 KB soft ceiling per SKILL.md. After the
// Phase 3 extraction several files sit within a kilobyte of it, so a regression
// is one added paragraph away — which is precisely when an automated check earns
// its keep over periodic manual measurement.

const fs = require('node:fs');
const path = require('node:path');

const CEILING_BYTES = 40 * 1024;

function skillsDir(repoRoot) {
  return path.join(repoRoot, 'skills');
}

// Every SKILL.md, with its size. This is the per-invocation payload: sub-files
// are lazy-loaded and deliberately excluded.
function measureSkills(repoRoot) {
  const dir = skillsDir(repoRoot);
  return fs
    .readdirSync(dir)
    .filter((n) => fs.existsSync(path.join(dir, n, 'SKILL.md')))
    .sort()
    .map((name) => {
      const file = path.join(dir, name, 'SKILL.md');
      return { name, bytes: fs.statSync(file).size };
    });
}

// Sub-files are not free either: a stub that cites one costs the whole file when
// read, so a sub-file over the ceiling is the same defect one level down. This is
// the shape that let init/bootstrap-steps.md reach 86 KB behind 18 stubs (IL-70).
function measureSubFiles(repoRoot) {
  const dir = skillsDir(repoRoot);
  const out = [];
  const walk = (d, skill) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p, skill); continue; }
      if (!e.name.endsWith('.md') || e.name === 'SKILL.md') continue;
      out.push({ skill, file: path.relative(dir, p), bytes: fs.statSync(p).size });
    }
  };
  for (const name of fs.readdirSync(dir)) {
    const sd = path.join(dir, name);
    if (!fs.statSync(sd).isDirectory()) continue;
    walk(sd, name);
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

function overCeiling(entries) {
  return entries.filter((e) => e.bytes > CEILING_BYTES);
}

function totalBytes(entries) {
  return entries.reduce((sum, e) => sum + e.bytes, 0);
}

// Headroom is the story the raw size does not tell: a file at 39.9 KB is one
// paragraph from breaching, and reporting it as "under the ceiling" hides that.
function headroom(entry) {
  return CEILING_BYTES - entry.bytes;
}

module.exports = {
  CEILING_BYTES,
  measureSkills,
  measureSubFiles,
  overCeiling,
  totalBytes,
  headroom,
};
