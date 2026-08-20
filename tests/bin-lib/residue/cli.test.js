const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
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
