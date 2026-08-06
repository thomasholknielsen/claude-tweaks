// tests/impeccable-cli-contract.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const PINNED = '3.5.0';
const FIXTURES = path.join(__dirname, 'fixtures', 'impeccable-cli');

function cliVersion() {
  const r = spawnSync('npx', ['--no-install', 'impeccable', '--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').trim();
}

function detect(fixture) {
  const r = spawnSync(
    'npx',
    ['--no-install', 'impeccable', 'detect', '--json', '--no-config', '--no-design-system',
     path.join(FIXTURES, fixture)],
    { encoding: 'utf8' }
  );
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const version = cliVersion();
const skip = version === null
  ? 'Impeccable CLI not installed'
  : version !== PINNED
    ? `Impeccable CLI ${version} does not match pinned ${PINNED}`
    : false;

test('a warning finding exits 2 with JSON on stdout and nothing on stderr', { skip }, () => {
  const r = detect('warning.html');
  assert.strictEqual(r.code, 2, 'non-advisory findings must exit 2');
  assert.strictEqual(r.stderr, '', 'findings must not go to stderr (the 2.1.8 bug)');
  const findings = JSON.parse(r.stdout);
  assert.ok(Array.isArray(findings) && findings.length >= 1, 'stdout must carry a non-empty array');
  for (const f of findings) {
    assert.ok(typeof f.severity === 'string', `every finding needs a severity: ${f.antipattern}`);
  }
  assert.ok(findings.some((f) => f.severity === 'warning'), 'fixture must provoke a warning');
});

test('a clean file exits 0 with an empty array on stdout', { skip }, () => {
  const r = detect('clean.html');
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.stderr, '');
  assert.deepStrictEqual(JSON.parse(r.stdout), []);
});

test('every documented field is present on a finding', { skip }, () => {
  const [finding] = JSON.parse(detect('warning.html').stdout);
  for (const key of ['antipattern', 'name', 'description', 'severity', 'category', 'file', 'line', 'snippet']) {
    assert.ok(key in finding, `field '${key}' missing — impeccable-cli.md's schema table is stale`);
  }
});
