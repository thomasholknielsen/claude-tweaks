'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-qa-evidence-')); }

function writeReport(root, overrides = {}) {
  const report = {
    timestamp: '2026-07-01T00:00:00.000Z',
    stories: [{ id: 'story-1', status: 'PASS' }],
    findings: [],
    ...overrides,
  };
  const file = path.join(root, 'report.json');
  fs.writeFileSync(file, JSON.stringify(report));
  return file;
}

const FIXED_NOW = String(Date.parse('2026-07-11T00:00:00.000Z'));

test('qa-evidence prints satisfied when all named stories passed', () => {
  const root = tmp();
  const reportFile = writeReport(root);
  const raw = execFileSync('node', [CLI, 'qa-evidence', reportFile, '--story-ids', 'story-1', '--now', FIXED_NOW], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(raw), { verdict: 'satisfied' });
});

test('qa-evidence prints a regression finding for a code-bug failure', () => {
  const root = tmp();
  const reportFile = writeReport(root, {
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'code-bug', severity: 'High', finding: 'Checkout button is missing' }],
  });
  const raw = execFileSync('node', [CLI, 'qa-evidence', reportFile, '--story-ids', 'story-1', '--now', FIXED_NOW], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.verdict, 'regression');
  assert.strictEqual(result.finding.severity, 'high');
});

test('qa-evidence prints inconclusive when no story ids are given', () => {
  const root = tmp();
  const reportFile = writeReport(root);
  const raw = execFileSync('node', [CLI, 'qa-evidence', reportFile, '--now', FIXED_NOW], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(raw).verdict, 'inconclusive');
});

test('qa-evidence exits non-zero for a missing report file argument', () => {
  const result = spawnSync('node', [CLI, 'qa-evidence', '--story-ids', 'story-1'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
