'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MOD = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'flow', 'preflight');
const { ADOPTION_NOTES, computeAdoption, parseChecklist, gatherPreflight, LEVER_KEYS } = require(MOD);

// A fake main checkout with one run dir under .claude-tweaks/pipelines/.
function mainRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-record-7');
  fs.mkdirSync(runDir, { recursive: true });
  return { root, runDir };
}

const STAMP = JSON.stringify({ present: true, sha: 'abc', head: 'abc', dirty: false, scope: 'full', fullSha: 'abc', match: true, verifiedHead: true });
const CHANGED = JSON.stringify({ base: 'abc', files: ['src/a.js'] });
const PR_BODY = 'intro\n<!-- phases-start -->\n- [x] build\n- [x] test\n- [ ] review\n- [ ] polish\n- [ ] wrap-up\n<!-- phases-end -->\ntail';

function deps(fx, overrides = {}, calls = null) {
  return {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    git: (args) => (args[0] === 'ls-tree' ? `x/work/7-spec.md\n` : 'feat-branch\n'),
    execFile: (cmd, args, opts) => {
      if (calls) calls.push({ cmd, args, opts });
      if (cmd === 'gh') return JSON.stringify({ state: 'OPEN', isDraft: true, body: PR_BODY });
      if (args.includes('--stamp-status')) return STAMP;
      if (args.includes('--changed-files')) return CHANGED;
      throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
    },
    checkResumeFreshness: () => ({ safe: true, verdict: 'not-interrupted' }),
    checkStagedInventory: () => ({ checked: 2, missing: [] }),
    readRunState: (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'run-state.json'), 'utf8')); } catch { return null; } },
    resolvePolicy: (keys) => Object.fromEntries(keys.map((k) => [k, k === 'integration-branch' ? { value: 'main', source: 'default' } : { value: `v-${k}`, source: 'policy' }])),
    resolveTarget: ({ runDir }) => (fs.existsSync(runDir) ? { ok: true, dir: fs.realpathSync(runDir) } : { ok: false, reason: 'missing' }),
    now: () => Date.parse('2026-09-06T12:00:00Z'),
    ...overrides,
  };
}

function seedCase1(fx) {
  fs.writeFileSync(path.join(fx.runDir, 'config.yml'), 'mode: auto\nceremony-profile: standard\nscope-creep: add-to-plan\n');
  fs.writeFileSync(path.join(fx.runDir, 'run-state.json'), JSON.stringify({ worktree: '/w/tree', status: 'active', pr: { number: 1901, branch: 'feat-branch' } }));
  fs.mkdirSync(path.join(fx.runDir, 'work'));
  fs.writeFileSync(path.join(fx.runDir, 'work', '7-spec.md'), '---\nrecord: 7\n---\n');
}

test('case 1: anchored dir with config.yml → adopt, the case-1 literal, OK freshness/inventory, twelve levers with sources, stamp match, changed files (#1931 AC1)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const calls = [];
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review', 'polish', 'wrap-up'], cwd: fx.root, mainRoot: fx.root, deps: deps(fx, {}, calls) });
  assert.deepStrictEqual(pack.steps, ['review', 'polish', 'wrap-up']);
  assert.strictEqual(pack.mode, 'auto');
  assert.strictEqual(pack.adoption.ok, true);
  assert.strictEqual(pack.adoption.value.case, 1);
  assert.strictEqual(pack.adoption.value.note, ADOPTION_NOTES[1].replace('{path}', fs.realpathSync(fx.runDir)));
  assert.strictEqual(pack.freshness.value.verdict, 'OK');
  assert.match(pack.freshness.value.line, /resume freshness OK for 2026-09-06T000000-record-7 \(not-interrupted\)/);
  assert.strictEqual(pack.inventory.value.status, 'OK');
  assert.strictEqual(pack.levers.value.length, 12);
  for (const l of pack.levers.value) { assert.ok(LEVER_KEYS.includes(l.key)); assert.ok('value' in l && typeof l.source === 'string', l.key); }
  const ceremony = pack.levers.value.find((l) => l.key === 'ceremony-profile');
  assert.deepStrictEqual(ceremony, { key: 'ceremony-profile', value: 'standard', source: 'header' });
  assert.deepStrictEqual(pack.spec.value, { path: 'work/7-spec.md', present: true, record: 7 });
  assert.strictEqual(pack.pr.value.number, 1901);
  assert.deepStrictEqual(pack.pr.value.checklist, [{ phase: 'build', done: true }, { phase: 'test', done: true }, { phase: 'review', done: false }, { phase: 'polish', done: false }, { phase: 'wrap-up', done: false }]);
  assert.strictEqual(pack.stamp.value.match, true);
  assert.ok(Array.isArray(pack.changedFiles.value.files));
  const stampCall = calls.find((c) => c.args.includes('--stamp-status'));
  const changedCall = calls.find((c) => c.args.includes('--changed-files'));
  const ghCall = calls.find((c) => c.cmd === 'gh');
  assert.strictEqual(stampCall.opts.cwd, '/w/tree');
  assert.strictEqual(changedCall.opts.cwd, '/w/tree');
  assert.strictEqual(ghCall.opts.cwd, fx.root);
});

