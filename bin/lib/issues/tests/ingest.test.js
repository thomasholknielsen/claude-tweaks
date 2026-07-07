'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { issuesToBriefs, isFormShaped, SEVERITY_RANK } = require('../ingest');

function issue({ number = 1, title = 'A task', labels = [], body = '' } = {}) {
  return { number, title, state: 'open', labels: labels.map((n) => ({ name: n })), body };
}

const FORM_BODY_H2 = '## Current State\nX is broken.\n\n## Deliverables\nFix X.\n\n## Acceptance Criteria\nX works.';
const FORM_BODY_H3 = '### Current State\nX is broken.\n\n### Deliverables\nFix X.\n\n### Acceptance Criteria\nX works.';

test('isFormShaped accepts both heading levels and rejects partial bodies', () => {
  assert.strictEqual(isFormShaped(FORM_BODY_H2), true);
  assert.strictEqual(isFormShaped(FORM_BODY_H3), true);
  assert.strictEqual(isFormShaped('## Current State\nonly one section'), false);
  assert.strictEqual(isFormShaped('please fix the login button'), false);
  assert.strictEqual(isFormShaped(''), false);
});

test('issuesToBriefs classifies shape per brief', () => {
  const briefs = issuesToBriefs({ issuesJson: [
    issue({ number: 1, body: FORM_BODY_H2 }),
    issue({ number: 2, body: 'freeform prose request' }),
  ] });
  assert.strictEqual(briefs.length, 2);
  assert.strictEqual(briefs[0].shape, 'form');
  assert.strictEqual(briefs[1].shape, 'freeform');
});

test('numbers filter selects exactly the requested issues', () => {
  const briefs = issuesToBriefs({ numbers: [3, 5], issuesJson: [
    issue({ number: 3 }), issue({ number: 4 }), issue({ number: 5 }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [3, 5]);
});

test('label filter includes only issues carrying the label', () => {
  const briefs = issuesToBriefs({ label: 'bug', issuesJson: [
    issue({ number: 1, labels: ['bug'] }), issue({ number: 2, labels: ['recon'] }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('no label and no numbers → all issues pass the filter stage', () => {
  const briefs = issuesToBriefs({ issuesJson: [issue({ number: 1 }), issue({ number: 2 })] });
  assert.strictEqual(briefs.length, 2);
});

test('minSeverity floors on code-health:<sev> labels; unlabeled defaults to info', () => {
  const briefs = issuesToBriefs({ minSeverity: 'high', issuesJson: [
    issue({ number: 1, labels: ['code-health:critical'] }),
    issue({ number: 2, labels: ['code-health:low'] }),
    issue({ number: 3 }), // unlabeled → info → excluded by high floor
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('fingerprint extracted when the code-health marker is present, else null', () => {
  const withFp = issue({ number: 1, body: FORM_BODY_H2 + '\n<!-- code-health-fingerprint: recon-abcd1234 -->' });
  const briefs = issuesToBriefs({ issuesJson: [withFp, issue({ number: 2 })] });
  assert.strictEqual(briefs[0].fingerprint, 'recon-abcd1234');
  assert.strictEqual(briefs[1].fingerprint, null);
});

test('SEVERITY_RANK is exported and code-health pull-issues re-exports it', () => {
  assert.strictEqual(SEVERITY_RANK.critical, 0);
  const recon = require('../../code-health/pull-issues');
  assert.strictEqual(recon.SEVERITY_RANK, SEVERITY_RANK);
});

test('pullReconIssues still defaults to the code-health label (wrapper behavior)', () => {
  const { pullReconIssues } = require('../../code-health/pull-issues');
  const briefs = pullReconIssues({ issuesJson: [
    issue({ number: 1, labels: ['code-health', 'code-health:high'], body: FORM_BODY_H2 }),
    issue({ number: 2, labels: ['bug'], body: FORM_BODY_H2 }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
  assert.strictEqual(briefs[0].severity, 'high');
  assert.strictEqual(briefs[0].shape, 'form');
});

test('requireLabels demands every listed label (AND semantics)', () => {
  const briefs = issuesToBriefs({ requireLabels: ['agent:eligible'], issuesJson: [
    issue({ number: 1, labels: ['agent:go', 'agent:eligible'] }),
    issue({ number: 2, labels: ['agent:go'] }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('requireLabels combines with the label filter', () => {
  const briefs = issuesToBriefs({ label: 'agent:go', requireLabels: ['agent:eligible'], issuesJson: [
    issue({ number: 1, labels: ['agent:go', 'agent:eligible'] }),
    issue({ number: 2, labels: ['agent:eligible'] }), // lacks agent:go
    issue({ number: 3, labels: ['agent:go'] }),       // lacks agent:eligible
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('requireLabels absent or empty has no effect', () => {
  const all = issuesToBriefs({ issuesJson: [issue({ number: 1 })] });
  const empty = issuesToBriefs({ requireLabels: [], issuesJson: [issue({ number: 1 })] });
  assert.strictEqual(all.length, 1);
  assert.strictEqual(empty.length, 1);
});
