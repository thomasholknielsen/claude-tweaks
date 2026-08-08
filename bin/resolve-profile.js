#!/usr/bin/env node
// bin/resolve-profile.js
//
// CLI wrapper around bin/lib/model-profiles — owns ALL I/O (policy read,
// frontier tally read/append). resolve() itself stays pure. Contract cited
// by dispatch sites: skills/_shared/subagent-output-contract.md §Model
// Selection.
'use strict';
const fs = require('fs');
const path = require('path');
const { resolve } = require('./lib/model-profiles/profiles');
const { parsePolicyModelConfig } = require('./lib/model-profiles/policy-fragment');

function fail(msg) {
  process.stderr.write(`resolve-profile: ${msg}\n`);
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  const profile = args.shift();
  if (!profile) fail('usage: resolve-profile.js <profile> [--stance <s>] [--unattended] [--run-dir <path>]');
  let stance;
  let unattended = false;
  let runDir;
  while (args.length) {
    const a = args.shift();
    if (a === '--stance') stance = args.shift();
    else if (a === '--unattended') unattended = true;
    else if (a === '--run-dir') runDir = args.shift();
    else fail(`unknown argument "${a}"`);
  }

  let policy = {};
  const policyPath = path.join(process.cwd(), '.claude-tweaks', 'policy.yml');
  if (fs.existsSync(policyPath)) {
    try {
      policy = parsePolicyModelConfig(fs.readFileSync(policyPath, 'utf8'));
    } catch (e) {
      fail(`malformed ${policyPath}: ${e.message}`);
    }
  }

  let frontierUsed = 0;
  const tallyPath = runDir ? path.join(runDir, 'frontier-tally.log') : null;
  if (tallyPath && fs.existsSync(tallyPath)) {
    frontierUsed = fs.readFileSync(tallyPath, 'utf8')
      .split('\n').filter((l) => l.startsWith('frontier\t')).length;
  }

  let result;
  try {
    result = resolve(profile, { policy, stance, unattended, frontierUsed });
  } catch (e) {
    fail(e.message);
  }

  if (tallyPath && result.model === 'fable') {
    fs.appendFileSync(tallyPath, `frontier\t${new Date().toISOString()}\n`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
