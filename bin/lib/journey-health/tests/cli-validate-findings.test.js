const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-validate-')); }

function finding(overrides = {}) {
  return {
    journey: 'checkout-flow', category: 'drift', section: 'self-review',
    description: 'Persona is a placeholder', reason: 'Step 2 has no named persona',
    confidence: 'high', severity: 'high', recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}

test('validate-findings files a brand-new valid finding and persists a cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));
  const raw = execFileSync('node', [CLI, 'validate-findings', findingsFile, '--target', 'checkout-flow', '--tier', 'light', '--root', root], { encoding: 'utf8' });
  const payloads = JSON.parse(raw);
  assert.strictEqual(payloads.length, 1);
  assert.strictEqual(payloads[0].journey, 'checkout-flow');
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json'), 'utf8'));
  assert.ok(cursors['checkout-flow'].lastLightAuditMs);
});

test('validate-findings drops an invalid finding and reports 0 payloads', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding({ category: 'bogus' })]));
  const raw = execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(raw), []);
});

test('validate-findings --dry-run does not write cursor or cache state', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));
  execFileSync('node', [CLI, 'validate-findings', findingsFile, '--target', 'checkout-flow', '--dry-run', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json')), false);
});

test('validate-findings --coverage-scan records the coverage-scan cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding({ category: 'coverage', section: 'coverage' })]));
  execFileSync('node', [CLI, 'validate-findings', findingsFile, '--coverage-scan', '--root', root], { encoding: 'utf8' });
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json'), 'utf8'));
  assert.ok(cursors.__coverageScan.lastScannedMs);
});

test('a finding marked declined is suppressed by a later validate-findings run on the same fingerprint', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));
  const first = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(first.length, 1, 'first run must file the finding');
  const fp = first[0].id;
  execFileSync('node', [CLI, 'mark', fp, 'declined', '--root', root], { encoding: 'utf8' });
  const second = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(second.length, 0, 'declined finding must be suppressed on the next run');
});

test('validate-findings exits non-zero for a missing findings file argument', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'validate-findings', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('validate-findings: a finding matching a closed non-wontfix issue is reopened, not dropped', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));

  const first = spawnSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' });
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*journey-health-fingerprint:\s*(journeyhealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 9, state: 'closed', labels: ['journey-health'], fingerprint: fp }]));

  const second = spawnSync('node', [CLI, 'validate-findings', findingsFile, '--root', root, '--issues', issuesFile], { encoding: 'utf8' });
  assert.strictEqual(second.status, 0, `stderr: ${second.stderr}`);
  const payloads = JSON.parse(second.stdout);
  assert.strictEqual(payloads.length, 1, 'a regressed finding must still emit a payload, not be silently dropped');

  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'journey-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache[fp].status, 'regressed');
  assert.strictEqual(cache[fp].issue, 9);
});
