'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { gatherPack, resolveInputs, PROBE_NAMES } = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'wrap-up', 'pack.js'));

// A fixture run dir: run-state.json (pr + worktree), one materialized header, config.yml.
function fixtureRunDir({ withPr = true, records = [1535] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-pack-'));
  const state = { worktree: '/w/tree', status: 'active', sessionId: 's' };
  if (withPr) state.pr = { number: 1901, url: 'https://x/pull/1901', branch: 'b' };
  fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(dir, 'config.yml'), 'ceremony-profile: standard\n');
  fs.mkdirSync(path.join(dir, 'work'));
  for (const n of records) fs.writeFileSync(path.join(dir, 'work', `${n}-spec.md`), `---\nrecord: ${n}\nsurface: backend\n---\n# ${n}\n`);
  return dir;
}

// Fake deps: every probe succeeds; `git` answers merge-base; module probes return markers.
function okDeps(overrides = {}) {
  return {
    now: () => Date.now(),
    git: (args) => (args[0] === 'merge-base' ? 'abc123\n' : args[0] === 'rev-parse' ? 'refs/remotes/origin/main\n' : ''),
    resolvePolicy: (key) => ({ 'integration-branch': 'main', 'work-backend': 'github-issues', 'work-links': 'native' })[key] || '',
    computeBlastRadius: () => ({ mergeBase: 'abc123', config: {}, summary: { files: 3 } }),
    computeMergeSizeOverflow: () => ({ overflow: false, files: 3 }),
    readClaimBlob: () => ({ content: JSON.stringify({ runId: 'r', sessionId: 's' }), failure: null, absent: false, via: 'git' }),
    classifyClaimBlob: () => ({ state: 'held', reclaimable: false }),
    execFile: async (cmd, args) => {
      if (cmd === 'node' && String(args[0]).endsWith('residue.js')) return { stdout: JSON.stringify({ suite: { ran: false, reason: 'skipped', findings: [] } }), stderr: '' };
      if (cmd === 'node' && String(args[0]).endsWith('wrap-up-state.js')) return { stdout: JSON.stringify({ state: { isRepo: true, branch: 'b' }, ops: [], since: 'abc123', sinceDate: '2026-09-05T00:00:00Z' }), stderr: '' };
      if (cmd === 'node' && String(args[0]).endsWith('resolve-blockers.js')) return { stdout: JSON.stringify({ 1600: { blockedBy: [1535], openBlocker: false } }), stderr: '' };
      if (cmd === 'gh' && args[0] === 'pr') return { stdout: JSON.stringify({ state: 'OPEN', isDraft: false, mergeStateStatus: 'CLEAN', statusCheckRollup: [], reviewDecision: null }), stderr: '' };
      if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') return { stdout: JSON.stringify({ labels: [{ name: 'ready' }, { name: 'auto:merge' }] }), stderr: '' };
      if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'list') return { stdout: JSON.stringify([{ number: 1600, title: 'Dependent', body: '' }]), stderr: '' };
      throw new Error(`unexpected execFile ${cmd} ${args.join(' ')}`);
    },
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => (fs.existsSync(p) ? fs.readdirSync(p) : []),
    ...overrides,
  };
}

test('resolveInputs reads records from the headers, pr and worktree from run-state.json, the integration branch from policy, and the base from merge-base — with sources (#1930 AC1)', () => {
  const runDir = fixtureRunDir();
  const inputs = resolveInputs({ runDir, cwd: '/w/tree', deps: okDeps() });
  assert.deepStrictEqual(inputs.records, [1535]);
  assert.strictEqual(inputs.record, 1535);
  assert.strictEqual(inputs.pr, 1901);
  assert.strictEqual(inputs.base, 'abc123');
  assert.strictEqual(inputs.integrationBranch, 'main');
  assert.strictEqual(inputs.worktree, '/w/tree');
  assert.deepStrictEqual(inputs.sources, { records: 'header', pr: 'run-state.json', base: 'merge-base', integrationBranch: 'policy', worktree: 'run-state.json' });
});

test('resolveInputs marks a missing source unavailable and still resolves the rest (#1930 Gotchas)', () => {
  const runDir = fixtureRunDir({ withPr: false });
  const inputs = resolveInputs({ runDir, cwd: '/w/tree', deps: okDeps({ resolvePolicy: () => '' }) });
  assert.strictEqual(inputs.pr, null);
  assert.strictEqual(inputs.sources.pr, 'unavailable');
  assert.strictEqual(inputs.integrationBranch, 'main');
  assert.strictEqual(inputs.sources.integrationBranch, 'default');
  assert.strictEqual(inputs.base, 'abc123');
});

