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

// ── v2 issue payload ───────────────────────────────────────────────────────

const { toIssuePayloadV2 } = require('../issue-payload');

const V2_FINDING = {
  id: 'recon-ab12cd34',
  criterion: 'simplification',
  areaId: 'src/api',
  anchor: 'src/api/user.js#getUser',
  severity: 'medium',
  confidence: 'high',
  title: 'getUser is a passthrough to the repository',
  evidence: 'src/api/user.js#getUser delegates directly to UserRepository.find with no added logic.',
  suggestedApproach: 'Inline the call at the call site, or add caching/auth in this method.',
  acceptance: 'getUser adds caching, authorization, or enrichment; or is removed.',
};

test('v2 labels are recon + recon:<severity> + recon:<criterion>', () => {
  assert.deepStrictEqual(
    toIssuePayloadV2(V2_FINDING).labels,
    ['recon', 'recon:medium', 'recon:simplification'],
  );
});

test('v2 title is the finding title', () => {
  assert.strictEqual(toIssuePayloadV2(V2_FINDING).title, V2_FINDING.title);
});

test('v2 body embeds the fingerprint marker', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('<!-- recon-fingerprint: recon-ab12cd34 -->'), 'marker missing');
});

test('v2 body has ## Current State containing anchor and evidence', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('## Current State'), '## Current State missing');
  assert.ok(body.includes('src/api/user.js#getUser'), 'anchor missing');
  assert.ok(body.includes('delegates directly to UserRepository.find'), 'evidence missing');
});

test('v2 body has ## Deliverables containing suggestedApproach', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('## Deliverables'), '## Deliverables missing');
  assert.ok(body.includes('Inline the call at the call site'), 'suggestedApproach missing');
});

test('v2 body has ## Acceptance Criteria containing acceptance', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('## Acceptance Criteria'), '## Acceptance Criteria missing');
  assert.ok(body.includes('adds caching, authorization'), 'acceptance missing');
});

test('v2 fingerprint marker is re-extractable with the standard regex', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  const m = body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/);
  assert.ok(m, 'regex did not match');
  assert.strictEqual(m[1], 'recon-ab12cd34');
});

test('toIssuePayload (v1) still works after extending the module', () => {
  // Guard: existing v1 export must be unaffected.
  const { toIssuePayload: v1 } = require('../issue-payload');
  const FINDING = {
    id: 'recon-abc12345', title: 'T', lens: 'oversized-file', category: 'architecture',
    severity: 'high', confidence: 'high', area: 'apps/web',
    files: ['apps/web/big.js'], evidence: 'E', suggestion: 'S', acceptance: 'A',
  };
  const p = v1(FINDING);
  assert.ok(p.body.includes('<!-- recon-fingerprint: recon-abc12345 -->'));
  assert.deepStrictEqual(p.labels, ['recon', 'recon:high']);
});

// ── relatedAnchors rendering (bundled findings) ──────────────────────────────

test('v2 body includes an "Also affects" line when relatedAnchors is present', () => {
  const finding = { ...V2_FINDING, relatedAnchors: ['src/api/other.js#getOther', 'src/api/third.js#getThird'] };
  const { body } = toIssuePayloadV2(finding);
  assert.ok(body.includes('Also affects:'), 'missing Also affects block');
  assert.ok(body.includes('`src/api/other.js#getOther`'));
  assert.ok(body.includes('`src/api/third.js#getThird`'));
});

test('v2 body omits "Also affects" when relatedAnchors is absent', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(!body.includes('Also affects:'));
});

test('v2 body omits "Also affects" when relatedAnchors is an empty array', () => {
  const { body } = toIssuePayloadV2({ ...V2_FINDING, relatedAnchors: [] });
  assert.ok(!body.includes('Also affects:'));
});
