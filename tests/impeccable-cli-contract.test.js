// tests/impeccable-cli-contract.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const PINNED = '3.6.0';
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

// Absent CLI skips; present-but-off-pin FAILS. A contract probe that silently
// declines to run reads exactly like one that passed — which is the defect this
// whole suite exists to catch, so it must not be this suite's own behaviour.
// Contributors without impeccable installed are unaffected.
const skip = version === null ? 'Impeccable CLI not installed' : false;

test('the installed CLI matches the pinned version', { skip }, () => {
  assert.strictEqual(
    version,
    PINNED,
    `Installed Impeccable CLI is ${version}, pinned is ${PINNED}. ` +
      'Every assertion below describes the pinned version\'s behaviour, so they prove ' +
      'nothing about this one. Run `npm install -g impeccable@' + PINNED + '`, or ' +
      're-pin deliberately by re-recording the fixtures against the new version.'
  );
});

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
  // advisory is optional — present only when true — so this must not assert
  // presence the way the required fields above do.
  assert.notStrictEqual(finding.advisory, true, 'the warning fixture must not carry advisory === true — this locks the classification axis');
});

test('an advisory-only finding exits 0 with advisory true on every finding', { skip }, () => {
  const r = detect('advisory.html');
  assert.strictEqual(r.code, 0, 'advisory findings must not fail the exit code');
  const findings = JSON.parse(r.stdout);
  assert.ok(Array.isArray(findings) && findings.length >= 1, 'stdout must carry a non-empty array');
  assert.ok(findings.every((f) => f.advisory === true), 'every finding in this fixture must carry advisory === true');
});
