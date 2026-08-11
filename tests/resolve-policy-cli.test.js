// tests/resolve-policy-cli.test.js — spawn tests for bin/resolve-policy.js
// (#329). Every test builds a throwaway fixture repo under os.tmpdir() —
// NEVER inside this repo, where `git rev-parse --show-toplevel` from the
// fixture dir would resolve THIS repo's root and read the live policy.yml
// (IL-80's scheduled-failure trap) — copies frozen fixture files from
// tests/fixtures/resolve-policy/ into it, and spawns the CLI with cwd set to
// the temp dir. os.tmpdir() is outside any git repo, so the CLI's repo-root
// resolution falls back to the spawn cwd, which is exactly the fixture root.
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'resolve-policy.js');
const FIXTURES = path.join(__dirname, 'fixtures', 'resolve-policy');

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// Builds a fixture repo root in a fresh temp dir. `policy` names a frozen
// fixture copied to {tmp}/.claude-tweaks/policy.yml (omit for no policy
// file). `runConfig` names one copied to {tmp}/run/config.yml; pass null to
// create the run dir WITHOUT a config.yml.
function makeFixtureRepo({ policy, runConfig } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-policy-'));
  tempDirs.push(tmp);
  if (policy) {
    fs.mkdirSync(path.join(tmp, '.claude-tweaks'));
    fs.copyFileSync(path.join(FIXTURES, policy), path.join(tmp, '.claude-tweaks', 'policy.yml'));
  }
  let runDir = null;
  if (runConfig !== undefined) {
    runDir = path.join(tmp, 'run');
    fs.mkdirSync(runDir);
    if (runConfig !== null) fs.copyFileSync(path.join(FIXTURES, runConfig), path.join(runDir, 'config.yml'));
  }
  return { tmp, runDir };
}

function runCli(args, cwd, env = process.env) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env });
}

