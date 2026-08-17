const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-mark-')); }

test('mark writes a declined status to the cache', () => {
  const root = tmp();
  execFileSync('node', [CLI, 'mark', 'journeyhealth-xyz98765', 'declined', '--root', root], { encoding: 'utf8' });
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'journey-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['journeyhealth-xyz98765'].status, 'declined');
});

test('mark exits non-zero for an invalid status (journey-health never had "applied")', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', 'journeyhealth-abc12345', 'applied', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('mark exits non-zero when the fingerprint arg is missing', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
