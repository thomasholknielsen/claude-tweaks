'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const recon = require('../../bin/recon');

const CLI = path.join(__dirname, '..', '..', 'bin', 'recon.js');

// Minimal well-formed finding that passes validateFinding; severity is 'critical'.
const CRITICAL_FINDING = {
  title: 'Critical issue',
  lens: 'oversized-file',
  category: 'Architecture',
  severity: 'critical',
  confidence: 'high',
  area: 'src',
  signature: 'oversized-file:src:critical',
  evidence: 'file is huge',
  suggestion: 'split it',
  acceptance: 'file < 300 lines',
  files: ['src/big.js'],
};

// Same shape but severity 'high', used to test reopen path.
const HIGH_FINDING = {
  ...CRITICAL_FINDING,
  title: 'High issue',
  severity: 'high',
  signature: 'oversized-file:src:high',
};

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

function readCacheJson(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json'), 'utf8'),
  );
}

// Runs ingest-judgment with an in-memory results array written to a temp file.
function runIngest(root, findings, issuesFile) {
  const resultsFile = path.join(root, 'results.json');
  // ingest-judgment expects [{lensId, area, findings}]
  const wrapped = [{ lensId: findings[0].lens, area: findings[0].area, findings }];
  fs.writeFileSync(resultsFile, JSON.stringify(wrapped), 'utf8');
  const extraArgs = issuesFile ? ['--issues', issuesFile] : [];
  return spawnSync(
    'node',
    [CLI, 'ingest-judgment', resultsFile, '--root', root, ...extraArgs],
    { encoding: 'utf8' },
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

// ── BUG 1 regression tests ────────────────────────────────────────────────────
// These tests drive the REAL ingest-judgment path and assert that severity is
// persisted in cache.json. They MUST fail before the BUG 1 fix.

test('ingest-judgment: filed critical finding persists severity in cache (BUG 1)', () => {
  const root = tmpRepo();
  const r = runIngest(root, [CRITICAL_FINDING]);
  assert.strictEqual(r.status, 0, `ingest-judgment failed: ${r.stderr}`);
  const cache = readCacheJson(root);
  const entries = Object.values(cache);
  assert.ok(entries.length >= 1, 'cache should have at least one entry');
  const filed = entries.filter((e) => e.status === 'open');
  assert.ok(filed.length >= 1, 'expected at least one open entry');
  // BUG 1: before fix, severity is undefined/missing in the cache entry.
  assert.strictEqual(filed[0].severity, 'critical', 'cache entry must carry severity');
});

test('ingest-judgment: --fail-on critical fires after real critical finding is filed (BUG 1)', () => {
  const root = tmpRepo();
  const r = runIngest(root, [CRITICAL_FINDING]);
  assert.strictEqual(r.status, 0, `ingest-judgment failed: ${r.stderr}`);
  // Now status --fail-on critical must exit 1 because the real cache has severity.
  const s = spawnSync('node', [CLI, 'status', '--fail-on', 'critical', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(s.status, 1, '--fail-on critical must exit 1 when a critical finding is in cache');
});

// ── BUG 2 regression tests ────────────────────────────────────────────────────
// These tests drive a reopen (regression) through the real ingest-judgment path
// and assert status:'regressed' is written. They MUST fail before the BUG 2 fix.

test('ingest-judgment: reopen writes status:regressed in cache (BUG 2)', () => {
  const root = tmpRepo();
  // First pass: file the finding (no issues file → goes through 'file' path).
  const r1 = runIngest(root, [HIGH_FINDING]);
  assert.strictEqual(r1.status, 0, `first ingest failed: ${r1.stderr}`);

  // Simulate: the issue was closed (non-wontfix) → next run should reopen.
  // Build an issues file with the fingerprint of the finding we just filed.
  const cache = readCacheJson(root);
  const fp = Object.keys(cache)[0];
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([
    { number: 99, state: 'closed', labels: ['recon'], fingerprint: fp },
  ]), 'utf8');

  // Clear cache so decision() sees no cached entry (only the issue index matters for reopen).
  writeCache(root, {});

  // Second pass: same finding, closed issue → should reopen → write status:'regressed'.
  const r2 = runIngest(root, [HIGH_FINDING], issuesFile);
  assert.strictEqual(r2.status, 0, `second ingest failed: ${r2.stderr}`);

  const cache2 = readCacheJson(root);
  const entries = Object.values(cache2);
  // BUG 2: before fix, status is 'open' instead of 'regressed'.
  const regressed = entries.filter((e) => e.status === 'regressed');
  assert.ok(regressed.length >= 1, 'cache entry must have status:regressed on reopen');
});

test('ingest-judgment: --fail-on regressed fires after real reopen (BUG 2)', () => {
  const root = tmpRepo();
  const r1 = runIngest(root, [HIGH_FINDING]);
  assert.strictEqual(r1.status, 0, `first ingest failed: ${r1.stderr}`);
  const cache = readCacheJson(root);
  const fp = Object.keys(cache)[0];
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([
    { number: 99, state: 'closed', labels: ['recon'], fingerprint: fp },
  ]), 'utf8');
  writeCache(root, {});
  const r2 = runIngest(root, [HIGH_FINDING], issuesFile);
  assert.strictEqual(r2.status, 0, `second ingest failed: ${r2.stderr}`);
  // --fail-on regressed must exit 1 now that status is properly written.
  const s = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(s.status, 1, '--fail-on regressed must exit 1 after a real reopen');
});
