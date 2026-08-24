const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'residue.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// assert.throws(/Command failed/) would pass for ANY nonzero exit code — this
// captures the error so status and stderr can both be checked directly
// (tests/bin-lib/record-graph/cli-render.test.js's own pattern).
function runExpectingFailure(args) {
  let error;
  try {
    execFileSync('node', [CLI, ...args], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (e) {
    error = e;
  }
  assert.ok(error, `expected a nonzero exit for: ${args.join(' ')}`);
  return error;
}

test('omitting --base exits 2 with the usage message on stderr', () => {
  const error = runExpectingFailure([]);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /usage: residue\.js --base <commit-ish>/);
});

test('--base HEAD --no-suite runs and renders the Outstanding table', () => {
  const out = execFileSync('node', [CLI, '--base', 'HEAD', '--no-suite'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  assert.match(out, /^### Outstanding \(\d+\)/);
});

test('--base HEAD --no-suite --json prints a parseable {scope, results} shape', () => {
  const out = execFileSync('node', [CLI, '--base', 'HEAD', '--no-suite', '--json'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  const parsed = JSON.parse(out);
  assert.ok(parsed.scope && typeof parsed.scope === 'object', 'scope is an object');
  assert.ok(Array.isArray(parsed.results), 'results is an array');
  assert.ok(parsed.results.length > 0, 'at least one probe result present');
  for (const r of parsed.results) {
    assert.strictEqual(typeof r.ran, 'boolean', `result ${JSON.stringify(r).slice(0, 80)} carries a boolean ran field`);
  }
});

// End-to-end through the CLI's own env-var wiring (bin/residue.js's
// PIPELINE_RUN_DIR -> runId basename), not just the probe function directly
// (tests/bin-lib/residue/probes-pipeline-runs.test.js already covers that) —
// #1118.
test('PIPELINE_RUN_DIR env attributes only that run dir under --scope blast-radius (#1118)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-cli-pipeline-runs-'));
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', root, 'commit', '--allow-empty', '-q', '-m', 'init']);

  const pipelinesDir = path.join(root, '.claude-tweaks', 'pipelines');
  const ownRunDir = path.join(pipelinesDir, '2026-01-01T000000-record-1118');
  const siblingRunDir = path.join(pipelinesDir, '2026-01-01T000000-record-999');
  fs.mkdirSync(ownRunDir, { recursive: true });
  fs.mkdirSync(siblingRunDir, { recursive: true });
  fs.writeFileSync(path.join(ownRunDir, 'run-state.json'), JSON.stringify({ status: 'clean' }));
  fs.writeFileSync(path.join(siblingRunDir, 'run-state.json'), JSON.stringify({ status: 'clean' }));

  const out = execFileSync('node', [CLI, '--base', 'HEAD', '--scope', 'blast-radius', '--json', '--no-suite'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_RUN_DIR: ownRunDir },
  });
  const parsed = JSON.parse(out);
  const pipelineRunFindings = parsed.results.flatMap((r) => r.findings).filter((f) => f.kind === 'pipeline-run');
  assert.strictEqual(pipelineRunFindings.length, 1, `expected exactly one attributable pipeline-run finding, got ${JSON.stringify(pipelineRunFindings)}`);
  assert.match(pipelineRunFindings[0].subject, /record-1118/);
  assert.ok(!pipelineRunFindings.some((f) => /record-999/.test(f.subject)), 'the sibling run dir must not be attributed to this run');
});
