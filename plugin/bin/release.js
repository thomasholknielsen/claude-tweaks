#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runRelease } = require('./lib/release/run.js');
const { releaseStatus, formatStatusLine, formatBackfillSection, isBadRefValue, CHANGELOG } = require('./lib/release/status.js');
const { appendShippedVersion } = require('./lib/shipped-record.js');

const USAGE = `Usage: node plugin/bin/release.js <minor|patch> "<summary>" [--dry-run]
       node plugin/bin/release.js status --merge <sha> --records <n>[,<m>...] [--ref <ref>] [--json] [--backfill]

Performs a complete release from a clean main: collision pre-check, manifest
bump, CHANGELOG stub, shipped-versions.tsv append (one commit), push, and
marketplace mirror. The default is a LIVE release; pass --dry-run to preview
every action without writing. Aborts loudly on any collision or divergence.

status: reports which release (if any) already carries a merge commit — the
oldest version bump reachable from --ref (default HEAD) that has --merge as an
ancestor — and which of the given record numbers that version's CHANGELOG entry
fails to name. Prints one human line ("not yet in a release — bump pending" /
"already carried by vX.Y.Z — CHANGELOG backfill needed: #A"), or the JSON
result with --json, or the "### also carried in this build" subsection text
with --backfill (empty when nothing is missing). Never calls gh; never guesses
record numbers. Exit 0 on any resolved status, 2 on usage, 1 on a git failure.`;

function parseStatusArgs(args) {
  const opts = { ref: 'HEAD', json: false, backfill: false, merge: null, records: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') opts.json = true;
    else if (a === '--backfill') opts.backfill = true;
    else if (a === '--merge') { opts.merge = args[++i]; if (isBadRefValue(opts.merge)) return null; }
    else if (a === '--ref') { opts.ref = args[++i]; if (isBadRefValue(opts.ref)) return null; }
    else if (a === '--records') {
      opts.records = String(args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    } else return null;
  }
  if (!opts.merge || !opts.records || opts.records.length === 0 || !opts.records.every((n) => Number.isInteger(n) && n > 0)) return null;
  return opts;
}

function status(args) {
  const opts = parseStatusArgs(args);
  if (!opts) { console.error(USAGE); return 2; }
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const git = (a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    // Validate that the merge commit exists before proceeding. Plain `git rev-parse <sha>`
    // echoes any syntactically valid 40-hex string and exits 0 even when the object doesn't
    // exist — `--verify --quiet <sha>^{commit}` is the form that actually fails on a bad sha.
    git(['rev-parse', '--verify', '--quiet', `${opts.merge}^{commit}`]);
    const deps = {
      git,
      // Read the CHANGELOG at the ref being judged, not the working tree — a backfill
      // already on origin/main counts even before the local checkout catches up.
      readFile: (p) => (p === CHANGELOG ? git(['show', `${opts.ref}:${CHANGELOG}`]) : fs.readFileSync(path.join(repoRoot, p), 'utf8')),
    };
    const result = releaseStatus(deps, { ref: opts.ref, merge: opts.merge, records: opts.records });
    if (opts.json) console.log(JSON.stringify(result));
    else if (opts.backfill) process.stdout.write(formatBackfillSection(result, { merge: opts.merge }));
    else console.log(formatStatusLine(result));
    return 0;
  } catch (err) {
    console.error(String(err.message || err));
    return 1;
  }
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); return 0; }
  if (args[0] === 'status') return status(args.slice(1));
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
