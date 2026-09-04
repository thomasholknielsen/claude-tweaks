#!/usr/bin/env node
// bin/visual-decide.js — zero-dependency local server primitive for browser-based
// decision capture. `start --dir <content> --state <state-dir> [--port <n>]
// [--idle-minutes <n=240>]`, `stop --state <state-dir>`, `status --state <state-dir>`.
// See plugin/bin/lib/visual-decide/ for the implementation (#1202).
'use strict';

const cli = require('./lib/visual-decide/cli.js');

cli.main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`visual-decide: ${err.message}\n`);
  process.exitCode = 1;
});
