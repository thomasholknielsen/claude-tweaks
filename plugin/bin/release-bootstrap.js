#!/usr/bin/env node
// bin/release-bootstrap.js — CLI for /claude-tweaks:init Step 21
// (bootstrap/step-21-release.md, #2253). Thin argv shell over
// bin/lib/init/release-bootstrap.js's bootstrapRelease: one JSON line on
// stdout, exit 0 on every verdict (conflict and skipped are outcomes the
// step reports, not failures), 2 on usage, 1 on an unexpected throw.
//
//   node bin/release-bootstrap.js --integration-model <pr-first|local-merge|unresolved> [--root <dir>] [--branch <name>] [--dry-run]
'use strict';

const { bootstrapRelease } = require('./lib/init/release-bootstrap');

const USAGE = 'usage: release-bootstrap.js --integration-model <pr-first|local-merge|unresolved> [--root <dir>] [--branch <name>] [--dry-run]\n';

function parseArgs(argv) {
  const opts = { root: process.cwd(), branch: 'main', dryRun: false, integrationModel: undefined, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--root') opts.root = argv[++i];
    else if (a === '--branch') opts.branch = argv[++i];
    else if (a === '--integration-model') opts.integrationModel = argv[++i];
    else return { error: `unknown argument: ${a}` };
  }
  if (!opts.help && opts.integrationModel === undefined) return { error: 'missing required --integration-model' };
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) { process.stderr.write(`${opts.error}\n${USAGE}`); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  try {
    const result = bootstrapRelease({ root: opts.root, integrationModel: opts.integrationModel, branch: opts.branch, dryRun: opts.dryRun });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`release-bootstrap: ${e && e.message ? e.message : String(e)}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs };
