#!/usr/bin/env node
// bin/blast-radius.js
//
// The gather step of assess-agent-autonomy's merge-check mode as ONE process
// (#888): merge-base resolution, `git diff --numstat` parsing, policy-config
// resolution (merge-sensitive-paths / auto-merge-max-lines /
// auto-merge-max-files), and classification via bin/lib/issues/blast-radius.js.
// A thin shell over bin/lib/blast-radius-cli.js#computeBlastRadius — no logic
// lives here. Zero runtime npm deps.
//
// Usage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]
// Success: exit 0, one JSON object {mergeBase, config, summary} on stdout.
// Any failure — unknown flag, missing/unresolvable base, git error — exits 1
// with a stderr message and NO stdout: a resolution failure must never be
// readable as a zero-file blast radius (the silent-approval hazard the
// retired shell choreography in merge-check.md carried).
'use strict';
const { computeBlastRadius, BlastRadiusError } = require('./lib/blast-radius-cli.js');

function fail(msg) {
  process.stderr.write(`blast-radius: ${msg}\n`);
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  while (args.length) {
    const arg = args.shift();
    const value = args.shift();
    if (value === undefined) return fail(`${arg} requires a value`);
    if (arg === '--base') opts.base = value;
    else if (arg === '--integration-branch') opts.integrationBranch = value;
    else if (arg === '--run') opts.runDir = value;
    else return fail(`unknown argument: ${arg}\nusage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]`);
  }
  if (!opts.base && !opts.integrationBranch) {
    return fail('usage: blast-radius.js (--base <ref> | --integration-branch <branch>) [--run <dir>]');
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
