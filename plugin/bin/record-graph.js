#!/usr/bin/env node
// record-graph CLI: render — the only command. Reads an already-fetched
// faceted-record JSON file (produced by _shared/record-queue-fetch.md's
// existing fetch procedure) and deterministically emits D2 or SVG source.
// No gh/network I/O happens in this file — see bin/lib/record-graph/*.js.
'use strict';

const fs = require('fs');
const { buildGraph } = require('./lib/record-graph/layout');
const { renderD2 } = require('./lib/record-graph/render-d2');
const { renderSvg } = require('./lib/record-graph/render-svg');

function parseArgs(argv) {
  const args = { _: [], generatedAt: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') args.format = argv[++i];
    else if (a === '--work-links') args.workLinks = argv[++i];
    // Kept as the raw string so cmdRender can tell "flag absent" (fine — truncation
    // detection is simply off) apart from "flag present but unparseable" (an error).
    else if (a === '--fetch-limit') args.fetchLimitRaw = String(argv[++i]);
    else if (a === '--generated-at') args.generatedAt = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else args._.push(a);
  }
  return args;
}

function cmdRender(args) {
  const jsonPath = args._[0];
  if (!jsonPath) {
    process.stderr.write('render: missing <faceted-json-path>\n');
    process.exitCode = 2;
    return;
  }
  if (args.format !== 'd2' && args.format !== 'svg') {
    process.stderr.write('render: --format must be "d2" or "svg"\n');
    process.exitCode = 2;
    return;
  }
  if (args.workLinks !== 'native' && args.workLinks !== 'body-text') {
    process.stderr.write('render: --work-links must be "native" or "body-text"\n');
    process.exitCode = 2;
    return;
  }
  let fetchLimit;
  if (args.fetchLimitRaw !== undefined) {
    fetchLimit = Number(args.fetchLimitRaw);
    if (!Number.isFinite(fetchLimit)) {
      process.stderr.write(`render: --fetch-limit must be a number (got "${args.fetchLimitRaw}")\n`);
      process.exitCode = 2;
      return;
    }
  }
  let records;
  try {
    records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`render: could not read faceted-record JSON at ${jsonPath} — ${e.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (!Array.isArray(records)) {
    process.stderr.write(`render: expected an array of faceted records at ${jsonPath}\n`);
    process.exitCode = 2;
    return;
  }
  const truncated = Number.isFinite(fetchLimit) && records.length === fetchLimit;
  const graph = buildGraph(records, { workLinks: args.workLinks, truncated });
  const output = args.format === 'd2'
    ? renderD2(graph, { generatedAt: args.generatedAt })
    : renderSvg(graph, { generatedAt: args.generatedAt });

  if (args.out) {
    fs.writeFileSync(args.out, output);
    const omitted = graph.edgesOmitted ? ', edges omitted' : '';
    process.stderr.write(`render: wrote ${args.out} (${records.length} records, ${graph.edges.length} edges${omitted})\n`);
  } else {
    process.stdout.write(output);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  if (cmd === 'render') {
    cmdRender(args);
    return;
  }
  process.stderr.write(`record-graph: unknown command "${cmd}" (expected: render)\n`);
  process.exitCode = 2;
}

main();
