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
    else if (a === '--fetch-limit') args.fetchLimit = Number(argv[++i]);
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
    process.exit(2);
  }
  if (args.format !== 'd2' && args.format !== 'svg') {
    process.stderr.write('render: --format must be "d2" or "svg"\n');
    process.exit(2);
  }
  if (args.workLinks !== 'native' && args.workLinks !== 'body-text') {
    process.stderr.write('render: --work-links must be "native" or "body-text"\n');
    process.exit(2);
  }
  const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const truncated = Number.isFinite(args.fetchLimit) && records.length === args.fetchLimit;
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
  process.exit(2);
}

main();
