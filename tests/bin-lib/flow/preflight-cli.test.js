'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'flow-preflight.js');
const { run } = require(CLI);

function mainCheckoutWithRun() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-cli-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't'); git('commit', '-q', '--allow-empty', '-m', 'init');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-record-7');
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'mode: auto\nceremony-profile: standard\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ worktree: root, status: 'active', pr: { number: 42, branch: 'main' } }));
  fs.writeFileSync(path.join(runDir, 'work', '7-spec.md'), '---\nrecord: 7\n---\n');
  return { root, runDir };
}

const packDeps = {
  execFileAsync: async (cmd, args) => {
    if (cmd === 'gh') { const e = new Error('spawn gh ENOENT'); e.code = 'ENOENT'; throw e; }
    if (args.includes('--stamp-status')) return JSON.stringify({ present: false, match: false, verifiedHead: false });
    return JSON.stringify({ base: 'abc', files: [] });
  },
  resolvePolicy: (keys) => Object.fromEntries(keys.map((k) => [k, { value: k === 'integration-branch' ? 'main' : 'x', source: 'default' }])),
  checkResumeFreshness: () => ({ safe: true, verdict: 'not-interrupted' }),
  checkStagedInventory: () => ({ checked: 0, missing: [] }),
};

function baseDeps(fx) {
  let out = ''; let err = '';
  return { d: { cwd: () => fx.root, mainRoot: fx.root, stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, packDeps }, out: () => out, err: () => err };
}

test('run: an anchored run dir → exit 0, preflight.json written with every field, pr.ok false under a missing gh (#1931 AC4)', async () => {
  const fx = mainCheckoutWithRun();
  const { d, out } = baseDeps(fx);
  const code = await run(['--run', fx.runDir, '--steps', 'review,polish,wrap-up'], d);
  assert.strictEqual(code, 0);
  const file = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'preflight.json'), 'utf8'));
  assert.deepStrictEqual(file.steps, ['review', 'polish', 'wrap-up']);
  for (const k of ['adoption', 'freshness', 'inventory', 'levers', 'spec', 'pr', 'stamp', 'changedFiles']) assert.ok(k in file, k);
  assert.strictEqual(file.pr.ok, false);
  assert.strictEqual(file.adoption.value.case, 1);
  assert.strictEqual(JSON.parse(out()).adoption.value.case, 1, 'the pack is printed to stdout');
});

test('run: a BLOCKED freshness verdict is data — still exit 0 (#1931 AC3)', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx);
  d.packDeps = { ...packDeps, checkResumeFreshness: () => ({ safe: false, verdict: 'BLOCKED', reason: 'lock pid live' }) };
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review'], d), 0);
  const file = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'preflight.json'), 'utf8'));
  assert.strictEqual(file.freshness.value.verdict, 'BLOCKED');
});

test('run: a --run outside the main checkout exits 3 and writes nothing (#1931 AC4)', async () => {
  const fx = mainCheckoutWithRun();
  const shadow = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-shadow-'));
  fs.writeFileSync(path.join(shadow, 'config.yml'), 'mode: auto\n');
  const { d, err } = baseDeps(fx);
  assert.strictEqual(await run(['--run', shadow, '--steps', 'review'], d), 3);
  assert.match(err(), /not anchored|missing/);
  assert.ok(!fs.existsSync(path.join(shadow, 'preflight.json')));
});

test('run: malformed invocations exit 2 — missing --run, missing --steps, unknown flag (#1931)', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx);
  assert.strictEqual(await run(['--steps', 'review'], d), 2);
  assert.strictEqual(await run(['--run', fx.runDir], d), 2);
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review', '--bogus'], d), 2);
});

test('run: --json redirects the write inside the anchored target; a symlinked escape is refused (#1931, [IL-150])', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx);
  const dest = path.join(fx.root, 'preflight-copy.json');
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review', '--json', dest], d), 0);
  assert.ok(fs.existsSync(dest));
  assert.ok(!fs.existsSync(path.join(fx.runDir, 'preflight.json')));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-escape-'));
  fs.symlinkSync(outside, path.join(fx.runDir, 'escape'));
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review', '--json', path.join(fx.runDir, 'escape', 'p.json')], d), 3);
  assert.ok(!fs.existsSync(path.join(outside, 'p.json')));
});
