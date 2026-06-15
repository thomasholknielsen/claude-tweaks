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

// P2 additions: confidence-floor gate
const { applyConfidenceFloor } = require('../../../recon');

test('applyConfidenceFloor passes a high-confidence finding for a high-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'high' }, 'high');
  assert.strictEqual(result.pass, true);
});

test('applyConfidenceFloor drops a med-confidence finding for a high-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'med' }, 'high');
  assert.strictEqual(result.pass, false);
  assert.ok(result.reason.includes('below floor'));
});

test('applyConfidenceFloor drops a low-confidence finding for a med-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, 'med');
  assert.strictEqual(result.pass, false);
});

test('applyConfidenceFloor passes a low-confidence finding for a low-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, 'low');
  assert.strictEqual(result.pass, true);
});

test('applyConfidenceFloor passes when criterionFloor is undefined (no floor set)', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, undefined);
  assert.strictEqual(result.pass, true);
});

// ── Cursor + run-log persistence (Commit 1) ──────────────────────────────────

const { readRuns } = require('../cache');

test('validate-findings: persists cursor + run-log on a real run with --slice', () => {
  const root = tmp();
  // Use areaId '.' so the slice path is root itself (which exists).
  const f = validFinding({ areaId: '.', anchor: 'index.js#module' });
  const findingsFile = path.join(root, 'findings.json');
  // Write a source file so contentHash has something to hash.
  fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', '.', '--run-id', 'test-run-1']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  // cursors.json must be written
  const cursorsFile = path.join(root, '.claude-tweaks', 'recon', 'cursors.json');
  assert.ok(fs.existsSync(cursorsFile), 'cursors.json must exist after a real run with --slice');
  const cursors = JSON.parse(fs.readFileSync(cursorsFile, 'utf8'));
  assert.ok(typeof cursors['.'].lastHash === 'string' && cursors['.'].lastHash.length > 0,
    'cursors["."].lastHash must be a non-empty string');
  assert.ok(typeof cursors['.'].lastSweptMs === 'number',
    'cursors["."].lastSweptMs must be a number');

  // run-log must be written under runs/
  const runs = readRuns(root);
  assert.ok(runs.length > 0, 'a run-log must be written to runs/');
  assert.strictEqual(runs[0].runId, 'test-run-1');
});

test('validate-findings: --dry-run with --slice writes neither cursors nor cache', () => {
  const root = tmp();
  const f = validFinding({ areaId: '.', anchor: 'index.js#module' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', '.', '--run-id', 'test-run-2', '--dry-run']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cursors.json')),
    false,
    'cursors.json must NOT be written in dry-run',
  );
  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')),
    false,
    'cache.json must NOT be written in dry-run',
  );
});

test('validate-findings: next-slice skips the just-recorded unchanged slice', () => {
  const root = tmp();
  // Create a single source file so the root slice (.) has content to hash.
  fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n');
  // We also need a git repo so next-slice doesn't churn-fail silently.
  const { execFileSync: exec } = require('child_process');
  try {
    exec('git', ['-C', root, 'init'], { stdio: 'ignore' });
    exec('git', ['-C', root, 'add', '.'], { stdio: 'ignore' });
    exec('git', ['-C', root, 'commit', '-m', 'init', '--allow-empty-message', '--no-verify'], { stdio: 'ignore' });
  } catch { /* ignore git failures in CI */ }

  const f = validFinding({ areaId: '.', anchor: 'index.js#module' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  // Record the slice via validate-findings.
  const vfResult = runValidateFindings(root, findingsFile, ['--slice', '.', '--run-id', 'r1']);
  assert.strictEqual(vfResult.status, 0, `validate-findings stderr: ${vfResult.stderr}`);

  // next-slice should now return null (slice recorded, hash unchanged).
  const nsResult = spawnSync('node', [CLI, 'next-slice', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(nsResult.status, 0, `next-slice stderr: ${nsResult.stderr}`);
  const sliceOut = JSON.parse(nsResult.stdout);
  assert.strictEqual(sliceOut, null,
    `next-slice must return null after recording the only slice — got: ${JSON.stringify(sliceOut)}`);
});
