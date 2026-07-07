const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeCursors } = require('../cache');

const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-nt-')); }
function runNextTarget(args, root) {
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

test('next-target returns { target: null, gapScanDue: true } for a project with no skills yet', () => {
  const root = tmp();
  const result = runNextTarget([], root);
  assert.strictEqual(result.target, null);
  assert.strictEqual(result.gapScanDue, true, 'a never-scanned project is due for its first gap scan');
});

test('next-target picks a never-audited skill as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const result = runNextTarget([], root);
  assert.ok(result.target !== null);
  assert.strictEqual(result.target.id, 'auth');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --skill <id> bypasses selection and returns why: "manual"', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const result = runNextTarget(['--skill', 'billing'], root);
  assert.strictEqual(result.target.id, 'billing');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target gapScanDue is false right after a gap scan was recorded (via --gap-scan on validate-findings)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  writeCursors(root, { __gapScan: { lastScannedSha: null, lastScannedMs: Date.now() } });
  const result = runNextTarget([], root);
  assert.strictEqual(result.gapScanDue, false);
});

test('next-target --budget 2 returns an array of up to 2 unique targets', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, '--budget', '2'], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.ok(Array.isArray(result.targets), 'must return a targets array when --budget > 1');
  assert.ok(result.targets.length >= 1 && result.targets.length <= 2);
  const ids = result.targets.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'budget results must have unique ids');
});

test('next-target without --budget still returns a single target object (default budget=1, no shape regression)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const result = runNextTarget([], root);
  assert.ok(!Array.isArray(result.target), 'default (no --budget) must not change the existing target shape');
  assert.strictEqual(result.target.id, 'auth');
});
