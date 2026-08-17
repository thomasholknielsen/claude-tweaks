const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-mark-')); }

test('mark exits non-zero for "applied" now that harness-health is report-only', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', 'skillhealth-abc12345', 'applied', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('mark writes a declined status to the cache', () => {
  const root = tmp();
  execFileSync('node', [CLI, 'mark', 'skillhealth-xyz98765', 'declined', '--root', root], { encoding: 'utf8' });
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['skillhealth-xyz98765'].status, 'declined');
});

test('mark exits non-zero for an invalid status', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', 'skillhealth-abc12345', 'bogus', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('mark exits non-zero when the fingerprint arg is missing', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('a finding marked declined is suppressed by a later validate-findings run on the same fingerprint', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  const finding = {
    kind: 'patch', target: 'auth', assetType: 'skill', category: 'drift', section: 'Auth', classification: 'restructural',
    confidence: 'high', reversibility: 'med', description: 'x', oldString: 'a', newString: 'b', reason: 'y',
  };
  fs.writeFileSync(findingsFile, JSON.stringify([finding]));
  const first = JSON.parse(execFileSync(
    'node', [CLI, 'validate-findings', findingsFile, '--root', root, '--target', 'auth', '--kind', 'skill'], { encoding: 'utf8' },
  ));
  assert.strictEqual(first.length, 1, 'first run must file the finding');
  const fp = first[0].id;
  execFileSync('node', [CLI, 'mark', fp, 'declined', '--root', root], { encoding: 'utf8' });
  const second = JSON.parse(execFileSync(
    'node', [CLI, 'validate-findings', findingsFile, '--root', root, '--target', 'auth', '--kind', 'skill'], { encoding: 'utf8' },
  ));
  assert.strictEqual(second.length, 0, 'declined finding must be suppressed on the next run');
});
