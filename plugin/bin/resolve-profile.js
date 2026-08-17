#!/usr/bin/env node
// bin/resolve-profile.js
//
// CLI wrapper around bin/lib/model-profiles — owns ALL I/O (policy read,
// frontier tally read/append, session-scoped model-failure blacklist
// read/write). resolve() itself stays pure. Contract cited by dispatch
// sites: skills/_shared/subagent-output-contract.md §Model Selection.
//
// Session-failure blacklist (#763): every normal `<profile>` resolution
// reads the CLAUDE_CODE_SESSION_ID-keyed blacklist
// (bin/lib/model-profiles/session-failures.js) and passes it to resolve()
// as `failedModels`, so a model that already failed with a credit/usage
// exhaustion error this session is never re-resolved. A dispatch site that
// observes such a failure records it via:
//
//   node bin/resolve-profile.js record-failure <model>
//
// before retrying or reporting — see subagent-output-contract.md's Model
// Selection section for when to call this.
'use strict';
const fs = require('fs');
const path = require('path');
const { resolve, PROFILES } = require('./lib/model-profiles/profiles');
const { parsePolicyModelConfig } = require('./lib/model-profiles/policy-fragment');
const { readFailedModels, recordFailure } = require('./lib/model-profiles/session-failures');

function fail(msg) {
  process.stderr.write(`resolve-profile: ${msg}\n`);
  process.exit(1);
}

// A value-taking flag must be followed by a value. Without this, `--stance`
// at end-of-args resolves as if the flag were absent, and `--stance
// --unattended` eats the next flag as the stance — both silent.
function requireValue(args, flag) {
  const v = args.shift();
  if (v === undefined || v.startsWith('--')) fail(`${flag} requires a value`);
  return v;
}

function main(argv) {
  const args = argv.slice(2);
  const profile = args.shift();
  if (!profile) {
    fail('usage: resolve-profile.js <profile>|record-failure <model> [--stance <s>] [--unattended] [--run-dir <path>]');
    return;
  }

  if (profile === 'record-failure') {
    const model = args.shift();
    if (!model) { fail('record-failure requires a model name'); return; }
    const validModels = Object.values(PROFILES).map((p) => p.model);
    if (!validModels.includes(model)) {
      fail(`record-failure: "${model}" is not a known model family alias — valid options: ${validModels.join(', ')}`);
      return;
    }
    const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
    if (!sessionId) { fail('record-failure requires CLAUDE_CODE_SESSION_ID to be set — nothing recorded'); return; }
    recordFailure(sessionId, model);
    process.stdout.write(`${JSON.stringify({ recorded: true, model, sessionId })}\n`);
    return;
  }

  let stance;
  let unattended = false;
  let runDir;
  while (args.length) {
    const a = args.shift();
    if (a === '--stance') stance = requireValue(args, '--stance');
    else if (a === '--unattended') unattended = true;
    else if (a === '--run-dir') runDir = requireValue(args, '--run-dir');
    else { fail(`unknown argument "${a}"`); return; }
  }

  let policy = {};
  const policyPath = path.join(process.cwd(), '.claude-tweaks', 'policy.yml');
  if (fs.existsSync(policyPath)) {
    try {
      policy = parsePolicyModelConfig(fs.readFileSync(policyPath, 'utf8'));
    } catch (e) {
      fail(`malformed ${policyPath}: ${e.message}`);
      return;
    }
  }

  let frontierUsed = 0;
  const tallyPath = runDir ? path.join(runDir, 'frontier-tally.log') : null;
  if (tallyPath && fs.existsSync(tallyPath)) {
    frontierUsed = fs.readFileSync(tallyPath, 'utf8')
      .split('\n').filter((l) => l.startsWith('frontier\t')).length;
  }

  const failedModels = readFailedModels(process.env.CLAUDE_CODE_SESSION_ID);

  let result;
  try {
    result = resolve(profile, { policy, stance, unattended, frontierUsed, failedModels });
  } catch (e) {
    fail(e.message);
    return;
  }

  // The read side degrades to 0 on a missing tally, but the append cannot
  // degrade: a run-dir that does not exist throws ENOENT, and an uncaught
  // throw here is a raw stack trace on stderr. Failing loud is right — a lost
  // append silently under-counts the frontier cap on every later resolution.
  if (tallyPath && result.model === 'fable') {
    try {
      fs.appendFileSync(tallyPath, `frontier\t${new Date().toISOString()}\n`);
    } catch (e) {
      fail(`cannot append frontier tally: ${e.message}`);
      return;
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
