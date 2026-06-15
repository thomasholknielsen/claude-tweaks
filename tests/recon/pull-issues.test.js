'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { pullReconIssues } = require('../../bin/lib/recon/pull-issues');

// Issue bodies are /specify-shaped (issue-payload.js, Phase 1) with a hidden
// fingerprint marker line. gh issue list --json returns this array shape.
const issuesJson = [
  {
    number: 12,
    title: 'Oversized module: src/api/handlers.ts',
    labels: [{ name: 'recon' }, { name: 'recon:high' }],
    body: [
      '<!-- recon-fingerprint: fp-12abc -->',
      '## Current State',
      'src/api/handlers.ts is 820 lines.',
      '## Deliverables',
      'Split into cohesive modules.',
      '## Acceptance Criteria',
      'No file over 400 lines.',
    ].join('\n'),
  },
  {
    number: 13,
    title: 'TODO debt in src/util',
    labels: [{ name: 'recon' }, { name: 'recon:low' }],
    body: '<!-- recon-fingerprint: fp-13def -->\n## Current State\n12 TODOs.',
  },
];

test('pullReconIssues maps issues to briefs with fingerprint + severity', () => {
  const briefs = pullReconIssues({ label: 'recon', issuesJson });
  assert.strictEqual(briefs.length, 2);
  assert.strictEqual(briefs[0].number, 12);
  assert.strictEqual(briefs[0].fingerprint, 'fp-12abc');
  assert.strictEqual(briefs[0].severity, 'high');
  assert.strictEqual(briefs[0].title, 'Oversized module: src/api/handlers.ts');
  assert.match(briefs[0].body, /## Deliverables/);
});

test('minSeverity filters out below-threshold issues', () => {
  const briefs = pullReconIssues({ label: 'recon', minSeverity: 'high', issuesJson });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].number, 12);
});

test('issues without the recon label are ignored', () => {
  const briefs = pullReconIssues({
    label: 'recon',
    issuesJson: [{ number: 1, title: 'x', labels: [{ name: 'bug' }], body: 'y' }],
  });
  assert.strictEqual(briefs.length, 0);
});