test('case 3: decisions.md content but no config.yml → the #1013-recovery literal with the computed backfills; case 2: empty dir → the minted literal (#1931 AC2)', () => {
  const fx = mainRoot();
  fs.writeFileSync(path.join(fx.runDir, 'decisions.md'), '## /build\n- AUTO 10:00:00 — x. Reversibility: high.\n');
  const d = deps(fx, { git: (args) => (args[0] === 'ls-tree' ? '' : 'feat-branch\n') });
  const a3 = computeAdoption({ runDir: fx.runDir, mainRoot: fx.root, cwd: fx.root, deps: d });
  assert.strictEqual(a3.case, 3);
  assert.strictEqual(a3.note, ADOPTION_NOTES[3].replace('{path}', fs.realpathSync(fx.runDir)).replace('{worktree registration | PR-early lifecycle | materialize commit}', 'worktree registration, PR-early lifecycle, materialize commit'));
  assert.deepStrictEqual(a3.backfills, ['worktree registration', 'PR-early lifecycle', 'materialize commit']);
  const fx2 = mainRoot();
  const a2 = computeAdoption({ runDir: fx2.runDir, mainRoot: fx2.root, cwd: fx2.root, deps: d });
  assert.strictEqual(a2.case, 2);
  assert.strictEqual(a2.note, ADOPTION_NOTES[2].replace('{path}', fs.realpathSync(fx2.runDir)));
});

test('case 4: a missing dir and an unanchored dir each render the case-4 literal with the matching reason; case 5: unset → no note (#1931 AC2)', () => {
  const fx = mainRoot();
  const missing = path.join(fx.root, '.claude-tweaks', 'pipelines', 'nope');
  const a = computeAdoption({ runDir: missing, mainRoot: fx.root, cwd: fx.root, deps: deps(fx) });
  assert.strictEqual(a.case, 4);
  assert.strictEqual(a.note, ADOPTION_NOTES[4].replace('{path}', missing).replace('{does not exist | is not anchored to the main checkout}', 'does not exist'));
  const shadow = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-shadow-'));
  const b = computeAdoption({ runDir: shadow, mainRoot: fx.root, cwd: fx.root, deps: deps(fx, { resolveTarget: () => ({ ok: false, reason: 'not-anchored' }) }) });
  assert.strictEqual(b.case, 4);
  assert.match(b.note, /is not anchored to the main checkout/);
  const c = computeAdoption({ runDir: null, mainRoot: fx.root, cwd: fx.root, deps: deps(fx) });
  assert.deepStrictEqual({ case: c.case, note: c.note }, { case: 5, note: null });
});

test('a BLOCKED freshness verdict propagates as data with the CLI line, and does not fail the pack (#1931 AC3)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { checkResumeFreshness: () => ({ safe: false, verdict: 'BLOCKED', reason: 'worktree lock pid 4242 is live' }) });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.freshness.ok, true);
  assert.strictEqual(pack.freshness.value.verdict, 'BLOCKED');
  assert.strictEqual(pack.freshness.value.line, 'claude-tweaks: resume freshness BLOCKED for 2026-09-06T000000-record-7 — run appears actively owned (worktree lock pid 4242 is live)');
  assert.strictEqual(pack.adoption.value.case, 1, 'adoption is computed independently; the skill decides to stop');
});

test('a staged-inventory MISMATCH renders the CLI line verbatim (#1931)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { checkStagedInventory: () => ({ checked: 3, missing: ['staged/review-2.patch'] }) });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.inventory.value.status, 'MISMATCH');
  assert.strictEqual(pack.inventory.value.line, 'claude-tweaks: staged inventory MISMATCH for 2026-09-06T000000-record-7 — 1 of 3 STAGED entries missing from staged/: staged/review-2.patch');
});

