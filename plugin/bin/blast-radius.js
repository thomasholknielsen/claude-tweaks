#!/usr/bin/env node
// bin/blast-radius.js
//
// The gather step of assess-agent-autonomy's merge-check mode as ONE process
// (#888): merge-base resolution, `git diff --numstat` parsing, policy-config
// resolution (merge-sensitive-paths / auto-merge-max-lines /
// auto-merge-max-files), and classification via bin/lib/issues/blast-radius.js.
// A thin shell over bin/lib/blast-radius-cli.js#computeBlastRadius — argv
// parsing and --run path validation live here; the actual gather logic does
// not. Zero runtime npm deps.
//
// Usage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]
// Success: exit 0, one JSON object {mergeBase, config, summary} on stdout.
// Any failure — unknown flag, missing/unresolvable base, git error — exits 1
// with a stderr message and NO stdout: a resolution failure must never be
// readable as a zero-file blast radius (the silent-approval hazard the
// retired shell choreography in merge-check.md carried).
'use strict';
const fs = require('fs');
const { computeBlastRadius, BlastRadiusError } = require('./lib/blast-radius-cli.js');

const USAGE = 'usage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]';

function fail(msg) {
  const firstLine = String(msg).split('\n')[0];
  process.stderr.write(`blast-radius: ${firstLine}\n`);
  process.exitCode = 1;
}

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  while (args.length) {
    const arg = args.shift();
    const value = args.shift();
    if (value === undefined) return fail(`${arg} requires a value`);
    switch (arg) {
      case '--base': opts.base = value; break;
      case '--integration-branch': opts.integrationBranch = value; break;
      case '--run': opts.runDir = value; break;
      default: return fail(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  if (!opts.base && !opts.integrationBranch) return fail(USAGE);
  if (opts.runDir !== undefined && !isDirectory(opts.runDir)) {
    return fail(`--run dir does not exist or is not a directory: ${opts.runDir}`);
  }
  let result;
  try {
    result = computeBlastRadius(opts);
  } catch (err) {
    if (err instanceof BlastRadiusError) return fail(err.message);
    throw err;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