test('gatherPack: every probe ok → ten envelopes with ok:true, plus inputs/generatedAt/durationMs (#1930 AC2 shape)', async () => {
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', deps: okDeps() });
  assert.deepStrictEqual(Object.keys(pack).filter((k) => !['inputs', 'generatedAt', 'durationMs'].includes(k)).sort(), [...PROBE_NAMES].sort());
  for (const name of PROBE_NAMES) assert.strictEqual(pack[name].ok, true, `${name} should be ok: ${JSON.stringify(pack[name])}`);
  assert.ok(typeof pack.generatedAt === 'string' && typeof pack.durationMs === 'number');
  assert.deepStrictEqual(pack.blastRadius.value, { mergeBase: 'abc123', config: {}, summary: { files: 3 } });
  assert.deepStrictEqual(pack.recordLabels.value, { 1535: ['ready', 'auto:merge'] });
  assert.deepStrictEqual(pack.unblocked.value, [{ number: 1600, title: 'Dependent' }]);
  assert.deepStrictEqual(pack.release.value.status, 'pre-merge');
  assert.ok(Array.isArray(pack.state.value.ops), 'pack.state.value.ops should be an array');
  assert.strictEqual(typeof pack.state.value.since, 'string', 'pack.state.value.since should be a string');
});

test('gatherPack: one probe throwing degrades only its field, the pack still resolves (#1930 AC1)', async () => {
  const deps = okDeps({ execFile: async (cmd, args) => { if (String(args[0]).endsWith('residue.js')) throw new Error('residue exploded'); return okDeps().execFile(cmd, args); } });
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', deps });
  assert.strictEqual(pack.residue.ok, false);
  assert.match(pack.residue.error, /residue exploded/);
  for (const name of PROBE_NAMES.filter((n) => n !== 'residue')) assert.strictEqual(pack[name].ok, true, name);
});

test('gatherPack: --only runs only the named probes and still carries inputs/generatedAt/durationMs (#1930 AC2)', async () => {
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', only: ['residue', 'pr'], deps: okDeps() });
  assert.deepStrictEqual(Object.keys(pack).sort(), ['durationMs', 'generatedAt', 'inputs', 'pr', 'residue']);
});

test('gatherPack runs the probes concurrently — ten 200 ms probes finish well under 2 s (#1930 AC4)', async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const slow = okDeps({
    execFile: async (cmd, args) => { await sleep(200); return okDeps().execFile(cmd, args); },
    computeBlastRadius: async () => { await sleep(200); return { summary: {} }; },
    computeMergeSizeOverflow: async () => { await sleep(200); return { overflow: false }; },
    readClaimBlob: async () => { await sleep(200); return { content: null, failure: null, absent: true }; },
  });
  const t0 = Date.now();
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', deps: slow });
  const wall = Date.now() - t0;
  assert.ok(wall < 600, `wall ${wall} ms`);
  assert.ok(pack.durationMs < 600, `pack.durationMs ${pack.durationMs}`);
});

test('gatherPack: the ledger probe counts rows by status and phase from the worktree ledgers naming a record (#1930)', async () => {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-pack-tree-'));
  fs.mkdirSync(path.join(tree, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'docs', 'plans', '2026-09-05-spec-1535-ledger.md'), [
    '| # | Phase | Item | Status | Resolution |', '|---|---|---|---|---|',
    '| 1 | review | a | open | — |', '| 2 | review | b | fixed | x |', '| 3 | build | c | observation | — |',
  ].join('\n'));
  const runDir = fixtureRunDir();
  const state = JSON.parse(fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8'));
  state.worktree = tree;
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(state));
  const pack = await gatherPack({ runDir, cwd: tree, only: ['ledger'], deps: okDeps() });
  assert.deepStrictEqual(pack.ledger.value, { open: 1, total: 3, byPhase: { review: { open: 1, total: 2 }, build: { open: 0, total: 1 } }, files: ['docs/plans/2026-09-05-spec-1535-ledger.md'] });
});

test('gatherPack: a missing gh binary degrades pr/recordLabels/unblocked to error gh-absent, nothing else (#1930 Gotchas)', async () => {
  const deps = okDeps({ execFile: async (cmd, args) => { if (cmd === 'gh') { const e = new Error('spawn gh ENOENT'); e.code = 'ENOENT'; throw e; } return okDeps().execFile(cmd, args); } });
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', deps });
  for (const n of ['pr', 'recordLabels', 'unblocked']) { assert.strictEqual(pack[n].ok, false, n); assert.strictEqual(pack[n].error, 'gh-absent', n); }
  assert.strictEqual(pack.residue.ok, true);
  assert.strictEqual(pack.claim.ok, true);
});

