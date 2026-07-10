'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractRiskEffort, recommendTier } = require('../tier');

test('extractRiskEffort reads risk and effort tiers from string labels', () => {
  const labels = ['code-health', 'code-health:risk-low', 'code-health:effort-low'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'low', effortTier: 'low' });
});

test('extractRiskEffort reads risk and effort tiers from {name} label objects', () => {
  const labels = [{ name: 'code-health:risk-high' }, { name: 'code-health:effort-medium' }];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'high', effortTier: 'medium' });
});

test('extractRiskEffort returns undefined fields when labels are absent', () => {
  assert.deepStrictEqual(extractRiskEffort([]), { riskTier: undefined, effortTier: undefined });
  assert.deepStrictEqual(extractRiskEffort(undefined), { riskTier: undefined, effortTier: undefined });
});

test('recommendTier returns fast-track only for risk:low AND effort:low', () => {
  assert.strictEqual(recommendTier({ riskTier: 'low', effortTier: 'low' }), 'fast-track');
});

test('recommendTier returns approved for any other risk/effort combination', () => {
  assert.strictEqual(recommendTier({ riskTier: 'low', effortTier: 'medium' }), 'approved');
  assert.strictEqual(recommendTier({ riskTier: 'high', effortTier: 'low' }), 'approved');
  assert.strictEqual(recommendTier({ riskTier: 'high', effortTier: 'high' }), 'approved');
});

test('recommendTier returns approved when either tier is missing', () => {
  assert.strictEqual(recommendTier({ riskTier: undefined, effortTier: 'low' }), 'approved');
  assert.strictEqual(recommendTier({ riskTier: 'low', effortTier: undefined }), 'approved');
  assert.strictEqual(recommendTier({}), 'approved');
});
