#!/usr/bin/env node
// bin/wrap-up-state.js — emit the wrap-up State block and the history operations
// in scope, read from git rather than recalled.
//
// Exit codes: 0 for any successful render INCLUDING a degraded one (fields render
// `unknown`); 2 only for a malformed invocation. A degraded read must never cost
// the caller the whole report.
'use strict';

const { execFileSync } = require('node:child_process');
const { readState } = require('./lib/wrap-up/state');
const { historyOps } = require('./lib/wrap-up/reflog');
const { renderState } = require('./lib/wrap-up/render');

function parseArgs(argv) {
  const out = { since: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since' && i + 1 < argv.length) { out.since = argv[i + 1]; i += 1; continue; }
    if (argv[i] === '--json') { out.json = true; continue; }
  }
  return out;
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function main() {
  const { since, json } = parseArgs(process.argv.slice(2));
  if (!since) {
    process.stderr.write('usage: wrap-up-state.js --since <base-sha|iso-datetime> [--json]\n');
    process.exit(2);
  }
  const cwd = process.cwd();

  // Resolve the boundary to a datetime for --since, and echo the base back so a
  // wrong base is visible in the rendered block rather than silently narrowing
  // the window. A bare date would land on 1970-01-01 for a zero timestamp and
  // return nothing in positive-UTC-offset zones, so always pass a full ISO
  // 8601 datetime to git.
  const sinceDate = git(['show', '-s', '--format=%cI', since], cwd) || since;

  const state = readState({ cwd, since });
  const head = git(['reflog', '--date=iso', `--since=${sinceDate}`], cwd) || '';
  const upstreamRef = state.upstream;
  const remote = upstreamRef
    ? git(['reflog', 'show', upstreamRef, '--date=iso', `--since=${sinceDate}`], cwd) || ''
    : '';
  const ops = [...historyOps(head), ...historyOps(remote)];

  if (json) {
    process.stdout.write(`${JSON.stringify({ state, ops, since, sinceDate }, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderState({ state, ops, since, sinceDate })}\n`);
  }
}

main();
