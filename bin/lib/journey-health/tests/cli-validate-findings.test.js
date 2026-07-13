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

// recordRun/readRuns (local-disk run-log persistence) were removed by the
// health-state migration — run history now lives on the durable
// health-state branch (bin/lib/health-core/durable-state.js), not local
// disk. Its write path (gh api blob/tree/commit/ref calls) requires live
// GitHub credentials; the read path is pure git plumbing (fetch + show), so
// it's exercised for real below via a local bare git remote seeded directly
// with runs.json (no gh/network needed) — the same technique
// bin/lib/harness-health/tests/cli-validate-findings.test.js's
// seedDurableRuns uses.
function seedDurableRuns(root, runs) {
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-vf-bare-'));
  execFileSync('git', ['init', '--bare', '-q', bareDir]);
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-vf-seed-'));
  execFileSync('git', ['init', '-q', seedDir]);
  execFileSync('git', ['-C', seedDir, 'checkout', '-q', '-b', 'health-state']);
  fs.mkdirSync(path.join(seedDir, 'journey-health'), { recursive: true });
  fs.writeFileSync(path.join(seedDir, 'journey-health', 'runs.json'), JSON.stringify(runs));
  execFileSync('git', ['-C', seedDir, 'add', '-A']);
  execFileSync(
    'git',
    ['-C', seedDir, '-c', 'user.email=test@example.com', '-c', 'user.name=test', 'commit', '-q', '-m', 'seed'],
  );
  execFileSync('git', ['-C', seedDir, 'push', '-q', bareDir, 'health-state']);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', bareDir], { cwd: root });
}

test('validate-findings files a brand-new valid finding and succeeds when durable persistence cannot complete', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));
  const result = spawnSync('node', [CLI, 'validate-findings', findingsFile, '--target', 'checkout-flow', '--tier', 'light', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.strictEqual(payloads[0].journey, 'checkout-flow');
  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json')),
    false,
    'cursors are durable now — no local cursors.json is ever written',
  );
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
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'journey-health', 'cache.json')), false);
});

// Cursors are now durable (health-state branch), not local disk — a bare
// tmp() root (no git remote at all) means the CLI's writeDurableState call
// necessarily fails its `git fetch origin health-state` first. That failure
// is non-fatal (see bin/journey-health.js's cmdValidateFindings persistence
// block), so what's provable at the CLI level here is that the run still
// succeeds and never writes a local cursors.json, regardless of
// --coverage-scan. The actual cursor-set semantics (per-journey light/deep
// merge, coverage-scan cursor set, unrelated cursor keys preserved) are unit
// tested directly against the pure mutator in
// bin/lib/journey-health/tests/build-validate-findings-update.test.js.
test('validate-findings --coverage-scan still succeeds when durable persistence cannot complete, no local cursors.json is ever written', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding({ category: 'coverage', section: 'coverage' })]));
  const result = spawnSync('node', [CLI, 'validate-findings', findingsFile, '--coverage-scan', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json')),
    false,
    'cursors are durable now — no local cursors.json is ever written',
  );
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

// A real validate-findings run's own attempt to persist its run record can no
// longer be observed by re-reading local disk (run history is durable now —
// see seedDurableRuns's comment above) — a bare tmp() root has no git remote
// at all, so that write necessarily fails its `git fetch origin
// health-state` first, non-fatally, with a clear stderr message.
test('validate-findings: a real run still succeeds and emits its payload when durable persistence cannot complete', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([finding()]));

  const result = spawnSync('node', [CLI, 'validate-findings', findingsFile, '--root', root, '--run-id', 'test-run-1'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `expected non-fatal exit, got stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'payload must still emit despite the persistence failure');
  assert.ok(
    result.stderr.includes('health-state persistence failed after retries'),
    `expected a health-state persistence warning in stderr, got: ${result.stderr}`,
  );
  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'journey-health', 'cursors.json')),
    false,
    'cursors are durable now — no local cursors.json is ever written',
  );
});

test('churn-report: prints "no run logs found" when no runs exist', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('no run logs found'));
});

// churn-report's own read side (readDurableState(root).runs, no longer
// readRuns(root)) against a directly-seeded health-state branch, mirroring
// bin/lib/harness-health/tests/cli-validate-findings.test.js's equivalent
// test.
test('churn-report: a seeded durable run history prints a table row', () => {
  const root = tmp();
  seedDurableRuns(root, [
    { runId: 'run-1', runAt: '2026-01-01T00:00:00.000Z', fingerprints: ['journeyhealth-aaaa0001'] },
  ]);

  const result = spawnSync('node', [CLI, 'churn-report', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('run-1'));
});
