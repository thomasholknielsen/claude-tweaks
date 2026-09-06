// plugin/bin/lib/wrap-up/pack.js — one deterministic fact pack for
// /claude-tweaks:wrap-up's Phases 3-4 (#1930). The runner owns execution and
// bounding, the skill owns judgment: ten independent reads run concurrently
// and come back as one JSON document with a per-probe envelope — a failing
// probe degrades its own field, never the pack. Read-only by construction:
// nothing here releases a claim, archives, posts, or appends the shipped
// record. Every subprocess and fs read goes through `deps` so tests inject
// fakes. Named pack.js because bin/lib/wrap-up/facts.js (the curation-gate
// facts) already exists.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile: execFileCb, execFileSync } = require('child_process');
const { promisify } = require('util');

const PROBE_NAMES = ['residue', 'state', 'blastRadius', 'mergeSize', 'pr', 'recordLabels', 'release', 'claim', 'ledger', 'unblocked'];
const BIN = path.join(__dirname, '..', '..');

function defaultGit(args, { cwd } = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function defaultResolvePolicy(key, cwd) {
  try {
    return execFileSync('node', [path.join(BIN, 'resolve-policy.js'), '--values', key], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

function defaultDeps(cwd) {
  return {
    now: () => Date.now(),
    git: defaultGit,
    execFile: promisify(execFileCb),
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    resolvePolicy: (key) => defaultResolvePolicy(key, cwd),
    computeBlastRadius: require('../blast-radius-cli').computeBlastRadius,
    computeMergeSizeOverflow: require('../merge-size-probe').computeMergeSizeOverflow,
    readClaimBlob: require('../issues/claim-store').readClaimBlob,
    classifyClaimBlob: require('../issues/claims').classifyClaimBlob,
    gitRunner: require('../issues/claims-git-cas').defaultRunner,
    ghApi: () => { throw new Error('claim: git transport to the claims branch failed and the pack has no gh API fallback'); },
  };
}

function readJson(deps, file) {
  try { return JSON.parse(deps.readFile(file)); } catch { return null; }
}

// Materialized headers: work/{n}-spec.md, one per record of the run.
function headerRecords(deps, runDir) {
  const dir = path.join(runDir, 'work');
  const nums = [];
  for (const name of deps.readdir(dir)) {
    const m = /^(\d+)-spec\.md$/.exec(name);
    if (!m) continue;
    let text = '';
    try { text = deps.readFile(path.join(dir, name)); } catch { continue; }
    const rec = /^record:\s*(\d+)\s*$/m.exec(text);
    nums.push(Number(rec ? rec[1] : m[1]));
  }
  return nums.sort((a, b) => a - b);
}

function mergeBase(deps, cwd, integrationBranch) {
  for (const ref of [`origin/${integrationBranch}`, integrationBranch]) {
    try {
      const out = deps.git(['merge-base', 'HEAD', ref], { cwd }).trim();
      if (out) return { base: out, ref };
    } catch { /* try the next ref */ }
  }
  return { base: null, ref: null };
}

// Resolved once, reported with sources: records ← headers; pr/worktree ←
// run-state.json; integrationBranch ← policy (default main); base ←
// merge-base against origin/{branch}, then the local branch.
function resolveInputs({ runDir, cwd, deps }) {
  const sources = {};
  const state = readJson(deps, path.join(runDir, 'run-state.json'));
  const records = headerRecords(deps, runDir);
  sources.records = records.length ? 'header' : 'unavailable';
  const pr = state && state.pr && Number.isInteger(state.pr.number) ? state.pr.number : null;
  sources.pr = pr === null ? 'unavailable' : 'run-state.json';
  const worktree = state && typeof state.worktree === 'string' ? state.worktree : cwd;
  sources.worktree = state && typeof state.worktree === 'string' ? 'run-state.json' : 'cwd';
  const policyBranch = deps.resolvePolicy('integration-branch');
  const integrationBranch = policyBranch || 'main';
  sources.integrationBranch = policyBranch ? 'policy' : 'default';
  const mb = mergeBase(deps, worktree, integrationBranch);
  sources.base = mb.base ? 'merge-base' : 'unavailable';
  const merge = state && state.merge && typeof state.merge.sha === 'string' ? state.merge.sha : null;
  return { records, record: records[0] || null, pr, base: mb.base, baseRef: mb.ref, integrationBranch, worktree, mergeSha: merge, sources };
}

async function wrapProbe(name, fn, now) {
  const t0 = now();
  try {
    const value = await fn();
    return { ok: true, durationMs: now() - t0, value };
  } catch (err) {
    return { ok: false, durationMs: now() - t0, error: String((err && err.message) || err) };
  }
}

function parseLedger(text) {
  const rows = text.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
  const byPhase = {};
  let open = 0;
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    const phase = cells[1] || 'unknown';
    const status = (cells[3] || '').toLowerCase();
    byPhase[phase] = byPhase[phase] || { open: 0, total: 0 };
    byPhase[phase].total += 1;
    if (status === 'open') { open += 1; byPhase[phase].open += 1; }
  }
  return { open, total: rows.length, byPhase };
}

function ledgerProbe(inputs, deps) {
  const dir = path.join(inputs.worktree, 'docs', 'plans');
  const files = deps.readdir(dir).filter((f) => f.endsWith('-ledger.md') && inputs.records.some((n) => f.includes(String(n))));
  const totals = { open: 0, total: 0, byPhase: {}, files: files.map((f) => path.posix.join('docs', 'plans', f)) };
  for (const f of files) {
    const one = parseLedger(deps.readFile(path.join(dir, f)));
    totals.open += one.open; totals.total += one.total;
    for (const [phase, c] of Object.entries(one.byPhase)) {
      totals.byPhase[phase] = totals.byPhase[phase] || { open: 0, total: 0 };
      totals.byPhase[phase].open += c.open; totals.byPhase[phase].total += c.total;
    }
  }
  return totals;
}

// The ten probes. Module probes call the exported functions the CLIs already
// compute from; subprocess probes go through deps.execFile (Task 2).
function buildProbes(inputs, deps, cwd) {
  const git = (args) => deps.git(args, { cwd: inputs.worktree });
  const forge = deps.resolvePolicy('work-backend') === 'github-issues';
  const forgeOrThrow = () => { if (!forge) throw new Error('no-forge'); };
  const gh = async (args) => {
    try { return await deps.execFile('gh', args, { cwd: inputs.worktree }); } catch (err) {
      if (err && err.code === 'ENOENT') throw new Error('gh-absent');
      throw err;
    }
  };
  return {
    state: async () => {
      if (!inputs.base) throw new Error('base unresolved — no merge-base against the integration branch');
      const { stdout } = await deps.execFile('node', [path.join(BIN, 'wrap-up-state.js'), '--since', String(inputs.base), '--json'], { cwd: inputs.worktree, maxBuffer: 32 * 1024 * 1024 });
      return JSON.parse(stdout);
    },
    blastRadius: () => deps.computeBlastRadius({ base: inputs.base, integrationBranch: inputs.integrationBranch }, { git }),
    mergeSize: () => deps.computeMergeSizeOverflow({ integrationBranch: inputs.integrationBranch, headRef: 'HEAD' }, { git }),
    ledger: () => ledgerProbe(inputs, deps),
    residue: async () => {
      if (!inputs.base) throw new Error('base unresolved — no merge-base against the integration branch');
      const { stdout } = await deps.execFile('node', [path.join(BIN, 'residue.js'), '--base', String(inputs.base), '--integration-branch', String(inputs.baseRef || inputs.integrationBranch), '--scope', 'blast-radius', '--json'], { cwd: inputs.worktree, maxBuffer: 32 * 1024 * 1024 });
      return JSON.parse(stdout);
    },
    pr: async () => {
      forgeOrThrow(); if (inputs.pr === null) throw new Error('no PR number in run-state.json');
      const { stdout } = await gh(['pr', 'view', String(inputs.pr), '--json', 'state,isDraft,mergeStateStatus,statusCheckRollup,reviewDecision']);
      return JSON.parse(stdout);
    },
    recordLabels: async () => {
      forgeOrThrow();
      const out = {};
      for (const n of inputs.records) {
        const { stdout } = await gh(['issue', 'view', String(n), '--json', 'labels']);
        out[n] = JSON.parse(stdout).labels.map((l) => l.name);
      }
      return out;
    },
    release: async () => {
      forgeOrThrow();
      if (!inputs.mergeSha) return { status: 'pre-merge', line: 'not yet merged — release status resolves at pr-first-merge Step 4.1' };
      const { stdout } = await deps.execFile('node', [path.join(BIN, 'release.js'), 'status', '--merge', inputs.mergeSha, '--records', inputs.records.join(','), '--ref', `origin/${inputs.integrationBranch}`, '--json'], { cwd: inputs.worktree });
      return JSON.parse(stdout);
    },
    claim: async () => {
      const out = {};
      for (const n of inputs.records) {
        const blob = await deps.readClaimBlob({ gitRunner: deps.gitRunner, ghApi: deps.ghApi }, null, n);
        if (blob.failure) throw new Error(`claim read failed: ${blob.failure}`);
        out[n] = { ...deps.classifyClaimBlob(blob.absent ? null : blob.content, deps.now()), via: blob.via || 'git' };
      }
      return out;
    },
    unblocked: async () => {
      const closed = inputs.record;
      const { stdout } = await gh(['issue', 'list', '--state', 'open', '--json', 'number,title,body', '--limit', '200']);
      const records = JSON.parse(stdout);
      if (deps.resolvePolicy('work-links') === 'native') {
        if (!records.length) return [];
        const res = await deps.execFile('node', [path.join(BIN, 'resolve-blockers.js'), records.map((r) => r.number).join(',')], { cwd: inputs.worktree });
        const byNumber = JSON.parse(res.stdout.trim());
        return records.filter((r) => byNumber[r.number] && byNumber[r.number].blockedBy.includes(closed) && !byNumber[r.number].openBlocker).map((r) => ({ number: r.number, title: r.title }));
      }
      const re = new RegExp(`^\\s*Blocked by #${closed}\\b`, 'mi');
      return records.filter((r) => re.test(r.body || '')).map((r) => ({ number: r.number, title: r.title }));
    },
  };
}

async function gatherPack({ runDir, cwd = process.cwd(), only = null, deps: overrides = {} } = {}) {
  const deps = { ...defaultDeps(cwd), ...overrides };
  const t0 = deps.now();
  const inputs = resolveInputs({ runDir, cwd, deps });
  const probes = buildProbes(inputs, deps, cwd);
  const names = PROBE_NAMES.filter((n) => !only || only.includes(n));
  const settled = await Promise.all(names.map((n) => wrapProbe(n, probes[n] || (() => { throw new Error(`probe ${n} not implemented`); }), deps.now)));
  const pack = { generatedAt: new Date().toISOString(), durationMs: 0, inputs };
  names.forEach((n, i) => { pack[n] = settled[i]; });
  pack.durationMs = deps.now() - t0;
  return pack;
}

module.exports = { gatherPack, resolveInputs, wrapProbe, parseLedger, PROBE_NAMES };
