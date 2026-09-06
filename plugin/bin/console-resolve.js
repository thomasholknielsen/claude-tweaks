#!/usr/bin/env node
// plugin/bin/console-resolve.js — resolve an `unattended` Review Console in
// one process (#1932): every staged item, one decisions block, one
// console.json (the write the auto-resolve path never made — #1854, so
// archive-merged.js never archived an unattended run), one rendered table.
// The merge half is computed, never executed — `gh pr merge` stays in the
// skill's own path. Exit 0 resolved, 2 malformed, 3 --run not anchored under
// the main checkout ([IL-127]), 4 consoleAutoResolve not granted at the
// resolved ceiling (never resolve a console at supervised/trusted).
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveAll } = require('./lib/console/resolve');
const { resolveTarget } = require('./lib/stage-item/write');
const { appendEntry, formatEntry } = require('./lib/log-decision/append');
const { resolvePolicyConfig } = require('./lib/policy-schema');
const { resolveCeiling, bookkeepingPermissions } = require('./lib/issues/autonomy');
const { extractPendingGrantedAt } = require('./lib/issues/grant-maturation');
const { writeFileAtomic } = require('./lib/atomic-write');

const USAGE = 'usage: console-resolve.js --run <dir> --policy console-auto [--dry-run] [--json]';

class UsageError extends Error {}

function parseArgs(argv) {
  const out = { run: null, policy: null, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--run' || flag === '--policy') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} requires a value`);
      out[flag === '--run' ? 'run' : 'policy'] = value;
      i += 1;
    } else if (flag === '--dry-run') out.dryRun = true;
    else if (flag === '--json') out.json = true;
    else throw new UsageError(`unknown flag: ${flag}`);
  }
  if (!out.run) throw new UsageError('--run <dir> is required');
  if (out.policy !== 'console-auto') throw new UsageError(`--policy must be console-auto (got ${out.policy || 'nothing'})`);
  return out;
}

function defaultExecFile(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, timeout: 30000, ...opts });
}

// The ceiling, resolved in-process with the same precedence resolve-policy.js
// applies (run config over project policy): `resolvePolicyKeys` already folds
// config.yml over policy.yml, so the single resolved value is what
// resolveCeiling sees as runConfig.
function readCeiling({ execFile, cwd, runDir }) {
  const git = (args) => execFile('git', args, { cwd });
  const readFile = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  const { result } = resolvePolicyConfig({ git, readFile, runDir, keys: ['autonomy'] });
  const entry = result.autonomy;
  const value = entry && entry.error === undefined ? entry.value : null;
  return resolveCeiling({ runConfig: value });
}

// Live grants per member — the Authorization read is never a snapshot
// (auto-merge-short-circuit.md's Authorization layer): labels and, for a
// pending grant, the grant timestamp from the audit-trail comment marker.
function ghReadGrants(execFile, cwd) {
  return (numbers) => {
    const out = {};
    for (const n of numbers) {
      const raw = execFile('gh', ['issue', 'view', String(n), '--json', 'labels,comments'], { cwd });
      const parsed = JSON.parse(raw);
      const labels = (parsed.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
      const bodies = (parsed.comments || []).map((c) => (typeof c === 'string' ? c : c.body || ''));
      out[n] = { labels, pendingSince: extractPendingGrantedAt(bodies) };
    }
    return out;
  };
}

function gitApplyCheck(execFile, cwd) {
  return (patchPath) => {
    try { execFile('git', ['apply', '--check', patchPath], { cwd }); return { ok: true }; } catch (err) {
      const msg = err && (err.stderr || err.message) ? String(err.stderr || err.message).trim() : 'git apply --check failed';
      return { ok: false, error: msg };
    }
  };
}

async function run(argv, deps = {}) {
  const cwd = deps.cwd || (() => process.cwd());
  const stdout = deps.stdout || ((s) => process.stdout.write(s));
  const stderr = deps.stderr || ((s) => process.stderr.write(s));
  const now = deps.now || (() => Date.now());
  const execFile = deps.execFile || defaultExecFile;
  let o;
  try { o = parseArgs(argv); } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    stderr(`console-resolve.js: ${err.message}\n${USAGE}\n`);
    return 2;
  }
  let isDir = false;
  try { isDir = fs.statSync(o.run).isDirectory(); } catch { isDir = false; }
  if (!isDir) { stderr(`console-resolve.js: --run ${o.run} is not a directory\n${USAGE}\n`); return 2; }
  const target = resolveTarget({ runDir: o.run, cwd: cwd(), mainRoot: deps.mainRoot });
  if (!target.ok) {
    stderr(`console-resolve.js: --run ${o.run} refused (${target.reason === 'missing' ? 'missing' : 'not anchored under the main checkout'}) — nothing written\n`);
    return 3;
  }
  const runDir = target.dir;
  const ceiling = readCeiling({ execFile, cwd: cwd(), runDir });
  if (!bookkeepingPermissions(ceiling).consoleAutoResolve) {
    stderr(`console-resolve.js: consoleAutoResolve is not granted at ceiling ${ceiling} (unattended only) — nothing written\n`);
    return 4;
  }
  const resolverDeps = {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    gitApplyCheck: gitApplyCheck(execFile, cwd()),
    readGrants: ghReadGrants(execFile, cwd()),
    now,
    ...(deps.resolverDeps || {}),
  };
  const result = resolveAll({ runDir, policy: o.policy, deps: resolverDeps });
  const { snapshot, table, ...publicResult } = result;
  const at = new Date(now()).toISOString();
  if (!o.dryRun) {
    const header = formatEntry({ status: 'AUTO', now: now(), step: 'Review Console', text: `Console auto-resolved ${result.items.length} item(s) at unattended (console-resolve.js)`, reversibility: 'per item' });
    const lines = result.items.map((it) => formatEntry({ status: 'AUTO', now: now(), step: 'Review Console', text: `Console item ${it.id} (${it.section}): ${it.resolution} — ${it.reason}`, reversibility: it.resolution === 'keep-staged' || it.resolution === 'pending' ? 'n/a' : it.resolution === 'apply' ? 'medium' : 'high' }));
    appendEntry({ runDir, section: '/wrap-up', entry: [header, ...lines].join('\n') });
    writeFileAtomic(path.join(runDir, 'console.json'), `${JSON.stringify({ resolved: true, mode: 'auto-resolve', at, ceiling: 'unattended', items: result.items, merge: result.merge }, null, 2)}\n`);
  }
  stdout(o.json ? `${JSON.stringify({ ...publicResult, at, dryRun: o.dryRun }, null, 2)}\n` : `${table}\n`);
  return 0;
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { process.stderr.write(`console-resolve.js: ${err && err.stack ? err.stack : err}\n`); process.exitCode = 1; });
}

module.exports = { run, parseArgs };
