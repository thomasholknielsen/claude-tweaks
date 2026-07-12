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

test('extractRiskEffort maps harness-health:additive to riskTier low, effortTier low', () => {
  const labels = ['harness-health', 'harness-health:additive'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'low', effortTier: 'low' });
});

test('extractRiskEffort maps harness-health:restructural to riskTier high, effortTier high', () => {
  const labels = ['harness-health', 'harness-health:restructural'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'high', effortTier: 'high' });
});

test('extractRiskEffort leaves harness-health:new-skill unmatched (new-skill proposals never fast-track)', () => {
  const labels = ['harness-health', 'harness-health:new-skill'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: undefined, effortTier: undefined });
});

test('extractRiskEffort works with {name} label objects for harness-health too', () => {
  const labels = [{ name: 'harness-health:additive' }];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'low', effortTier: 'low' });
});

test('recommendTier: harness-health additive mapping reaches fast-track', () => {
  const { riskTier, effortTier } = extractRiskEffort(['harness-health:additive']);
  assert.strictEqual(recommendTier({ riskTier, effortTier }), 'fast-track');
});

test('recommendTier: harness-health restructural mapping stays approved', () => {
  const { riskTier, effortTier } = extractRiskEffort(['harness-health:restructural']);
  assert.strictEqual(recommendTier({ riskTier, effortTier }), 'approved');
});
