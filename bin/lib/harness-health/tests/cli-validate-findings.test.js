'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-vf-')); }

function runValidateFindings(root, findingsFile, extraArgs = []) {
  return spawnSync('node', [CLI, 'validate-findings', findingsFile, '--root', root, ...extraArgs], { encoding: 'utf8' });
}

function validFinding(overrides = {}) {
  return {
    kind: 'patch',
    target: 'auth',
    assetType: 'skill',
    category: 'drift',
    section: 'Key Patterns',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stale example path',
    oldString: 'See `src/auth/login.js`.',
    newString: 'See `src/auth/session.js`.',
    reason: 'login.js was renamed to session.js.',
    ...overrides,
  };
}

test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.ok(payloads[0].labels.includes('harness-health'));
  assert.ok(payloads[0].body.includes('<!-- harness-health-fingerprint: harnesshealth-'));
});

test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { kind: 'patch', target: 'auth' }; // missing required fields
  const good = validFinding({ target: 'billing', description: 'other issue' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([malformed, good]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.ok(result.stderr.includes('dropped'));
});

test('validate-findings: --dry-run emits payloads but writes no state', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const result = runValidateFindings(root, findingsFile, ['--dry-run', '--target', 'auth', '--kind', 'skill', '--gap-scan']);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(JSON.parse(result.stdout).length, 1);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json')), false);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json')), false);
});

test('validate-findings: --target <id> --kind <kind> records the audit cursor under the namespaced key', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([])); // an empty array is valid — still records the audit

  const result = runValidateFindings(root, findingsFile, ['--target', 'auth', '--kind', 'skill']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json'), 'utf8'));
  assert.ok(typeof cursors['skill:auth'].lastAuditedMs === 'number');
});

test('validate-findings: --gap-scan records the global gap-scan cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([]));

  const result = runValidateFindings(root, findingsFile, ['--gap-scan']);
  assert.strictEqual(result.status, 0);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json'), 'utf8'));
  assert.ok(typeof cursors.__gapScan.lastScannedMs === 'number');
});

test('validate-findings: a finding already open in the issue index is skipped (dedup)', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const first = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*harness-health-fingerprint:\s*(harnesshealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['harness-health'], fingerprint: fp }]));

  const second = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(JSON.parse(second.stdout).length, 0, 'open finding must be skipped');
});

test('validate-findings: a malformed --issues file degrades gracefully with a stderr warning, not a hard failure', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const badIssuesFile = path.join(root, 'bad-issues.json');
  fs.writeFileSync(badIssuesFile, 'not valid json{{{');

  const result = runValidateFindings(root, findingsFile, ['--issues', badIssuesFile]);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('could not read or parse --issues file'), `expected a warning in stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'must still file the finding, just without issue-based dedup');
});

test('validate-findings: exits non-zero when the findings file is missing', () => {
  const root = tmp();
  const result = runValidateFindings(root, path.join(root, 'nonexistent.json'));
  assert.notStrictEqual(result.status, 0);
});

test('churn-report: prints "no run logs found" when no runs exist', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('no run logs found'));
});

test('churn-report: a real run followed by churn-report prints a table row', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));
  runValidateFindings(root, findingsFile, ['--run-id', 'run-1']);

  const result = spawnSync('node', [CLI, 'churn-report', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('run-1'));
});

test('validate-findings: a finding matching a closed non-wontfix issue is reopened, not dropped', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const first = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*harness-health-fingerprint:\s*(harnesshealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 9, state: 'closed', labels: ['harness-health'], fingerprint: fp }]));

  const second = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(second.status, 0, `stderr: ${second.stderr}`);
  const payloads = JSON.parse(second.stdout);
  assert.strictEqual(payloads.length, 1, 'a regressed finding must still emit a payload, not be silently dropped');

  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache[fp].status, 'regressed');
  assert.strictEqual(cache[fp].issue, 9);
});

test('validate-findings: a recordRun failure is non-fatal — payloads still emit on stdout', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  // Pre-create the runs directory's path as a regular file, so recordRun's own
  // fs.mkdirSync(runsDir, {recursive: true}) throws instead of succeeding.
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'harness-health'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'runs'), 'blocks the runs directory');

  const result = runValidateFindings(root, findingsFile, ['--run-id', 'test-run-1']);
  assert.strictEqual(result.status, 0, `expected non-fatal exit, got stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'payload must still emit despite the persistence failure');
  assert.ok(result.stderr.includes('non-fatal'), `expected a non-fatal warning in stderr, got: ${result.stderr}`);
});
