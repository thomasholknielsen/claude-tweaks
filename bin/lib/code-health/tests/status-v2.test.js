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
  // entries: [{ fp, status, severity }]
  const cache = {};
  for (const e of entries) cache[e.fp] = { status: e.status, severity: e.severity, issue: null };
  const p = path.join(root, '.claude-tweaks', 'code-health', 'cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
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

test('status prints the remembered count from v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'recon-ccccdddd', status: 'remembered', severity: 'medium' },
    { fp: 'recon-eeeeffff', status: 'remembered', severity: 'low' },
  ]);
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

test('status --fail-on critical exits 1 when open critical entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'critical' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'critical', '--root', root], { encoding: 'utf8' });
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
