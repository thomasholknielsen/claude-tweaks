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
// Usage: resolve-policy.js [--values] [--run <dir>] <key> [<key>…]
// Output: one JSON object on stdout keyed by requested name — or, with
// --values, one plain value per line in request order (scalar mode for shell
// captures; empty line for unset-no-default and error entries; not valid for
// model-profiles). Per-key errors
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
  let valuesMode = false;
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
    } else if (arg === '--values') {
      valuesMode = true;
    } else {
      keys.push(arg);
    }
  }
  if (keys.length === 0) {
    fail('usage: resolve-policy.js [--values] [--run <dir>] <key> [<key>…]');
    return;
  }
  if (valuesMode && keys.includes('model-profiles')) {
    // The one nested-block key has no scalar form.
    fail('--values does not support model-profiles (no scalar form) — use the JSON output');
    return;
  }
  if (runDir !== null) {
    let isDirectory = false;
    try {
      isDirectory = fs.statSync(runDir).isDirectory();
    } catch {}
    if (!isDirectory) {
      // A file path (e.g. the config.yml itself) must fail loud here, not
      // degrade to a silent no-overlay with policy-source answers.
      fail(`--run dir does not exist or is not a directory: ${runDir}`);
      return;
    }
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
      // Any fragment-reader throw lands here — a malformed block, but also a
      // malformed sibling model key (e.g. frontier-run-cap), since the reader
      // parses all four model keys and its throws aren't sub-classified. Same
      // present-but-rejected carve-out as flat keys; the key has no schema
      // default — null is the documented absent shape.
      result['model-profiles'] = { value: null, source: 'default', invalid: true };
    }
  }

  if (valuesMode) {
    // Scalar mode for shell-variable capture at prose read sites: one value
    // per line, request order. An {error} entry and a null value (no-default
    // key unset) both print an empty line — mirroring the empty string the
    // retired grep-pipeline idiom produced for an absent key.
    const lines = keys.map((key) => {
      const entry = result[key];
      if (!entry || entry.error !== undefined || entry.value === null || entry.value === undefined) return '';
      return String(entry.value);
    });
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
