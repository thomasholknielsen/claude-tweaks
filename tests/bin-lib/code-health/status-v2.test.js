'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { seedDurableState } = require('./seed-durable-state');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'code-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codehealth-status-v2-')); }

function writeV2Cache(root, entries) {
  // entries: [{ fp, status, severity, risk }]
  const cache = {};
  for (const e of entries) cache[e.fp] = { status: e.status, severity: e.severity, risk: e.risk, issue: null };
  const p = path.join(root, '.claude-tweaks', 'code-health', 'cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

// 'remembered' entries no longer live in local cache.json (see
// bin/lib/code-health/cache.js / bin/code-health.js's cmdValidateFindings) —
// they live in the durable remembered.json on the health-state branch instead
// (cmdStatus derives its remembered count from readDurableState(root).remembered).
// readDurableState's read path is pure git plumbing (fetch + show), so it can
// be exercised for real without gh/network via the shared seedDurableState
// helper (bin/lib/code-health/tests/seed-durable-state.js) — the same
// technique bin/lib/code-health/tests/cli-nextslice.test.js uses for cursors
// and bin/lib/code-health/tests/churn-v2.test.js uses for runs.
function seedDurableRemembered(root, remembered) {
  seedDurableState(root, 'remembered.json', remembered);
}

test('status prints open and regressed counts from v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'codehealth-ccccdddd', status: 'regressed', severity: 'high' },
    { fp: 'codehealth-eeeeffff', status: 'closed', severity: 'low' },
  ]);
  const out = execFileSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.ok(out.includes('open:1'), `expected open:1 in: ${out}`);
  assert.ok(out.includes('regressed:1'), `expected regressed:1 in: ${out}`);
  assert.ok(out.includes('closed:1'), `expected closed:1 in: ${out}`);
});

test('status prints the remembered count from the durable remembered store', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'open', severity: 'medium' },
  ]);
  seedDurableRemembered(root, {
    'codehealth-ccccdddd': { status: 'remembered', issue: null, severity: 'medium', risk: null },
    'codehealth-eeeeffff': { status: 'remembered', issue: null, severity: 'low', risk: null },
  });
  const out = execFileSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.ok(out.includes('open:1'), `expected open:1 in: ${out}`);
  assert.ok(out.includes('remembered:2'), `expected remembered:2 in: ${out}`);
});

test('status --fail-on regressed exits 1 when regressed entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'codehealth-ccccdddd', status: 'regressed', severity: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});

test('status --fail-on risk-high exits 1 when open risk-high entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'open', severity: 'high', risk: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'risk-high', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});

// REGRESSION: a risk-high finding that got reopened (status: 'regressed',
// e.g. it was fixed, closed, then reappeared) is just as live/unresolved as
// an 'open' one — --fail-on risk-high must not silently pass while it sits
// open in the tracker.
test('status --fail-on risk-high exits 1 when a REGRESSED (not just open) risk-high entry exists', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'regressed', severity: 'high', risk: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'risk-high', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1, `expected FAIL for a regressed risk-high finding: ${result.stdout}`);
  assert.ok(result.stdout.includes('FAIL'));
});

test('status --fail-on with an unrecognized value exits 2 (does not silently disable the gate)', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'regressed', severity: 'high', risk: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'Regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 2, `expected exit 2 for a typo'd --fail-on value, got ${result.status}: ${result.stdout}${result.stderr}`);
  assert.ok(result.stderr.includes('--fail-on'), `expected --fail-on mentioned in stderr: ${result.stderr}`);
});

// REGRESSION: --fail-on used to unconditionally fetch the durable
// remembered store (a `git fetch origin health-state`, up to a 30s timeout
// when offline) purely to print an informational count neither gate branch
// reads. --fail-on mode must not surface a remembered count at all — a
// plain `status` invocation still does.
test('status --fail-on output omits the remembered count (the durable-state fetch is skipped in this mode)', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'open', severity: 'medium' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.ok(!result.stdout.includes('remembered:'), `--fail-on output must not include remembered: ${result.stdout}`);
});

test('status --fail-on regressed exits 0 when no regressed entries', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'open', severity: 'medium' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
});

// Regression: cmdStatus used to read args.root bare, without the
// `args.root || process.cwd()` fallback every other command here (and every
// sibling health CLI) uses. A malformed --root (e.g. a trailing flag with no
// value, which parseArgs turns into `undefined`) silently made status
// report empty state instead of falling back to cwd — defeating a
// --fail-on regressed CI/Routine gate even with a regressed finding sitting
// right in the invoking directory.
test('status falls back to process.cwd() when --root is a trailing flag with no value', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'codehealth-aaaabbbb', status: 'regressed', severity: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 1, `expected the regressed finding at cwd to be found: ${result.stdout}`);
  assert.ok(result.stdout.includes('FAIL: 1 regressed'), `expected FAIL in: ${result.stdout}`);
});
