'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-vf-'));
}

function runValidateFindings(root, findingsFile, extraArgs = []) {
  const result = spawnSync(
    'node',
    [CLI, 'validate-findings', findingsFile, '--root', root, ...extraArgs],
    { encoding: 'utf8' },
  );
  return result;
}

function validFinding(overrides = {}) {
  return {
    criterion: 'simplification',
    areaId: 'src/api',
    anchor: 'src/api/user.js#getUser',
    severity: 'medium',
    confidence: 'high',
    title: 'getUser is a passthrough',
    evidence: 'getUser delegates directly to UserRepository.find with no added logic.',
    suggestedApproach: 'Inline the call or add caching.',
    acceptance: 'getUser adds caching or is removed.',
    ...overrides,
  };
}

test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  const payloads = JSON.parse(result.stdout);
  assert.ok(Array.isArray(payloads), 'stdout must be a JSON array');
  assert.strictEqual(payloads.length, 1, 'expected 1 payload');
  assert.ok(payloads[0].title === f.title, 'title mismatch');
  assert.ok(Array.isArray(payloads[0].labels), 'labels must be an array');
  assert.ok(payloads[0].labels.includes('recon'), 'missing recon label');
  assert.ok(payloads[0].labels.includes('recon:simplification'), 'missing criterion label');
  assert.ok(payloads[0].body.includes('<!-- recon-fingerprint: recon-'), 'fingerprint marker missing');
});

test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { criterion: 'simplification', severity: 'medium' }; // missing required fields
  const good = validFinding({ criterion: 'dead-code', anchor: 'src/util.js#trimPath', title: 'trimPath is unused' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([malformed, good]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0);

  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'only the valid finding should survive');
  assert.ok(result.stderr.includes('dropped'), `expected "dropped" in stderr: ${result.stderr}`);
});

test('validate-findings: --dry-run emits payloads but does not write cache', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--dry-run']);
  assert.strictEqual(result.status, 0);

  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')),
    false,
    'cache must not be written in dry-run',
  );
});

test('validate-findings: finding already open in issue index is skipped (dedup)', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  // First run to learn the fingerprint.
  const firstResult = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(firstResult.stdout);
  assert.strictEqual(firstPayloads.length, 1);
  const fp = firstPayloads[0].body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/)[1];

  // Build an issue index pretending the fingerprint is already open.
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['recon'], fingerprint: fp }]));

  const secondResult = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(secondResult.status, 0);
  const secondPayloads = JSON.parse(secondResult.stdout);
  assert.strictEqual(secondPayloads.length, 0, 'open finding must be skipped (dedup)');
});

test('validate-findings: exits non-zero when findings file is missing', () => {
  const root = tmp();
  const result = runValidateFindings(root, path.join(root, 'nonexistent.json'));
  assert.notStrictEqual(result.status, 0, 'should exit non-zero for missing file');
});

test('validate-findings: writes cache after a non-dry-run', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0);
  assert.ok(
    fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')),
    'cache must be written after a non-dry-run',
  );
});
