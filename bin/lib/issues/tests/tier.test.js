'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractRiskEffort, extractCeremony } = require('../tier');

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

test('extractRiskEffort returns undefined fields when labels are absent', () => {
  assert.deepStrictEqual(extractRiskEffort([]), { riskTier: undefined, effortTier: undefined });
  assert.deepStrictEqual(extractRiskEffort(undefined), { riskTier: undefined, effortTier: undefined });
});

test('extractRiskEffort ignores non-colon-form labels entirely (no legacy fallback)', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['code-health:risk-low', 'harness-health:additive', 'risk-medium']),
    { riskTier: undefined, effortTier: undefined },
  );
});

test('extractRiskEffort resolves risk and effort independently when only one axis is present', () => {
  assert.deepStrictEqual(extractRiskEffort(['risk:low']), { riskTier: 'low', effortTier: undefined });
  assert.deepStrictEqual(extractRiskEffort(['effort:high']), { riskTier: undefined, effortTier: 'high' });
});

test('extractCeremony reads canonical colon-form ceremony:* string labels', () => {
  assert.deepStrictEqual(extractCeremony(['ceremony:fast-lane']), { ceremonyTier: 'fast-lane' });
  assert.deepStrictEqual(extractCeremony(['ceremony:standard']), { ceremonyTier: 'standard' });
});

test('extractCeremony reads canonical colon-form labels from {name} objects', () => {
  assert.deepStrictEqual(extractCeremony([{ name: 'ceremony:fast-lane' }]), { ceremonyTier: 'fast-lane' });
});

test('extractCeremony returns undefined when the label is absent', () => {
  assert.deepStrictEqual(extractCeremony([]), { ceremonyTier: undefined });
  assert.deepStrictEqual(extractCeremony(undefined), { ceremonyTier: undefined });
});

test('extractCeremony ignores non-matching labels', () => {
  assert.deepStrictEqual(extractCeremony(['risk:low', 'ceremony:bogus']), { ceremonyTier: undefined });
});