// Success-path invariants asserted in one place: exit 0, silent stderr, and
// stdout that is exactly one JSON object line.
function runOk(args, cwd, env) {
  const res = runCli(args, cwd, env);
  assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}; stderr: ${res.stderr}`);
  assert.strictEqual(res.stderr, '', 'success paths write nothing to stderr');
  assert.strictEqual(res.stdout, `${res.stdout.trim()}\n`, 'stdout is one JSON line, no trailing prose');
  return JSON.parse(res.stdout);
}

test('AC 1: autonomy set in policy.yml resolves with source policy', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const out = runOk(['autonomy'], tmp);
  assert.deepStrictEqual(out, { autonomy: { value: 'unattended', source: 'policy' } });
});

test('AC 2: key absent from the fixture resolves to the schema default', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-empty.yml' });
  const out = runOk(['autonomy'], tmp);
  assert.deepStrictEqual(out, { autonomy: { value: 'supervised', source: 'default' } });
  assert.ok(!('invalid' in out.autonomy), 'known-but-unset carries no invalid flag');
});

test('AC 2 variant: no policy.yml at all still resolves defaults', () => {
  const { tmp } = makeFixtureRepo({});
  const out = runOk(['autonomy'], tmp);
  assert.deepStrictEqual(out, { autonomy: { value: 'supervised', source: 'default' } });
});

test('AC 3: --run overlay wins for its keys; absent keys fall to policy, then default', () => {
  const { tmp, runDir } = makeFixtureRepo({ policy: 'policy-basic.yml', runConfig: 'run-config-override.yml' });
  const out = runOk(['--run', runDir, 'dispatch-retry-ceiling', 'autonomy', 'tidy-aggressiveness'], tmp);
  assert.deepStrictEqual(out['dispatch-retry-ceiling'], { value: 7, source: 'run-config' });
  assert.deepStrictEqual(out.autonomy, { value: 'unattended', source: 'policy' });
  assert.deepStrictEqual(out['tidy-aggressiveness'], { value: 'conservative', source: 'default' });
});

test('AC 4: unknown key is a per-key error entry; siblings still resolve; exit 0', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const out = runOk(['made-up-lever', 'autonomy'], tmp);
  assert.deepStrictEqual(out['made-up-lever'], { error: 'unknown-key' });
  assert.ok(!('value' in out['made-up-lever']) && !('source' in out['made-up-lever']), 'error entries carry no value/source');
  assert.deepStrictEqual(out.autonomy, { value: 'unattended', source: 'policy' });
});

test('AC 5: alias-only fixture resolves dispatch-batch-size with renamed-from', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-alias.yml' });
  const out = runOk(['dispatch-batch-size'], tmp);
  assert.deepStrictEqual(out['dispatch-batch-size'], {
    value: 5,
    source: 'policy',
    'renamed-from': 'dispatch-pick-max-concurrent',
  });
});

test('AC 6: integer and boolean keys arrive as native JSON types, never strings', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const out = runOk(['dispatch-retry-ceiling', 'worktree.always'], tmp);
  assert.strictEqual(typeof out['dispatch-retry-ceiling'].value, 'number');
  assert.strictEqual(out['dispatch-retry-ceiling'].value, 5);
  assert.strictEqual(typeof out['worktree.always'].value, 'boolean');
  assert.strictEqual(out['worktree.always'].value, true);
});

test('AC 7: malformed value resolves to the schema default with invalid: true', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-invalid.yml' });
  const out = runOk(['trust-revert-window-days'], tmp);
  assert.deepStrictEqual(out['trust-revert-window-days'], { value: 14, source: 'default', invalid: true });
});

test('AC 8: run-config unattended-tier: off resolves autonomy to the default with renamed-from', () => {
  const { tmp, runDir } = makeFixtureRepo({ runConfig: 'run-config-unattended-tier.yml' });
  const out = runOk(['--run', runDir, 'autonomy'], tmp);
  assert.deepStrictEqual(out.autonomy, {
    value: 'supervised',
    source: 'default',
    'renamed-from': 'unattended-tier',
  });
});

test('AC 9: model-profiles absent -> null/default; present -> parsed rows with source policy', () => {
  const absent = makeFixtureRepo({ policy: 'policy-empty.yml' });
  const absentOut = runOk(['model-profiles'], absent.tmp);
  assert.deepStrictEqual(absentOut['model-profiles'], { value: null, source: 'default' });

  const present = makeFixtureRepo({ policy: 'policy-model-profiles.yml' });
  const presentOut = runOk(['model-profiles'], present.tmp);
  assert.deepStrictEqual(presentOut['model-profiles'], {
    value: { capable: { model: 'opus', effort: 'high' } },
    source: 'policy',
  });
});

test('model-profiles malformed block resolves to null/default with invalid: true', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-model-profiles-bad.yml' });
  const out = runOk(['model-profiles'], tmp);
  assert.deepStrictEqual(out['model-profiles'], { value: null, source: 'default', invalid: true });
});

test('AC 10: correct output with CLAUDE_PLUGIN_ROOT deleted from the child env', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_ROOT;
  const out = runOk(['autonomy'], tmp, env);
  assert.deepStrictEqual(out, { autonomy: { value: 'unattended', source: 'policy' } });
});

test('zero positional keys: exit 1, stderr usage message, no JSON on stdout', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const res = runCli([], tmp);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /usage/);
  assert.strictEqual(res.stdout, '');
});

test('nonexistent --run dir: exit 1, stderr message, no JSON on stdout', () => {
  const { tmp } = makeFixtureRepo({ policy: 'policy-basic.yml' });
  const res = runCli(['--run', path.join(tmp, 'no-such-run'), 'autonomy'], tmp);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /does not exist/);
  assert.strictEqual(res.stdout, '');
});

test('existing --run dir WITHOUT config.yml: exit 0, no overlay', () => {
  const { tmp, runDir } = makeFixtureRepo({ policy: 'policy-basic.yml', runConfig: null });
  const out = runOk(['--run', runDir, 'autonomy'], tmp);
  assert.deepStrictEqual(out, { autonomy: { value: 'unattended', source: 'policy' } });
});
