'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractRiskEffort, recommendTier, recommendGrants } = require('../tier');

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

// --- recommendGrants (build/merge grants, colon-form vocabulary) ---

test('recommendGrants grants build and merge for low risk + low effort', () => {
  assert.deepStrictEqual(recommendGrants({ risk: 'low', effort: 'low' }), { build: true, merge: true });
});

test('recommendGrants grants build only (no merge) for any other known risk/effort pair', () => {
  assert.deepStrictEqual(recommendGrants({ risk: 'low', effort: 'medium' }), { build: true, merge: false });
  assert.deepStrictEqual(recommendGrants({ risk: 'high', effort: 'low' }), { build: true, merge: false });
  assert.deepStrictEqual(recommendGrants({ risk: 'medium', effort: 'medium' }), { build: true, merge: false });
});

test('recommendGrants denies build and merge when an axis is missing', () => {
  assert.deepStrictEqual(recommendGrants({ risk: 'low' }), { build: false, merge: false });
  assert.deepStrictEqual(recommendGrants({}), { build: false, merge: false });
});

test('recommendGrants denies build and merge for an unknown tier value (unknown is never treated as known)', () => {
  assert.deepStrictEqual(recommendGrants({ risk: 'critical', effort: 'low' }), { build: false, merge: false });
});

// --- extractRiskEffort: canonical colon-form adapter (highest precedence) ---

test('extractRiskEffort reads canonical colon-form risk:*/effort:* string labels', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['risk:low', 'effort:medium']),
    { riskTier: 'low', effortTier: 'medium' },
  );
});

test('extractRiskEffort reads canonical colon-form labels from {name} objects', () => {
  const labels = [{ name: 'risk:high' }, { name: 'effort:high' }];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'high', effortTier: 'high' });
});

test('extractRiskEffort prefers the colon form over a legacy code-health form for the same axis', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['risk:low', 'code-health:risk-high']),
    { riskTier: 'low', effortTier: undefined },
  );
});

// --- extractRiskEffort: legacy adapters still read (fallback precedence) ---

test('extractRiskEffort still reads legacy code-health-prefixed hyphen labels', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['code-health:risk-low', 'code-health:effort-low']),
    { riskTier: 'low', effortTier: 'low' },
  );
});

test('extractRiskEffort reads legacy bare hyphen labels (risk-*/effort-*)', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['risk-medium', 'effort-high']),
    { riskTier: 'medium', effortTier: 'high' },
  );
});

test('extractRiskEffort still maps harness-health:additive to low/low', () => {
  assert.deepStrictEqual(extractRiskEffort(['harness-health:additive']), { riskTier: 'low', effortTier: 'low' });
});

// --- extractRiskEffort: per-axis independent resolution across adapters ---

test('extractRiskEffort resolves each axis independently — colon risk + legacy code-health effort', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['risk:low', 'code-health:effort-medium']),
    { riskTier: 'low', effortTier: 'medium' },
  );
});
