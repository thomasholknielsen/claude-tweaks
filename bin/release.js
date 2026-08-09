#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runRelease } = require('./lib/release/run.js');
const { appendShippedVersion } = require('./lib/shipped-record.js');

const USAGE = `Usage: node bin/release.js <minor|patch> "<summary>" [--dry-run]

Performs a complete release from a clean main: collision pre-check, manifest
bump, CHANGELOG stub, shipped-versions.tsv append (one commit), push, and
marketplace mirror. The default is a LIVE release; pass --dry-run to preview
every action without writing. Aborts loudly on any collision or divergence.`;

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); return 0; }
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  const [part, summary] = positional;
  if (!['minor', 'patch'].includes(part) || !summary) { console.error(USAGE); return 2; }

  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const deps = {
    repoRoot,
    git: (a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8' }),
    gh: (a) => execFileSync('gh', a, { cwd: repoRoot, encoding: 'utf8' }),
    readFile: (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8'),
    writeFile: (p, text) => fs.writeFileSync(path.join(repoRoot, p), text),
    appendShipped: appendShippedVersion,
    listPlanFiles: () => {
      const dir = path.join(repoRoot, 'docs/superpowers/plans');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join('docs/superpowers/plans', f));
    },
  };
  // readFile above resolves from repoRoot, but precheck's plan reads receive the
  // relative paths listPlanFiles returns — consistent by construction.
  const date = new Date().toISOString().slice(0, 10);
  try {
    const out = runRelease(deps, { part, summary, date, dryRun, log: (m) => console.log(m) });
    console.log(dryRun ? `[dry-run] v${out.version} — no changes written` : `released v${out.version}`);
    return 0;
  } catch (err) {
    console.error(String(err.message || err));
    return 1;
  }
}

process.exit(main(process.argv));
