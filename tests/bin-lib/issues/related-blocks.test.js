'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildRelatedBlocks } = require('../../../plugin/bin/lib/issues/related-blocks');

test('buildRelatedBlocks returns [] when relatedSections is undefined', () => {
  assert.deepStrictEqual(buildRelatedBlocks(undefined), []);
});

test('buildRelatedBlocks returns [] when relatedSections is an empty array', () => {
  assert.deepStrictEqual(buildRelatedBlocks([]), []);
});

test('buildRelatedBlocks returns [] when relatedSections is not an array', () => {
  assert.deepStrictEqual(buildRelatedBlocks('not-an-array'), []);
});

test('buildRelatedBlocks renders a single "Also affects" line with backtick-wrapped, comma-joined sections', () => {
  const result = buildRelatedBlocks(['Auto-detect Patterns', 'Research Directory']);
  assert.deepStrictEqual(result, ['Also affects: `Auto-detect Patterns`, `Research Directory`']);
});

test('buildRelatedBlocks handles a single-element array without a trailing comma', () => {
  const result = buildRelatedBlocks(['Key Patterns']);
  assert.deepStrictEqual(result, ['Also affects: `Key Patterns`']);
});

// Regression: this module is shared by harness-health/issue-payload.js,
// journey-health/issue-payload.js, and docs-health/issue-payload.js —
// previously a byte-identical inline block duplicated across all three.
test('buildRelatedBlocks is the single shared implementation across every consumer issue-payload.js', () => {
  const harnessPayload = require('../../../plugin/bin/lib/harness-health/issue-payload');
  const journeyPayload = require('../../../plugin/bin/lib/journey-health/issue-payload');
  const docsPayload = require('../../../plugin/bin/lib/docs-health/issue-payload');
  // Each module wraps buildRelatedBlocks internally (not re-exported), so
  // prove sharing indirectly: a bundled finding in each domain renders the
  // identical "Also affects" line shape for the identical input.
  const sections = ['Section A', 'Section B'];
  const harnessBody = harnessPayload.toIssuePayload({
    id: 'x', kind: 'patch', target: 't', assetType: 'skill', section: 's', category: 'drift',
    classification: 'additive', confidence: 'high', reversibility: 'high', description: 'd', reason: 'r',
    oldString: 'a', newString: 'b', relatedSections: sections,
  }).body;
  const journeyBody = journeyPayload.toIssuePayload({
    id: 'x', journey: 'j', category: 'coverage', section: 'coverage', description: 'd', reason: 'r',
    confidence: 'high', severity: 'high', recommendation: 'rec', relatedSections: sections,
  }).body;
  const docsBody = docsPayload.toIssuePayload({
    id: 'x', target: 't', assetType: 'doc', section: 's', category: 'staleness', misleads: 'agent',
    classification: 'additive', confidence: 'high', reversibility: 'high', description: 'd', reason: 'r',
    oldString: 'a', newString: 'b', relatedSections: sections,
  }).body;
  const expected = 'Also affects: `Section A`, `Section B`';
  assert.ok(harnessBody.includes(expected));
  assert.ok(journeyBody.includes(expected));
  assert.ok(docsBody.includes(expected));
});
