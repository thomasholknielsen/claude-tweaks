#!/usr/bin/env node
// bin/set-config.js — write one or more config.yml policy levers into a
// run's directory, the sanctioned path for a worktree-isolated session
// (#1376).
//   node bin/set-config.js --run <run-dir> --key <lever> --value <value> [--help]
//   node bin/set-config.js --run <run-dir> --set <lever1>=<value1>,<lever2>=<value2>,... [--help]
// The two forms are mutually exclusive on one invocation. `--set` validates
// every lever/value pair in the comma-joined list against the canonical
// Manifesto lever set BEFORE writing any of them (all-or-nothing, same
// fail-closed posture as the single-key form) — see #1580. Lever values
// never contain a comma (all 13 are short enum tokens), so a plain
// comma-split is safe.
// "All-or-nothing" above covers validation only — every write is a separate
// sequential fs call (bin/lib/set-config/write.js's setConfigLever), so a
// mid-batch fs failure exits 3 having already durably written the earlier
// entries; the stderr message on that path names which keys were already
// written (see the write loop below) so a caller isn't left guessing.
// Exit 0 on success (echoes, per lever, the config.yml path and the
// previous -> new value, so escape-hatch logs are evidence-based); 2 on a
// malformed invocation (missing/conflicting args, a `--set` entry not in
// key=value form, a key repeated within one `--set` batch, a key outside the
// canonical Manifesto lever set, or a value outside that lever's enum —
// batch or single, nothing is written on this exit code); 3 when the run dir
// is missing or not anchored under the main checkout (a worktree-local
// shadow — _shared/pipeline-run-dir.md's Anchoring section, [IL-127]), or
// config.yml is unwritable. config.yml is the third of the sanctioned-write
// family: bin/log-decision.js (decisions.md), bin/stage-item.js (staged/),
// this (config.yml levers — the ceremony escape hatch's downgrade path, and
// the Manifesto's own batch write).
'use strict';

const { resolveTarget } = require('./lib/stage-item/write');
const { MANIFESTO_LEVERS, validateLever, setConfigLever } = require('./lib/set-config/write');

const USAGE = 'usage: set-config.js --run <run-dir> --key <lever> --value <value> [--help]\n' +
  '       set-config.js --run <run-dir> --set <lever1>=<value1>,<lever2>=<value2>,... [--help]\n';

function parseArgs(argv) {
  const o = { run: null, key: null, value: null, set: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? null;
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--key') o.key = next();
    else if (a === '--value') o.value = next();
    else if (a === '--set') o.set = next();
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

// Splits a `--set` value into its comma-joined `key=value` pairs. Returns
// { entries } on success, or { malformed } — the raw entries with no `=` —
// or { duplicateKey } — the first key seen more than once in the batch — on
// failure. A pair's key is everything before the FIRST `=`; no current lever
// value ever contains `=`, so this is not a meaningful ambiguity today. A
// duplicate key within one batch is treated as malformed (not "last value
// wins") because a composed 13-pair call carrying one is almost certainly a
// compose bug, not intentional — see #1580.
function parseSetEntries(raw) {
  const entries = [];
  const malformed = [];
  const seen = new Set();
  let duplicateKey = null;
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) { malformed.push(pair); continue; }
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!duplicateKey && seen.has(key)) duplicateKey = key;
    seen.add(key);
    entries.push({ key, value });
  }
  if (malformed.length) return { malformed };
  if (duplicateKey) return { duplicateKey };
  return { entries };
}

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  const usageErrors = (messages) => { deps.stderr(messages.map((m) => `set-config.js: ${m}\n`).join('') + USAGE); return 2; };
  const usageError = (message) => usageErrors([message]);
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) return usageError('--run <run-dir> is required');

  const batchMode = o.set != null;
  if (batchMode && (o.key != null || o.value != null)) {
    return usageError('--set cannot be combined with --key/--value');
  }
  if (!batchMode) {
    if (!o.key) return usageError('--key <lever> is required');
    if (o.value == null || o.value === '') return usageError('--value <value> is required');
  } else if (o.set === '') {
    return usageError('--set requires at least one key=value pair');
  }

  let entries;
  if (batchMode) {
    const parsed = parseSetEntries(o.set);
    if (parsed.malformed) {
      return usageErrors(parsed.malformed.map((p) => `--set entry ${JSON.stringify(p)} is not in key=value form`));
    }
    if (parsed.duplicateKey) {
      return usageError(`--set key ${JSON.stringify(parsed.duplicateKey)} appears more than once in the batch`);
    }
    entries = parsed.entries;
  } else {
    entries = [{ key: o.key, value: o.value }];
  }

  const problems = [];
  for (const { key, value } of entries) {
    const verdict = validateLever(key, value);
    if (verdict.ok) continue;
    if (verdict.reason === 'unknown-key') {
      problems.push(`--key ${JSON.stringify(key)} is not a config.yml policy lever (the canonical Manifesto set: ${MANIFESTO_LEVERS.join(', ')})`);
    } else {
      problems.push(`--value ${JSON.stringify(value)} is not valid for ${key} (allowed: ${verdict.allowed.join(', ')})`);
    }
  }
  if (problems.length) return usageErrors(problems);

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

  const results = [];
  try {
    for (const { key, value } of entries) {
      results.push({ key, value, ...setConfigLever({ runDir: target.dir, key, value }) });
    }
  } catch (err) {
    const msg = `set-config.js: could not write config.yml (${err && err.message})${results.length ? ` — already written before the failure: ${results.map(r => r.key).join(', ')}` : ''}`;
    deps.stderr(`${msg}\n`);
    return 3;
  }

  for (const r of results) {
    deps.stdout(`${r.file} (${r.key}: ${r.previous == null ? 'unset' : r.previous} -> ${r.value})\n`);
  }
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
