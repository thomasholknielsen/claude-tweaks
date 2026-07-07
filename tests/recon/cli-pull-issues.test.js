'use strict';
// FIX 3 tests: pull-issues CLI subcommand
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', '..', 'bin', 'code-health.js');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-pull-issues-cli-'));
}

// Fake gh issue list JSON payload with code-health label + fingerprint marker
const fakeIssues = [
  {
    number: 42,
    title: 'Dead export: src/lib/unused.ts',
    labels: [{ name: 'code-health' }, { name: 'code-health:high' }],
    body: [
      '<!-- code-health-fingerprint: recon-deadbeef -->',
      '## Current State',
      'src/lib/unused.ts exports `unusedHelper` which has zero import sites.',
      '## Deliverables',
      'Remove the dead export.',
      '## Acceptance Criteria',
      'No dead exports in src/lib.',
    ].join('\n'),
  },
  {
    number: 43,
    title: 'TODO debt: src/util/parse.ts',
    labels: [{ name: 'code-health' }, { name: 'code-health:low' }],
    body: '<!-- code-health-fingerprint: recon-abc12345 -->\n## Current State\n5 TODO comments.',
  },
];

test('pull-issues CLI subcommand emits briefs as JSON to stdout', () => {
  const root = tmpRoot();
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify(fakeIssues), 'utf8');

  const r = spawnSync('node', [CLI, 'pull-issues', '--label', 'code-health', '--issues', issuesFile], {
    encoding: 'utf8',
  });

  assert.strictEqual(r.status, 0, `exit code should be 0, got ${r.status}. stderr: ${r.stderr}`);

  let briefs;
  assert.doesNotThrow(() => { briefs = JSON.parse(r.stdout); }, 'stdout should be valid JSON');
  assert.ok(Array.isArray(briefs), 'output should be an array');
  assert.strictEqual(briefs.length, 2, 'should emit 2 briefs');

  const b42 = briefs.find((b) => b.number === 42);
  assert.ok(b42, 'brief for issue 42 should be present');
  assert.strictEqual(b42.fingerprint, 'recon-deadbeef');
  assert.strictEqual(b42.severity, 'high');
  assert.strictEqual(b42.title, 'Dead export: src/lib/unused.ts');
  assert.match(b42.body, /## Deliverables/);
});

test('pull-issues CLI --min-severity high filters low-severity issues', () => {
  const root = tmpRoot();
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify(fakeIssues), 'utf8');

  const r = spawnSync(
    'node',
    [CLI, 'pull-issues', '--label', 'code-health', '--min-severity', 'high', '--issues', issuesFile],
    { encoding: 'utf8' },
  );

  assert.strictEqual(r.status, 0);
  const briefs = JSON.parse(r.stdout);
  assert.strictEqual(briefs.length, 1, 'only high-severity issue should survive');
  assert.strictEqual(briefs[0].number, 42);
});

test('pull-issues exits 2 when --issues flag is missing', () => {
  const r = spawnSync('node', [CLI, 'pull-issues', '--label', 'code-health'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2, 'should exit 2 when --issues is missing');
});
