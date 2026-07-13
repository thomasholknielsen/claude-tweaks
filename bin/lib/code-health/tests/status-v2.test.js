'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'code-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-status-v2-')); }

function writeV2Cache(root, entries) {
  // entries: [{ fp, status, severity, risk }]
  const cache = {};
  for (const e of entries) cache[e.fp] = { status: e.status, severity: e.severity, risk: e.risk, issue: null };
  const p = path.join(root, '.claude-tweaks', 'code-health', 'cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

// 'remembered' entries no longer live in local cache.json (see
// bin/lib/code-health/cache.js / bin/code-health.js's cmdValidateFindings) —
// they live in the durable remembered.json on the health-state branch instead
// (cmdStatus derives its remembered count from readDurableState(root).remembered).
// readDurableState's read path is pure git plumbing (fetch + show), so it can
// be exercised for real without gh/network: seed a local bare repo as
// `origin` and commit remembered.json directly onto a health-state branch —
// the same technique bin/lib/code-health/tests/cli-nextslice.test.js uses for
// cursors and bin/lib/code-health/tests/churn-v2.test.js uses for runs.
function seedDurableRemembered(root, remembered) {
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-status-bare-'));
  execFileSync('git', ['init', '--bare', '-q', bareDir]);
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-status-seed-'));
  execFileSync('git', ['init', '-q', seedDir]);
  execFileSync('git', ['-C', seedDir, 'checkout', '-q', '-b', 'health-state']);
  fs.mkdirSync(path.join(seedDir, 'code-health'), { recursive: true });
  fs.writeFileSync(path.join(seedDir, 'code-health', 'remembered.json'), JSON.stringify(remembered));
  execFileSync('git', ['-C', seedDir, 'add', '-A']);
  execFileSync(
    'git',
    ['-C', seedDir, '-c', 'user.email=test@example.com', '-c', 'user.name=test', 'commit', '-q', '-m', 'seed'],
  );
  execFileSync('git', ['-C', seedDir, 'push', '-q', bareDir, 'health-state']);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', bareDir], { cwd: root });
}

test('status prints open and regressed counts from v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'recon-ccccdddd', status: 'regressed', severity: 'high' },
    { fp: 'recon-eeeeffff', status: 'closed', severity: 'low' },
  ]);
  const out = execFileSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.ok(out.includes('open:1'), `expected open:1 in: ${out}`);
  assert.ok(out.includes('regressed:1'), `expected regressed:1 in: ${out}`);
  assert.ok(out.includes('closed:1'), `expected closed:1 in: ${out}`);
});

test('status prints the remembered count from the durable remembered store', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
  ]);
  seedDurableRemembered(root, {
    'recon-ccccdddd': { status: 'remembered', issue: null, severity: 'medium', risk: null },
    'recon-eeeeffff': { status: 'remembered', issue: null, severity: 'low', risk: null },
  });
  const out = execFileSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.ok(out.includes('open:1'), `expected open:1 in: ${out}`);
  assert.ok(out.includes('remembered:2'), `expected remembered:2 in: ${out}`);
});

test('status --fail-on regressed exits 1 when regressed entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'recon-ccccdddd', status: 'regressed', severity: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});

test('status --fail-on risk-high exits 1 when open risk-high entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'high', risk: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'risk-high', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});

test('status --fail-on regressed exits 0 when no regressed entries', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
});
