#!/usr/bin/env node
// bin/set-config.js — write one config.yml policy lever into a run's
// directory, the sanctioned path for a worktree-isolated session (#1376).
//   node bin/set-config.js --run <run-dir> --key <lever> --value <value> [--help]
// Exit 0 on success (echoes the config.yml path and the previous -> new
// value to stdout, so escape-hatch logs are evidence-based); 2 on a malformed
// invocation (missing args, a key outside the canonical Manifesto lever set,
// or a value outside that lever's enum); 3 when the run dir is missing or
// not anchored under the main checkout (a worktree-local shadow —
// _shared/pipeline-run-dir.md's Anchoring section, [IL-127]), or config.yml
// is unwritable. The config.yml third of the sanctioned-write family:
// bin/log-decision.js (decisions.md), bin/stage-item.js (staged/), this
// (config.yml levers — the ceremony escape hatch's downgrade path).
'use strict';

const { resolveTarget } = require('./lib/stage-item/write');
const { MANIFESTO_LEVERS, validateLever, setConfigLever } = require('./lib/set-config/write');

const USAGE = 'usage: set-config.js --run <run-dir> --key <lever> --value <value> [--help]\n';

function parseArgs(argv) {
  const o = { run: null, key: null, value: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? null;
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--key') o.key = next();
    else if (a === '--value') o.value = next();
    else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const realDeps = {
  cwd: () => process.cwd(),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  const usageError = (message) => { deps.stderr(`set-config.js: ${message}\n` + USAGE); return 2; };
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) return usageError('--run <run-dir> is required');
  if (!o.key) return usageError('--key <lever> is required');
  if (o.value == null || o.value === '') return usageError('--value <value> is required');

  const verdict = validateLever(o.key, o.value);
  if (!verdict.ok) {
    if (verdict.reason === 'unknown-key') {
      return usageError(`--key ${JSON.stringify(o.key)} is not a config.yml policy lever (the canonical Manifesto set: ${MANIFESTO_LEVERS.join(', ')})`);
    }
    return usageError(`--value ${JSON.stringify(o.value)} is not valid for ${o.key} (allowed: ${verdict.allowed.join(', ')})`);
  }

  let target;
  try { target = resolveTarget({ runDir: o.run, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch (err) {
    deps.stderr(`set-config.js: ${err && err.message}\n`);
    return 3;
  }
  if (!target.ok) {
    if (target.reason === 'missing') deps.stderr(`set-config.js: run dir does not exist: ${o.run}\n`);
    else deps.stderr(`set-config.js: run dir is not anchored under the main checkout (a worktree-local shadow): ${o.run} — resolve $RUN_ROOT per _shared/pipeline-run-dir.md's Anchoring section and pass the main-checkout path\n`);
    return 3;
  }

  let result;
  try { result = setConfigLever({ runDir: target.dir, key: o.key, value: o.value }); } catch (err) {
    deps.stderr(`set-config.js: could not write config.yml (${err && err.message})\n`);
    return 3;
  }
  deps.stdout(`${result.file} (${o.key}: ${result.previous == null ? 'unset' : result.previous} -> ${o.value})\n`);
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
