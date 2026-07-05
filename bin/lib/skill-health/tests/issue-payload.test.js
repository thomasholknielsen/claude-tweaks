const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

function patchFinding(overrides = {}) {
  return {
    id: 'skillhealth-abc12345',
    kind: 'patch',
    skill: 'auth',
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
    skill: 'queue-retry-pattern',
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
  assert.ok(payload.body.includes('<!-- skill-health-fingerprint: skillhealth-abc12345 -->'));
  assert.deepStrictEqual(payload.labels, ['skill-health', 'skill-health:restructural']);
  assert.ok(payload.title.includes('auth'));
  assert.ok(payload.body.includes('src/auth/login.js'));
  assert.ok(payload.body.includes('src/auth/session.js'));
});

test('toIssuePayload for a new-skill finding uses the new-skill label and includes proposedBody', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.deepStrictEqual(payload.labels, ['skill-health', 'skill-health:new-skill']);
  assert.ok(payload.title.includes('queue-retry-pattern'));
  assert.ok(payload.body.includes('Queue Retry Pattern'));
});

test('toIssuePayload body always includes Current State, Deliverables, and Acceptance Criteria sections', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('## Current State'));
  assert.ok(payload.body.includes('## Deliverables'));
  assert.ok(payload.body.includes('## Acceptance Criteria'));
});
