#!/usr/bin/env node
// bin/residue.js — compute outstanding residue at close time.
//
// Exit codes: 0 for any successful render INCLUDING a degraded one; 2 only
// for a malformed invocation. Copies bin/wrap-up-state.js's contract — a
// degraded read must never cost the caller the whole report.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { resolveScope } = require('./lib/residue/scope');
const { probeWorktrees } = require('./lib/residue/probes/worktrees');
const { probeBranches } = require('./lib/residue/probes/branches');
const { probeForge } = require('./lib/residue/probes/forge');
const { probeClaims } = require('./lib/residue/probes/claims');
const { probeSuite } = require('./lib/residue/probes/suite');
const { probeRelease } = require('./lib/residue/probes/release');
const { renderOutstanding } = require('./lib/residue/render');

function parseArgs(argv) {
  const out = { base: null, scope: 'blast-radius', integrationBranch: 'origin/main', json: false, noSuite: false };
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === '--base' && next && !next.startsWith('--')) { out.base = next; i += 1; continue; }
    if (argv[i] === '--scope' && next && !next.startsWith('--')) { out.scope = next; i += 1; continue; }
    if (argv[i] === '--integration-branch' && next && !next.startsWith('--')) { out.integrationBranch = next; i += 1; continue; }
    if (argv[i] === '--json') { out.json = true; continue; }
    if (argv[i] === '--no-suite') { out.noSuite = true; continue; }
  }
  return out;
}

function runner(cwd) {
  return (argv) => {
    try {
      return execFileSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.base) {
    process.stderr.write('usage: residue.js --base <commit-ish> [--scope blast-radius|repo] [--integration-branch <ref>] [--no-suite] [--json]\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  const run = runner(cwd);
  const git = (args) => run(['git', ...args]);
  const scope = resolveScope({ base: opts.base, run: git });

  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(cwd, '.claude-plugin', 'plugin.json'), 'utf8'));
  } catch { /* absent manifest is normal outside this plugin */ }

  const suiteRun = opts.noSuite
    ? () => null
    : () => {
      try {
        return { code: 0, stdout: execFileSync('npm', ['test'], { cwd, encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'ignore'] }) };
      } catch (err) {
        if (err && err.killed) return { code: null, stdout: '', timedOut: true };
        if (err && typeof err.status === 'number') return { code: err.status, stdout: String(err.stdout || '') };
        return null;
      }
    };

  // NOTE the runner shapes differ and are NOT interchangeable. probeBranches
  // calls run(['branch', ...]) — bare git args, so it gets the `git` wrapper.
  // probeRelease calls run(['git', 'show', ...]) — full argv including the
  // executable — so it gets the raw `run`, like probeForge/probeClaims.
  // Passing `git` here yields `git git show …`, and the probe then reports
  // ran:false on every invocation of a perfectly healthy repo.
  const results = [
    probeWorktrees({ scope }),
    probeBranches({ scope, integrationBranch: opts.integrationBranch, run: git }),
    probeForge({ scope, run }),
    probeClaims({ scope, run }),
    probeSuite({ scope, run: suiteRun }),
    probeRelease({ scope, manifest, run }),
  ];

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ scope, results }, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderOutstanding({ results })}\n`);
  }
}

main();
