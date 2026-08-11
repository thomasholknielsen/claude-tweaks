#!/usr/bin/env node
// bin/resolve-policy.js
//
// The canonical read path for .claude-tweaks/policy.yml and pipeline-run
// config.yml overlays (#329). A thin shell — argument parsing plus file
// reads over two library calls: bin/lib/policy-schema.js#resolvePolicyKeys
// (all precedence/alias/validation logic) and
// bin/lib/model-profiles/policy-fragment.js#parsePolicyModelConfig (the one
// nested-block key). No resolution logic lives here. Zero runtime npm deps.
//
// Usage: resolve-policy.js [--run <dir>] <key> [<key>…]
// Output: one JSON object on stdout keyed by requested name; per-key errors
// ({"error": "unknown-key"}) are data (exit 0). Invocation failures — zero
// keys, or a --run dir that does not exist — exit 1 with a stderr message
// and no JSON. Repo root comes from `git rev-parse --show-toplevel` at the
// process cwd (cwd itself outside a git repo) — never from
// CLAUDE_PLUGIN_ROOT (observed unset in Bash tool environments, #170) and
// never from a positional path argument.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolvePolicyKeys } = require('./lib/policy-schema');
const { parsePolicyModelConfig } = require('./lib/model-profiles/policy-fragment');

function fail(msg) {
  process.stderr.write(`resolve-policy: ${msg}\n`);
  process.exit(1);
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return process.cwd();
  }
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function main(argv) {
  const args = argv.slice(2);
  let runDir = null;
  const keys = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--run') {
      const value = args.shift();
      if (value === undefined || value.startsWith('--')) {
        fail('--run requires a value');
        return;
      }
      runDir = value;
    } else {
      keys.push(arg);
    }
  }
  if (keys.length === 0) {
    fail('usage: resolve-policy.js [--run <dir>] <key> [<key>…]');
    return;
  }
  if (runDir !== null && !fs.existsSync(runDir)) {
    fail(`--run dir does not exist: ${runDir}`);
    return;
  }

  const policyRaw = readFileSafe(path.join(repoRoot(), '.claude-tweaks', 'policy.yml'));
  // A run dir without a config.yml is not an error — the Manifesto may not
  // have written one yet; readFileSafe's null simply means no overlay.
  const runConfigRaw = runDir === null ? null : readFileSafe(path.join(runDir, 'config.yml'));

  const result = resolvePolicyKeys(keys, { policyRaw, runConfigRaw });

  // model-profiles is the one block-style key — policy-only (the --run
  // overlay never applies; run configs hold flat lever lines, not nested
  // blocks). Overwrite the flat resolver's placeholder entry via the
  // dedicated fragment reader.
  if (keys.includes('model-profiles')) {
    try {
      const parsed = parsePolicyModelConfig(policyRaw);
      result['model-profiles'] = Object.prototype.hasOwnProperty.call(parsed, 'model-profiles')
        ? { value: parsed['model-profiles'], source: 'policy' }
        : { value: null, source: 'default' };
    } catch {
      // Malformed block: same present-but-rejected carve-out as flat keys.
      // The key has no schema default — null is the documented absent shape.
      result['model-profiles'] = { value: null, source: 'default', invalid: true };
    }
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
