const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');
const { extractFingerprint } = require('../../issues/record');

function finding(overrides = {}) {
  return {
    id: 'docshealth-abc12345',
    target: 'decisions/0007-foo',
    assetType: 'doc',
    section: 'Freshness',
    category: 'staleness',
    misleads: 'agent',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stated skill count is stale',
    oldString: 'This project ships 12 skills.',
    newString: 'This project ships 14 skills.',
    reason: 'A live count of skills/*/SKILL.md returns 14, not 12.',
    ...overrides,
  };
}

test('toIssuePayload for a restructural finding maps classification to risk:medium/effort:high, ready, and appends the diagnostic label last', () => {
  const payload = toIssuePayload(finding());
  assert.deepStrictEqual(payload.labels, ['by:docs-health', 'risk:medium', 'effort:high', 'ready', 'docs-health:restructural']);
  assert.ok(payload.title.includes('decisions/0007-foo'));
  assert.ok(payload.body.includes('12 skills'));
  assert.ok(payload.body.includes('14 skills'));
});

test('toIssuePayload for an additive finding maps classification to risk:low/effort:low', () => {
  const payload = toIssuePayload(finding({ classification: 'additive' }));
  assert.deepStrictEqual(payload.labels, ['by:docs-health', 'risk:low', 'effort:low', 'ready', 'docs-health:additive']);
});

test('toIssuePayload carries type: task', () => {
  assert.strictEqual(toIssuePayload(finding()).type, 'task');
});

test('toIssuePayload body embeds the work-fingerprint marker, re-extractable with extractFingerprint', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('<!-- work-fingerprint: docshealth-abc12345 -->'));
  assert.strictEqual(extractFingerprint(payload.body), 'docshealth-abc12345');
});

test('toIssuePayload body starts directly with the header line', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.startsWith('**Doc:**'), `expected body to start with the header line, got: ${payload.body.slice(0, 40)}`);
});

test('toIssuePayload body always includes Current State, Deliverables, and Acceptance Criteria sections', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('## Current State'));
  assert.ok(payload.body.includes('## Deliverables'));
  assert.ok(payload.body.includes('## Acceptance Criteria'));
});

test('toIssuePayload carries structured decision fields matching the input finding', () => {
  const f = finding();
  const payload = toIssuePayload(f);
  assert.strictEqual(payload.id, f.id);
  assert.strictEqual(payload.target, f.target);
  assert.strictEqual(payload.assetType, f.assetType);
  assert.strictEqual(payload.category, f.category);
  assert.strictEqual(payload.misleads, f.misleads);
  assert.strictEqual(payload.section, f.section);
  assert.strictEqual(payload.classification, f.classification);
  assert.strictEqual(payload.confidence, f.confidence);
  assert.strictEqual(payload.reversibility, f.reversibility);
  assert.strictEqual(payload.oldString, f.oldString);
  assert.strictEqual(payload.newString, f.newString);
});

test('toIssuePayload title reflects category and misleads', () => {
  const payload = toIssuePayload(finding({ category: 'genre-drift', misleads: 'both' }));
  assert.ok(payload.title.startsWith('Doc genre-drift:'), payload.title);
  assert.ok(payload.body.includes('human engineer'), 'misleads:both must render both personas in the body');
  assert.ok(payload.body.includes('coding agent'));
});
