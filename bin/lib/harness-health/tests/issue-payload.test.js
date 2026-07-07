const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

function patchFinding(overrides = {}) {
  return {
    id: 'skillhealth-abc12345',
    kind: 'patch',
    target: 'auth',
    assetType: 'skill',
    category: 'drift',
    section: 'Key Patterns',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stale example path',
    oldString: 'See `src/auth/login.js`.',
    newString: 'See `src/auth/session.js`.',
    reason: 'login.js was renamed to session.js.',
    ...overrides,
  };
}

function newSkillFinding(overrides = {}) {
  return {
    id: 'skillhealth-def67890',
    kind: 'new-skill',
    target: 'queue-retry-pattern',
    assetType: 'skill',
    category: 'drift',
    classification: 'additive',
    confidence: 'med',
    reversibility: 'high',
    description: 'Three files implement retry-with-backoff with no skill covering it',
    proposedBody: '---\nname: queue-retry-pattern\n---\n# Queue Retry Pattern',
    reason: 'src/jobs/a.js, b.js, c.js all implement the same pattern independently.',
    ...overrides,
  };
}

test('toIssuePayload for a patch finding includes the fingerprint marker and labels', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('<!-- harness-health-fingerprint: skillhealth-abc12345 -->'));
  assert.deepStrictEqual(payload.labels, ['harness-health', 'harness-health:restructural']);
  assert.ok(payload.title.includes('auth'));
  assert.ok(payload.body.includes('src/auth/login.js'));
  assert.ok(payload.body.includes('src/auth/session.js'));
});

test('toIssuePayload for a new-skill finding uses the new-skill label and includes proposedBody', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.deepStrictEqual(payload.labels, ['harness-health', 'harness-health:new-skill']);
  assert.ok(payload.title.includes('queue-retry-pattern'));
  assert.ok(payload.body.includes('Queue Retry Pattern'));
});

test('toIssuePayload body always includes Current State, Deliverables, and Acceptance Criteria sections', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('## Current State'));
  assert.ok(payload.body.includes('## Deliverables'));
  assert.ok(payload.body.includes('## Acceptance Criteria'));
});

test('toIssuePayload for a patch finding carries structured decision fields matching the input finding', () => {
  const finding = patchFinding();
  const payload = toIssuePayload(finding);
  assert.strictEqual(payload.id, finding.id);
  assert.strictEqual(payload.kind, finding.kind);
  assert.strictEqual(payload.target, finding.target);
  assert.strictEqual(payload.assetType, finding.assetType);
  assert.strictEqual(payload.category, finding.category);
  assert.strictEqual(payload.classification, finding.classification);
  assert.strictEqual(payload.confidence, finding.confidence);
  assert.strictEqual(payload.reversibility, finding.reversibility);
  assert.strictEqual(payload.oldString, finding.oldString);
  assert.strictEqual(payload.newString, finding.newString);
});

test('toIssuePayload for a new-skill finding carries structured decision fields matching the input finding', () => {
  const finding = newSkillFinding();
  const payload = toIssuePayload(finding);
  assert.strictEqual(payload.id, finding.id);
  assert.strictEqual(payload.kind, finding.kind);
  assert.strictEqual(payload.target, finding.target);
  assert.strictEqual(payload.assetType, finding.assetType);
  assert.strictEqual(payload.category, finding.category);
  assert.strictEqual(payload.classification, finding.classification);
  assert.strictEqual(payload.confidence, finding.confidence);
  assert.strictEqual(payload.reversibility, finding.reversibility);
});

test('toIssuePayload title reflects asset type and category', () => {
  const rule = toIssuePayload(patchFinding({ assetType: 'rule', target: 'api-errors', section: 'paths glob' }));
  assert.ok(rule.title.startsWith('Rule drift:'), rule.title);

  const claudeMd = toIssuePayload(patchFinding({ assetType: 'claude-md', target: 'CLAUDE', section: 'Conventions', category: 'best-practice' }));
  assert.ok(claudeMd.title.startsWith('CLAUDE.md best-practice:'), claudeMd.title);
});