test('gatherPack: a non-forge project reports pr/recordLabels/release as no-forge (#1930 Gotchas)', async () => {
  const deps = okDeps({ resolvePolicy: (k) => ({ 'work-backend': 'local-files', 'work-links': 'body-text', 'integration-branch': 'main' })[k] || '' });
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', deps });
  for (const n of ['pr', 'recordLabels', 'release']) { assert.strictEqual(pack[n].ok, false, n); assert.strictEqual(pack[n].error, 'no-forge', n); }
});

test('gatherPack: the release probe runs release.js status only once run-state.json carries merge.sha (#1930 design)', async () => {
  const runDir = fixtureRunDir();
  const state = JSON.parse(fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8'));
  state.merge = { sha: 'deadbeef' };
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(state));
  const calls = [];
  const deps = okDeps({ execFile: async (cmd, args) => { if (String(args[0]).endsWith('release.js')) { calls.push(args); return { stdout: JSON.stringify({ shipped: false }), stderr: '' }; } return okDeps().execFile(cmd, args); } });
  const pack = await gatherPack({ runDir, cwd: '/w/tree', only: ['release'], deps });
  assert.deepStrictEqual(pack.release.value, { shipped: false });
  assert.deepStrictEqual(calls[0].slice(1), ['status', '--merge', 'deadbeef', '--records', '1535', '--ref', 'origin/main', '--json']);
});

test('gatherPack: body-text work-links finds dependents by a literal Blocked by #N line without resolve-blockers.js (#1930)', async () => {
  const deps = okDeps({
    resolvePolicy: (k) => ({ 'work-backend': 'github-issues', 'work-links': 'body-text', 'integration-branch': 'main' })[k] || '',
    execFile: async (cmd, args) => {
      if (String(args[0]).endsWith('resolve-blockers.js')) throw new Error('must not be called under body-text');
      if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'list') return { stdout: JSON.stringify([{ number: 1600, title: 'Dependent', body: 'Blocked by #1535\n' }, { number: 1601, title: 'Other', body: 'Blocked by #9\n' }]), stderr: '' };
      return okDeps().execFile(cmd, args);
    },
  });
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', only: ['unblocked'], deps });
  assert.deepStrictEqual(pack.unblocked.value, [{ number: 1600, title: 'Dependent' }]);
});

test('gatherPack: claim probe surfaces a clean error when readClaimBlob falls through to the gh API fallback the pack has none for (#1930 fix)', async () => {
  const deps = okDeps({
    readClaimBlob: (d) => { d.ghApi(); return { content: null, failure: null, absent: true }; },
  });
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', only: ['claim'], deps });
  assert.strictEqual(pack.claim.ok, false);
  assert.match(pack.claim.error, /claim: git transport to the claims branch failed and the pack has no gh API fallback/);
});

test('gatherPack: residue probe refuses to run with an unresolved merge-base rather than passing the literal "null" (#1930 fix)', async () => {
  const calls = [];
  const deps = okDeps({
    git: (args) => { if (args[0] === 'merge-base') throw new Error('no merge base'); return okDeps().git(args); },
    execFile: async (cmd, args) => { if (String(args[0]).endsWith('residue.js')) { calls.push(args); } return okDeps().execFile(cmd, args); },
  });
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', only: ['residue'], deps });
  assert.strictEqual(pack.residue.ok, false);
  assert.match(pack.residue.error, /base unresolved/);
  assert.strictEqual(calls.length, 0);
});

test('gatherPack: state probe refuses to run with an unresolved merge-base rather than passing the literal "null" (#1930 fix)', async () => {
  const calls = [];
  const deps = okDeps({
    git: (args) => { if (args[0] === 'merge-base') throw new Error('no merge base'); return okDeps().git(args); },
    execFile: async (cmd, args) => { if (String(args[0]).endsWith('wrap-up-state.js')) { calls.push(args); } return okDeps().execFile(cmd, args); },
  });
  const pack = await gatherPack({ runDir: fixtureRunDir(), cwd: '/w/tree', only: ['state'], deps });
  assert.strictEqual(pack.state.ok, false);
  assert.match(pack.state.error, /base unresolved/);
  assert.strictEqual(calls.length, 0);
});
