const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

function finding(overrides = {}) {
  return {
    id: 'journeyhealth-abc12345',
    journey: 'checkout-flow',
    category: 'drift',
    section: 'files-frontmatter',
    description: 'files: entry no longer exists',
    reason: 'src/checkout/OldCart.tsx was deleted in a1b2c3d',
    confidence: 'high',
    severity: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}

test('toIssuePayload embeds the fingerprint marker in the body', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('<!-- journey-health-fingerprint: journeyhealth-abc12345 -->'));
});

test('toIssuePayload builds a title from category and section', () => {
  const payload = toIssuePayload(finding());
  assert.strictEqual(payload.title, 'Journey drift: checkout-flow — files-frontmatter');
});

test('toIssuePayload maps regression-suspected to the "regression" title label', () => {
  const payload = toIssuePayload(finding({ category: 'regression-suspected', section: 'live-check' }));
  assert.strictEqual(payload.title, 'Journey regression: checkout-flow — live-check');
});

test('toIssuePayload sets the journey-health, category, and severity labels', () => {
  const payload = toIssuePayload(finding());
  assert.deepStrictEqual(payload.labels, ['journey-health', 'journey-health:drift', 'journey-health:high']);
});

test('toIssuePayload includes description, reason, and recommendation in the body', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('files: entry no longer exists'));
  assert.ok(payload.body.includes('src/checkout/OldCart.tsx was deleted in a1b2c3d'));
  assert.ok(payload.body.includes('Run /claude-tweaks:journeys checkout-flow'));
});
