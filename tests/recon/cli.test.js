'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const recon = require('../../bin/recon');

const CLI = path.join(__dirname, '..', '..', 'bin', 'recon.js');

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cli-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'recon'), { recursive: true });
  return root;
}

function writeCache(root, cache) {
  fs.writeFileSync(
    path.join(root, '.claude-tweaks', 'recon', 'cache.json'),
    JSON.stringify(cache, null, 2),
    'utf8',
  );
}

test('selectAreas delegates to scoreAreas and slices top-K', () => {
  // Inject deterministic signals so the test does not shell out to git.
  const areas = [
    { id: 'src/api', path: 'src/api' },
    { id: 'src/util', path: 'src/util' },
    { id: 'src/old', path: 'src/old' },
  ];
  const signals = {
    'src/api': { lastSweptMs: Date.now() - 86400000, churn: 30, loc: 4000, priorFindings: 8, fanIn: 12 },
    'src/util': { lastSweptMs: Date.now() - 86400000, churn: 1, loc: 200, priorFindings: 0, fanIn: 1 },
    'src/old': { lastSweptMs: null, churn: 0, loc: 0, priorFindings: 0, fanIn: 0 },
  };
  const picked = recon.selectAreas(
    { K: 2 },
    { areas, signals, now: Date.now() },
  );
  assert.strictEqual(picked.length, 2);
  // src/old (never swept → boosted) and src/api (hot) outrank src/util.
  const ids = picked.map((a) => a.id);
  assert.ok(ids.includes('src/old'));
  assert.ok(ids.includes('src/api'));
  assert.ok(!ids.includes('src/util'));
});

test('status prints counts and exits 0 with no regressions', () => {
  const root = tmpRepo();
  writeCache(root, {
    'fp-1': { status: 'open', severity: 'low' },
    'fp-2': { status: 'closed' },
    'fp-3': { status: 'wontfix' },
  });
  const r = spawnSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /open:1/);
  assert.match(r.stdout, /closed:1/);
  assert.match(r.stdout, /wontfix:1/);
});

test('status --fail-on regressed exits 1 when a finding regressed', () => {
  const root = tmpRepo();
  writeCache(root, { 'fp-1': { status: 'regressed' } });
  const r = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /regressed:1/);
});

test('status --fail-on critical exits 1 when an open critical exists', () => {
  const root = tmpRepo();
  writeCache(root, { 'fp-1': { status: 'open', severity: 'critical' } });
  const r = spawnSync('node', [CLI, 'status', '--fail-on', 'critical', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
});

test('churn-report --fail-on-high-churn exits 1 above threshold', () => {
  const root = tmpRepo();
  const runs = path.join(root, '.claude-tweaks', 'recon', 'runs');
  fs.mkdirSync(runs, { recursive: true });
  fs.writeFileSync(path.join(runs, 'r1.json'), JSON.stringify({ runId: 'r1', runAt: '2026-06-13T00:00:00Z', fingerprints: ['fp-a', 'fp-b'] }));
  fs.writeFileSync(path.join(runs, 'r2.json'), JSON.stringify({ runId: 'r2', runAt: '2026-06-14T00:00:00Z', fingerprints: ['fp-c', 'fp-d'] }));
  const r = spawnSync('node', [CLI, 'churn-report', '--fail-on-high-churn', '0.5', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /1\b/); // ratio 1.0 row present
});

