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
// Usage: resolve-policy.js [--values | --all] [--run <dir>] <key> [<key>…]
// Output: one JSON object on stdout keyed by requested name — or, with
// --values, one plain value per line in request order (scalar mode for shell
// captures; empty line for unset-no-default and error entries; not valid for
// model-profiles). --all emits every POLICY_KEYS entry, each decorated with
// its schema metadata (summary/category/tier/type/default); mutually
// exclusive with --values and takes no key arguments. Per-key errors
// ({"error": "unknown-key"}) are data (exit 0). Invocation failures — zero
// keys, a --run dir that does not exist, or a --run path that resolves
// inside a checkout other than the main checkout (#1065's anchored-or-outside
// guard) — exit 1 with a stderr message and no JSON. Repo root comes from
// `git rev-parse --show-toplevel` at the process cwd (cwd itself outside a
// git repo) — never from
// CLAUDE_PLUGIN_ROOT (observed unset in Bash tool environments, #170) and
// never from a positional path argument.
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const { detectIntegrationModel, POLICY_KEYS, resolvePolicyConfig } = require('./lib/policy-schema');
const { deriveMergeVerification } = require('./lib/merge-verification');
const { parsePolicyModelConfig } = require('./lib/model-profiles/policy-fragment');
const { anchoredOrOutsideMessage } = require('./lib/run-dir-guard');

function fail(msg) {
  process.stderr.write(`resolve-policy: ${msg}\n`);
  process.exitCode = 1;
}

function gitRoot(args) {
  return execFileSync('git', args, {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });
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
  let allMode = false;
  const keys = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--run') {
      const value = args.shift();
      // A blank or whitespace-only value (the shape an unset
      // $PIPELINE_RUN_DIR expands to in shell) is rejected the same as a
      // genuinely missing one — it must never reach the --run anchoring
      // check below as a blank string (#1138).
      if (value === undefined || value.startsWith('--') || value.trim() === '') {
        fail('--run requires a value');
        return;
      }
      runDir = value;
    } else if (arg === '--values') {
      valuesMode = true;
    } else if (arg === '--all') {
      allMode = true;
    } else {
      // A key argument may be a single lever or a comma-joined list
      // (`--values a,b,c`) — both shapes collect into the same flat key list,
      // so the two output modes share one parse (#1248). Empty segments (a
      // trailing or doubled comma) are dropped rather than becoming an
      // unknown-key entry.
      keys.push(...arg.split(',').filter(Boolean));
    }
  }
  if (allMode && valuesMode) {
    fail('--all and --values are mutually exclusive — --all always emits the JSON object');
    return;
  }
  if (allMode && keys.length > 0) {
    fail('--all takes no key arguments — it already emits every schema key');
    return;
  }
  if (allMode) keys.push(...POLICY_KEYS.map((row) => row.key));
  if (keys.length === 0) {
    fail('usage: resolve-policy.js [--values | --all] [--run <dir>] <key> [<key>…]');
    return;
  }
  if (valuesMode && keys.includes('model-profiles')) {
    // The one nested-block key has no scalar form.
    fail('--values does not support model-profiles (no scalar form) — use the JSON output');
    return;
  }
  // #1065: anchored-or-outside guard — runs after the flag-conflict checks
  // (their precedence is unchanged) and before the existence check and any
  // config.yml read. The raw runDir string is kept downstream, so the
  // pre-existing "does not exist" message echoes the value as given; the
  // reject message here names the realpath-resolved candidate instead.
  if (runDir !== null) {
    const message = anchoredOrOutsideMessage(runDir, process.cwd(), '--run');
    if (message) { fail(message); return; }
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

  // A run dir without a config.yml is not an error — the Manifesto may not
  // have written one yet; readFileSafe's null simply means no overlay.
  const { root, policyRaw, result } = resolvePolicyConfig({ git: gitRoot, readFile: readFileSafe, runDir, keys });

  // integration-model has no static schema default (skills/_shared/integration-
  // model.md) — an absent value (not a typo'd/invalid one; `invalid: true`
  // stays visible as an error, never silently overwritten) is computed via
  // forge detection instead of a literal.
  if (keys.includes('integration-model')) {
    const entry = result['integration-model'];
    if (entry && entry.source === 'default' && !entry.invalid) {
      result['integration-model'] = { value: detectIntegrationModel(root), source: 'default' };
    }
  }

  // merge-verification (#559) has no static schema default either — an absent
  // value (never an invalid one; `invalid: true` stays visible) is derived by
  // bin/lib/merge-verification.js's four-branch ladder, whose prose statement
  // of record is skills/_shared/policy-schema-coverage.md's coverage block.
  if (keys.includes('merge-verification')) {
    const entry = result['merge-verification'];
    if (entry && entry.source === 'default' && !entry.invalid) {
      // Reuse this call's own integration-model result (already computed
      // above) instead of letting deriveMergeVerification's internal
      // resolveIntegrationModel()->detectIntegrationModel() redo forge
      // detection from scratch — avoids running it twice per invocation.
      const modelEntry = result['integration-model'];
      const deps = keys.includes('integration-model') && modelEntry && typeof modelEntry.value === 'string'
        ? { integrationModel: () => modelEntry.value }
        : {};
      result['merge-verification'] = { value: deriveMergeVerification(root, deps), source: 'default' };
    }
  }

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

  if (allMode) {
    const decorated = {};
    for (const row of POLICY_KEYS) {
      decorated[row.key] = {
        ...result[row.key],
        summary: row.summary,
        category: row.category,
        tier: row.tier,
        type: row.type,
        default: row.default ?? null,
      };
    }
    process.stdout.write(`${JSON.stringify(decorated)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
