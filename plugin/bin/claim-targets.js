#!/usr/bin/env node
// bin/claim-targets.js — group-claim CLI on the shared claim store.
//   node bin/claim-targets.js --run-id <id> --targets <n,n,...> [--keep-going] [--help]
// Exit 0 = all claimed (or, with --keep-going, partial); 2 = malformed
// invocation or missing dependency; 3 = contested (holder JSON on stdout);
// 4 = transient gh failure. See bin/lib/claim-targets/claim-targets.js for
// the full contract and skills/_shared/issue-claims.md for the protocol.
'use strict';

const os = require('os');
const { execFileSync } = require('child_process');
const claimStore = require('./lib/issues/claim-store');
const { run } = require('./lib/claim-targets/claim-targets');

const GH_TIMEOUT_MS = 5000;

function defaultGh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT_MS,
  });
}

const realDeps = {
  ghApi: claimStore.defaultGhApi,
  gh: defaultGh,
  now: Date.now,
  stdout: (s) => process.stdout.write(`${s}\n`),
  stderr: (s) => process.stderr.write(s),
  hostname: os.hostname(),
  sessionId: process.env.CLAUDE_CODE_SESSION_ID || '',
};

module.exports = { run };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
