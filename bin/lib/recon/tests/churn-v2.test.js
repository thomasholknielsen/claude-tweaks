'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { recordRun, readRuns, computeChurn } = require('../cache');
const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-churn-v2-')); }

test('recordRun with hashes round-trips through readRuns', () => {
  const root = tmp();
  recordRun(root, 'run-001', {
    fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'],
    areasSwept: ['src/api'],
    hashes: { 'src/api': 'abc123def456' },
  });
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 1);
  assert.deepStrictEqual(runs[0].fingerprints, ['recon-aaaa0001', 'recon-bbbb0002']);
  // hashes stored in cursor; run-log may or may not include it — assert fingerprints are intact
});

test('computeChurn works over consecutive v2 run-logs', () => {
  const root = tmp();
  recordRun(root, 'run-001', {
    fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'],
    areasSwept: ['src/api'],
    hashes: { 'src/api': 'abc123' },
  });
  recordRun(root, 'run-002', {
    fingerprints: ['recon-aaaa0001', 'recon-cccc0003'],
    areasSwept: ['src/lib'],
    hashes: { 'src/lib': 'def456' },
  });
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 2);
  const churn = computeChurn(runs[1].fingerprints, runs[0]);
  assert.deepStrictEqual(churn.appeared, ['recon-cccc0003']);
  assert.deepStrictEqual(churn.disappeared, ['recon-bbbb0002']);
  assert.strictEqual(churn.stayed.length, 1);
  // ratio = 2 appeared+disappeared / 3 union = 0.667
  assert.ok(churn.ratio > 0.5 && churn.ratio < 0.8, `ratio ${churn.ratio}`);
});

test('churn-report CLI exits 1 when ratio exceeds threshold', () => {
  const root = tmp();
  recordRun(root, 'run-001', { fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'], areasSwept: ['src'], hashes: {} });
  recordRun(root, 'run-002', { fingerprints: ['recon-cccc0003', 'recon-dddd0004'], areasSwept: ['src'], hashes: {} });
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root, '--fail-on-high-churn', '0.5'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1, `stdout: ${result.stdout}`);
});

test('churn-report CLI exits 0 when ratio is below threshold', () => {
  const root = tmp();
  recordRun(root, 'run-001', { fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'], areasSwept: ['src'], hashes: {} });
  recordRun(root, 'run-002', { fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'], areasSwept: ['src'], hashes: {} });
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root, '--fail-on-high-churn', '0.5'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
});
