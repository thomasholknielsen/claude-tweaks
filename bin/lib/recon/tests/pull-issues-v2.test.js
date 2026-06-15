'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { pullReconIssues } = require('../pull-issues');

// A v2-shaped issue: body has three sections; labels include recon:<criterion>
function v2Issue({ number = 1, severity = 'high', criterion = 'security-logic', fingerprint = 'recon-abcd1234' } = {}) {
  return {
    number,
    title: `[recon] ${criterion} finding`,
    state: 'open',
    labels: [
      { name: 'recon' },
      { name: `recon:${severity}` },
      { name: `recon:${criterion}` },
    ],
    body: [
      `## Current State`,
      `Evidence of the finding. Anchor: src/api/auth.js#validateToken`,
      ``,
      `## Deliverables`,
      `Suggested approach in prose — no code.`,
      ``,
      `## Acceptance Criteria`,
      `The validateToken function validates all inputs at the boundary.`,
      ``,
      `<!-- recon-fingerprint: ${fingerprint} -->`,
    ].join('\n'),
  };
}

test('pullReconIssues extracts fingerprint from v2 body', () => {
  const briefs = pullReconIssues({ issuesJson: [v2Issue()] });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].fingerprint, 'recon-abcd1234');
});

test('pullReconIssues extracts severity from recon:<severity> label (not recon:<criterion>)', () => {
  const briefs = pullReconIssues({ issuesJson: [v2Issue({ severity: 'critical', criterion: 'a11y' })] });
  assert.strictEqual(briefs[0].severity, 'critical');
});

test('pullReconIssues minSeverity filters below-floor issues', () => {
  const issues = [
    v2Issue({ number: 1, severity: 'high', criterion: 'security-logic', fingerprint: 'recon-high0001' }),
    v2Issue({ number: 2, severity: 'medium', criterion: 'simplification', fingerprint: 'recon-med00002' }),
    v2Issue({ number: 3, severity: 'low', criterion: 'naming-clarity', fingerprint: 'recon-low00003' }),
  ];
  const briefs = pullReconIssues({ minSeverity: 'high', issuesJson: issues });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].fingerprint, 'recon-high0001');
});

test('pullReconIssues sets fingerprint null when marker is absent', () => {
  const noMarker = { ...v2Issue(), body: '## Current State\nNo marker here.' };
  const briefs = pullReconIssues({ issuesJson: [noMarker] });
  assert.strictEqual(briefs[0].fingerprint, null);
});

test('pullReconIssues handles object labels with name property (gh CLI output shape)', () => {
  const issue = v2Issue();
  // gh CLI returns labels as [{ id, name, color, ... }]; pull-issues.js uses labelNames() which already handles this
  const briefs = pullReconIssues({ issuesJson: [issue] });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].severity, 'high');
});

test('pullReconIssues body is passed through unchanged for /specify consumption', () => {
  const issue = v2Issue();
  const briefs = pullReconIssues({ issuesJson: [issue] });
  assert.ok(briefs[0].body.includes('## Current State'));
  assert.ok(briefs[0].body.includes('## Deliverables'));
  assert.ok(briefs[0].body.includes('## Acceptance Criteria'));
});
