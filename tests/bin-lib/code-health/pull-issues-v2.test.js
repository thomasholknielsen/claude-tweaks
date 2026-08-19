'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { pullReconIssues } = require('../../../plugin/bin/lib/code-health/pull-issues');

// A current-format issue: by:code-health + risk:<tier> + work-fingerprint marker —
// the real shape toIssuePayloadV2 emits (bin/lib/code-health/issue-payload.js, via
// bin/lib/issues/record.js's recordPayload/specShapedBody). NOT the legacy
// code-health:<severity> label / code-health-fingerprint marker shape the old
// bin/lib/issues/ingest.js path expected.
function v2Issue({ number = 1, risk = 'high', criterion = 'security-logic', fingerprint = 'codehealth-abcd1234' } = {}) {
  return {
    number,
    title: `[code-health] ${criterion} finding`,
    state: 'open',
    labels: [
      { name: 'by:code-health' },
      { name: `risk:${risk}` },
      { name: 'effort:medium' },
      { name: 'ready' },
    ],
    body: [
      `**Criterion:** ${criterion} | **Risk:** ${risk} | **Severity:** ${risk} | **Likelihood:** medium | **Effort:** medium | **Confidence:** high | **Area:** src/api`,
      ``,
      `## Current State`,
      ``,
      `Anchor: \`src/api/auth.js#validateToken\``,
      ``,
      `Evidence of the finding.`,
      ``,
      `## Deliverables`,
      ``,
      `Suggested approach in prose — no code.`,
      ``,
      `## Acceptance Criteria`,
      ``,
      `The validateToken function validates all inputs at the boundary.`,
      ``,
      '_Filed by `/claude-tweaks:code-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
      ``,
      `<!-- work-fingerprint: ${fingerprint} -->`,
    ].join('\n'),
  };
}

test('pullReconIssues extracts fingerprint from the current work-fingerprint marker', () => {
  const briefs = pullReconIssues({ issuesJson: [v2Issue()] });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].fingerprint, 'codehealth-abcd1234');
});

test('pullReconIssues still reads the legacy fingerprint marker (dual-write/migration period)', () => {
  const legacy = { ...v2Issue(), body: '## Current State\nOld-format body.\n\n<!-- code-health-fingerprint: codehealth-legacy01 -->' };
  const briefs = pullReconIssues({ issuesJson: [legacy] });
  assert.strictEqual(briefs[0].fingerprint, 'codehealth-legacy01');
});

test('pullReconIssues extracts severity from the risk:<tier> label (3-tier, matches --min-risk)', () => {
  const briefs = pullReconIssues({ issuesJson: [v2Issue({ risk: 'high', criterion: 'a11y' })] });
  assert.strictEqual(briefs[0].severity, 'high');
});

test('pullReconIssues selects only issues carrying the matching by:<origin> label, not a bare "code-health" one', () => {
  const briefs = pullReconIssues({ issuesJson: [
    v2Issue({ number: 1 }),
    { number: 2, title: 'unrelated bug', labels: [{ name: 'bug' }], body: '' },
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('pullReconIssues label option selects a different origin (e.g. harness-health)', () => {
  const hhIssue = {
    number: 5,
    title: '[harness-health] drift finding',
    labels: [{ name: 'by:harness-health' }, { name: 'risk:medium' }, { name: 'ready' }],
    body: '## Current State\n...\n\n## Deliverables\n...\n\n## Acceptance Criteria\n...',
  };
  const briefs = pullReconIssues({ label: 'harness-health', issuesJson: [hhIssue, v2Issue({ number: 6 })] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [5]);
});

test('pullReconIssues minSeverity filters below-floor issues on the risk:<tier> scale', () => {
  const issues = [
    v2Issue({ number: 1, risk: 'high', fingerprint: 'codehealth-high0001' }),
    v2Issue({ number: 2, risk: 'medium', fingerprint: 'codehealth-med00002' }),
    v2Issue({ number: 3, risk: 'low', fingerprint: 'codehealth-low00003' }),
  ];
  const briefs = pullReconIssues({ minSeverity: 'high', issuesJson: issues });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].fingerprint, 'codehealth-high0001');
});

test('pullReconIssues treats an unscored issue (no risk:<tier> label) as the least-urgent tier', () => {
  const unscored = {
    number: 9,
    title: '[code-health] unscored finding',
    labels: [{ name: 'by:code-health' }, { name: 'ready' }],
    body: '## Current State\n...\n\n## Deliverables\n...\n\n## Acceptance Criteria\n...',
  };
  assert.strictEqual(pullReconIssues({ minSeverity: 'medium', issuesJson: [unscored] }).length, 0);
  assert.strictEqual(pullReconIssues({ minSeverity: 'low', issuesJson: [unscored] }).length, 1);
});

test('pullReconIssues sets fingerprint null when neither marker is present', () => {
  const noMarker = { ...v2Issue(), body: '## Current State\nNo marker here.' };
  const briefs = pullReconIssues({ issuesJson: [noMarker] });
  assert.strictEqual(briefs[0].fingerprint, null);
});

test('pullReconIssues handles object labels with name property (gh CLI output shape)', () => {
  const issue = v2Issue();
  // gh CLI returns labels as [{ id, name, color, ... }]; parseRecordFacets normalizes this.
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
