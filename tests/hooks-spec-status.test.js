// tests/hooks-spec-status.test.js — the `node bin/hooks.js spec-status` CLI
// wrapper (#690): couples a multi-spec manifest.yml status transition to the
// `## Flow: Running ...` progress banner so a phase transition can't happen
// through this command without also producing the banner.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readManifest } = require('../bin/lib/flow/manifest');

const HOOKS = path.join(__dirname, '..', 'bin', 'hooks.js');

function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function runDirWithManifest(specs) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-specstatus-'));
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-16T210742-spec-1-2');
  fs.mkdirSync(run, { recursive: true });
  const lines = ['multispec:', '  parent: x/', '  specs:'];
  for (const s of specs) {
    lines.push(`    - id: ${s.id}`, `      status: ${s.status}`, `      subdir: spec-${s.id}/`);
  }
  fs.writeFileSync(path.join(run, 'manifest.yml'), lines.join('\n') + '\n');
  return run;
}

test('spec-status running: prints exactly the banner and writes status=running to manifest.yml, in one call', () => {
  const run = runDirWithManifest([{ id: 157, status: 'pending' }, { id: 159, status: 'pending' }]);
  const r = runHook(['spec-status', '--run', run, '--spec', '159', '--status', 'running', '--phase', 'build']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '## Flow: Running build (2/2) — spec #159\n');
  const manifest = readManifest(run);
  assert.equal(manifest.multispec.specs[1].status, 'running');
  assert.ok(manifest.multispec.specs[1].startedAt, 'a running transition must record startedAt');
});

test('spec-status complete: prints the banner AND the wrap-up-exit summary line, and writes status=complete', () => {
  const run = runDirWithManifest([{ id: 159, status: 'pending' }]);
  runHook(['spec-status', '--run', run, '--spec', '159', '--status', 'running', '--phase', 'build', '--now', '2026-05-16T14:00:00.000Z']);
  const r = runHook(['spec-status', '--run', run, '--spec', '159', '--status', 'complete', '--phase', 'wrap-up', '--now', '2026-05-16T14:12:34.000Z']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '## Flow: Running wrap-up (1/1) — spec #159\nspec #159: complete — deferred (12m34s)\n');
  assert.equal(readManifest(run).multispec.specs[0].status, 'complete');
});

test('spec-status failed: also prints the summary line', () => {
  const run = runDirWithManifest([{ id: 42, status: 'pending' }]);
  runHook(['spec-status', '--run', run, '--spec', '42', '--status', 'running', '--phase', 'test', '--now', '2026-01-01T00:00:00.000Z']);
  const r = runHook(['spec-status', '--run', run, '--spec', '42', '--status', 'failed', '--phase', 'test', '--now', '2026-01-01T00:03:00.000Z']);
  assert.match(r.stdout, /^## Flow: Running test \(1\/1\) — spec #42\n/);
  assert.match(r.stdout, /spec #42: failed — deferred \(3m00s\)\n$/);
});

test('a phase transition without the banner is not reachable through spec-status: every failure path prints no banner and writes nothing', () => {
  // Missing manifest entirely.
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-specstatus-bare-'));
  const rMissing = runHook(['spec-status', '--run', bareDir, '--spec', '1', '--status', 'running', '--phase', 'build']);
  assert.equal(rMissing.code, 0);
  assert.doesNotMatch(rMissing.stdout, /Flow: Running/);

  // Unknown spec id.
  const run = runDirWithManifest([{ id: 42, status: 'pending' }]);
  const rUnknown = runHook(['spec-status', '--run', run, '--spec', '999', '--status', 'running', '--phase', 'build']);
  assert.doesNotMatch(rUnknown.stdout, /Flow: Running/);
  assert.equal(readManifest(run).multispec.specs[0].status, 'pending', 'no write on an unknown spec id');

  // Invalid status value.
  const rBadStatus = runHook(['spec-status', '--run', run, '--spec', '42', '--status', 'bogus', '--phase', 'build']);
  assert.doesNotMatch(rBadStatus.stdout, /Flow: Running/);
  assert.equal(readManifest(run).multispec.specs[0].status, 'pending', 'no write on an invalid status');

  // Missing required flags.
  const rNoFlags = runHook(['spec-status', '--run', run]);
  assert.match(rNoFlags.stdout, /usage: spec-status/);
  assert.doesNotMatch(rNoFlags.stdout, /Flow: Running/);
});

test('spec-status with a non-existent --run path fails loudly instead of falling back or claiming success', () => {
  const run = runDirWithManifest([{ id: 1, status: 'pending' }]);
  const bogus = path.join(path.dirname(run), 'does-not-exist');
  const result = runHook(['spec-status', '--run', bogus, '--spec', '1', '--status', 'running', '--phase', 'build']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /--run path not found/);
});

test('spec-status without a resolvable run dir exits 0 and prints a not-recorded notice', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-specstatus-norun-'));
  const result = runHook(['spec-status', '--spec', '1', '--status', 'running', '--phase', 'build'], { cwd: bare });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /no pipeline run dir found — spec status not recorded/);
});
