#!/usr/bin/env node
// bin/merge-size-probe.js
//
// Predicts, via `git merge-tree --write-tree`, whether merging the current
// branch into an integration branch (default `main`) would push any
// branch-touched `skills/_shared/*.md` / `SKILL.md` file over the 40 KB
// per-invocation ceiling (#641) -- the failure mode the in-tree-only checks
// in skill-audit/context-cost.js structurally cannot see: each branch is
// green alone, and the overflow only exists in the merged result.
//
// A thin shell over bin/lib/merge-size-probe.js#computeMergeSizeOverflow --
// argv parsing lives here; the git plumbing does not. Zero runtime npm deps.
//
// Usage: merge-size-probe.js [--integration-branch <branch>] [--head <ref>]
// Success: exit 0, one JSON object {mergedTree, measured, overflow} on
// stdout, whether or not overflow is non-empty -- overflow is data for the
// caller to act on (log + surface), never this CLI's own failure. A probe
// failure (unresolvable ref, a real merge conflict) exits 1 with a stderr
// message and NO stdout, matching bin/blast-radius.js's contract: a
// resolution failure must never be readable as a clean zero-overflow result.
'use strict';
const { computeMergeSizeOverflow, MergeSizeProbeError } = require('./lib/merge-size-probe.js');

const USAGE = 'usage: merge-size-probe.js [--integration-branch <branch>] [--head <ref>]';

function fail(msg) {
  const firstLine = String(msg).split('\n')[0];
  process.stderr.write(`merge-size-probe: ${firstLine}\n`);
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  while (args.length) {
    const arg = args.shift();
    if (arg === '--help') {
      process.stdout.write(`${USAGE}\n`);
      return;
    }
    const value = args.shift();
    if (value === undefined) return fail(`${arg} requires a value`);
    switch (arg) {
      case '--integration-branch': opts.integrationBranch = value; break;
      case '--head': opts.headRef = value; break;
      default: return fail(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  let result;
  try {
    result = computeMergeSizeOverflow(opts);
  } catch (err) {
    if (err instanceof MergeSizeProbeError) return fail(err.message);
    throw err;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