test('gh absent → pr.ok false with the error, every other field intact; no pr in run-state.json → pr.ok true with value null (#1931 AC4)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { execFile: (cmd, args) => { if (cmd === 'gh') { const e = new Error('spawn gh ENOENT'); e.code = 'ENOENT'; throw e; } if (args.includes('--stamp-status')) return STAMP; return CHANGED; } });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.pr.ok, false);
  assert.match(pack.pr.error, /gh-absent/);
  for (const k of ['adoption', 'freshness', 'inventory', 'levers', 'spec', 'stamp', 'changedFiles']) assert.strictEqual(pack[k].ok, true, k);
  fs.writeFileSync(path.join(fx.runDir, 'run-state.json'), JSON.stringify({ worktree: '/w/tree', status: 'active' }));
  const pack2 = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: deps(fx) });
  assert.deepStrictEqual(pack2.pr, { ...pack2.pr, ok: true, value: null });
});

test('a single lever failing to resolve degrades that entry only (#1931 Gotcha)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { resolvePolicy: (keys) => Object.fromEntries(keys.map((k) => [k, k === 'model-stance' ? { error: 'unknown-key' } : { value: 'x', source: 'default' }])) });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.levers.ok, true);
  const bad = pack.levers.value.find((l) => l.key === 'model-stance');
  assert.deepStrictEqual(bad, { key: 'model-stance', value: null, source: null, error: 'unknown-key' });
});

test('one probe throwing degrades only its field, and the probes run concurrently (#1931)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const slow = (v) => new Promise((r) => setTimeout(() => r(v), 150));
  const d = deps(fx, {
    checkResumeFreshness: () => { throw new Error('probe exploded'); },
    execFile: (cmd, args) => { if (cmd === 'gh') return JSON.stringify({ state: 'OPEN', isDraft: true, body: PR_BODY }); return args.includes('--stamp-status') ? STAMP : CHANGED; },
  });
  const t0 = Date.now();
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: { ...d, execFileAsync: async (cmd, args) => slow(d.execFile(cmd, args)) } });
  assert.strictEqual(pack.freshness.ok, false);
  assert.match(pack.freshness.error, /probe exploded/);
  assert.strictEqual(pack.pr.ok, true);
  assert.ok(Date.now() - t0 < 450, 'three 150 ms subprocess probes overlap');
});

test('a probe that never resolves is bounded by probeTimeoutMs, without blocking or leaking a timer for the others (#1931 parity with wrap-up/pack.js)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, {
    execFileAsync: async (cmd, args) => {
      if (args.includes('--stamp-status')) return new Promise(() => {}); // never resolves
      if (cmd === 'gh') return JSON.stringify({ state: 'OPEN', isDraft: true, body: PR_BODY });
      if (args.includes('--changed-files')) return CHANGED;
      throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
    },
  });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: { ...d, probeTimeoutMs: 25 } });
  assert.strictEqual(pack.stamp.ok, false);
  assert.match(pack.stamp.error, /timeout after 25ms/);
  assert.strictEqual(pack.freshness.ok, true);
  assert.strictEqual(pack.inventory.ok, true);
  assert.strictEqual(pack.levers.ok, true);
  assert.strictEqual(pack.spec.ok, true);
  assert.strictEqual(pack.pr.ok, true);
  assert.strictEqual(pack.changedFiles.ok, true);
});

test('parseChecklist reads the phases span and ignores rows outside it (#1931 decision 7)', () => {
  assert.deepStrictEqual(parseChecklist('- [ ] stray\n<!-- phases-start -->\n- [x] build\n- [ ] test\n<!-- phases-end -->\n- [x] other'), [{ phase: 'build', done: true }, { phase: 'test', done: false }]);
  assert.deepStrictEqual(parseChecklist('no markers'), []);
});

test('ADOPTION_NOTES carry the four prose literals with their placeholders (#1931 AC5)', () => {
  assert.strictEqual(ADOPTION_NOTES[1], 'Resuming existing run directory: {path}');
  assert.strictEqual(ADOPTION_NOTES[2], 'Adopting minted run directory: {path}');
  assert.strictEqual(ADOPTION_NOTES[3], 'Recovering inherited run directory: {path} (missing config.yml; backfilled {worktree registration | PR-early lifecycle | materialize commit} before proceeding).');
  assert.strictEqual(ADOPTION_NOTES[4], 'PIPELINE_RUN_DIR was set to {path}, which {does not exist | is not anchored to the main checkout} — created a fresh run directory instead.');
});
