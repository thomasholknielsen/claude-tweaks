#!/usr/bin/env node
// bin/ports.js — CLI over the port-isolation lease registry (#1791).
//   node bin/ports.js allocate [--path P] [--services a,b,c]
//   node bin/ports.js status   [--path P]
//   node bin/ports.js release  [--path P]
//   node bin/ports.js env      [--path P]
// See bin/lib/ports/cli.js for argv handling and exit codes.
'use strict';

const { run } = require('./lib/ports/cli');

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = { run };
