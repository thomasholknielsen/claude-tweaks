const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

const FINDING = {
  id: 'recon-abc12345',
  title: 'Oversized file: big.js (700 lines)',
  lens: 'oversized-file',
  category: 'architecture',
  severity: 'high',
  confidence: 'high',
  area: 'apps/web',
  files: ['apps/web/big.js'],
  evidence: 'apps/web/big.js has 700 lines, exceeding the 300-line threshold.',
  suggestion: 'Break big.js into smaller modules.',
  acceptance: 'No module exceeds 300 lines, or the threshold is documented.',
};

test('labels are recon + recon:<severity>', () => {
  assert.deepStrictEqual(toIssuePayload(FINDING).labels, ['recon', 'recon:high']);
});

test('title is the finding title', () => {
  assert.strictEqual(toIssuePayload(FINDING).title, 'Oversized file: big.js (700 lines)');
});

test('body embeds the fingerprint marker so it can be re-extracted for dedup', () => {
  const { body } = toIssuePayload(FINDING);
  assert.ok(body.includes('<!-- recon-fingerprint: recon-abc12345 -->'));
});

test('body carries /specify-shaped sections sourced from the finding', () => {
  const { body } = toIssuePayload(FINDING);
  assert.ok(body.includes('## Current State'));
  assert.ok(body.includes('apps/web/big.js'));                 // files
  assert.ok(body.includes('has 700 lines'));                   // evidence
  assert.ok(body.includes('## Deliverables'));
  assert.ok(body.includes('Break big.js into smaller modules.')); // suggestion
  assert.ok(body.includes('## Acceptance Criteria'));
  assert.ok(body.includes('No module exceeds 300 lines'));     // acceptance
});

// The marker is the dedup contract: the skill reads issue bodies and matches this.
test('the fingerprint can be re-extracted from the body with a stable regex', () => {
  const { body } = toIssuePayload(FINDING);
  const m = body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/);
  assert.strictEqual(m[1], 'recon-abc12345');
});
