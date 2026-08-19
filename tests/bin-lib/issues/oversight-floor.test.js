'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { exceedsOversightFloor, maxRiskTier } = require('../../../plugin/bin/lib/issues/oversight-floor.js');
const { resolveValue } = require('../../../plugin/bin/lib/policy-schema.js');

test('#366 AC1: risk exceeds its floor, size does not — reason risk', () => {
  const result = exceedsOversightFloor({ risk: 'high', size: 'low' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'risk' });
});

test('#366 AC2: size exceeds its floor, risk does not — reason size', () => {
  const result = exceedsOversightFloor({ risk: 'low', size: 'high' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'size' });
});

test('#366 AC3: neither axis exceeds its floor', () => {
  const result = exceedsOversightFloor({ risk: 'medium', size: 'medium' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: false, reason: null });
});

test('#366 AC4: both facets absent fails closed as unscored', () => {
  const result = exceedsOversightFloor({}, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'unscored' });
});

test('#366 AC5: riskFloor \'always\' short-circuits regardless of tier', () => {
  const result = exceedsOversightFloor({ risk: 'low', size: 'low' }, { riskFloor: 'always', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'risk' });
});

test('#366 AC6: sizeFloor \'always\' short-circuits independently', () => {
  const result = exceedsOversightFloor({ risk: 'low', size: 'low' }, { riskFloor: 'high', sizeFloor: 'always' });
  assert.deepEqual(result, { exceeds: true, reason: 'size' });
});

test('#366 AC7: both dimensions exceed — risk wins the tie', () => {
  const result = exceedsOversightFloor({ risk: 'high', size: 'high' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'risk' });
});

test('#366 AC8: size facet absent (risk present and exceeding) still fails closed as unscored', () => {
  const result = exceedsOversightFloor({ risk: 'high' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'unscored' });
});

test('#366 AC9: an out-of-vocabulary risk value folds to unscored, same as missing', () => {
  const result = exceedsOversightFloor({ risk: 'critical', size: 'low' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'unscored' });
});

test('#366 AC9b: sizeFloor null means size is not evaluated — missing size facet does not trigger unscored', () => {
  const result = exceedsOversightFloor({ risk: 'low' }, { riskFloor: 'high', sizeFloor: null });
  assert.deepEqual(result, { exceeds: false, reason: null });
});

test('#366 AC9c: risk axis still evaluates normally when size is excluded via null', () => {
  const result = exceedsOversightFloor({ risk: 'high' }, { riskFloor: 'high', sizeFloor: null });
  assert.deepEqual(result, { exceeds: true, reason: 'risk' });
});

test('#366: undefined floors default to \'high\' (fail-safe for a caller that forgot to resolve them)', () => {
  const result = exceedsOversightFloor({ risk: 'high', size: 'low' }, {});
  assert.deepEqual(result, { exceeds: true, reason: 'risk' });
});

test('#366: both floors null evaluates nothing', () => {
  const result = exceedsOversightFloor({}, { riskFloor: null, sizeFloor: null });
  assert.deepEqual(result, { exceeds: false, reason: null });
});

test('#366 AC10: risk-floor/size-floor resolve to schema default \'high\' when unset', () => {
  assert.equal(resolveValue('risk-floor', undefined), 'high');
  assert.equal(resolveValue('size-floor', undefined), 'high');
});

// #367: maxRiskTier — the parent-aggregation input for the demo binary gate's Parent-Gate
// Procedure (never reads size at the parent level; a single unscored leaf fails the whole
// aggregate closed rather than being outvoted by its siblings).

test('#367: maxRiskTier picks the highest tier across leaves', () => {
  assert.equal(maxRiskTier([{ risk: 'low' }, { risk: 'medium' }, { risk: 'low' }]), 'medium');
  assert.equal(maxRiskTier([{ risk: 'high' }, { risk: 'low' }]), 'high');
  assert.equal(maxRiskTier([{ risk: 'low' }]), 'low');
});

test('#367: maxRiskTier is undefined (unscored) when any leaf is missing risk', () => {
  assert.equal(maxRiskTier([{ risk: 'high' }, {}]), undefined);
  assert.equal(maxRiskTier([{ risk: 'high' }, { risk: 'critical' }]), undefined); // out-of-vocabulary
});

test('#367: maxRiskTier is undefined on an empty leaves array', () => {
  assert.equal(maxRiskTier([]), undefined);
  assert.equal(maxRiskTier(undefined), undefined);
});

// #367 Demo binary gate — the exact call shapes the gate uses, over exceedsOversightFloor.

test('#367 AC1: leaf risk:medium/size:medium under default floor (high/high) does not exceed — gate not required', () => {
  const result = exceedsOversightFloor({ risk: 'medium', size: 'medium' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: false, reason: null });
});

test('#367 AC2: leaf risk:high/size:low under default floor exceeds (risk) — gate required, unchanged from today', () => {
  const result = exceedsOversightFloor({ risk: 'high', size: 'low' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(result, { exceeds: true, reason: 'risk' });
});

test('#367 AC3: parent whose sub-issues are low/medium/low (max=medium) does not exceed — parent not gated', () => {
  const leaves = [{ risk: 'low' }, { risk: 'medium' }, { risk: 'low' }];
  const result = exceedsOversightFloor({ risk: maxRiskTier(leaves) }, { riskFloor: 'high', sizeFloor: null });
  assert.deepEqual(result, { exceeds: false, reason: null });
});

test('#367 AC4: same parent with one risk:high sub-issue exceeds — parent gated', () => {
  const leaves = [{ risk: 'low' }, { risk: 'medium' }, { risk: 'low' }, { risk: 'high' }];
  const result = exceedsOversightFloor({ risk: maxRiskTier(leaves) }, { riskFloor: 'high', sizeFloor: null });
  assert.deepEqual(result, { exceeds: true, reason: 'risk' });
});

test('#367 AC5: parent sub-issues all risk:low, one size:high — not gated (size never read at parent level)', () => {
  const leaves = [{ risk: 'low', size: 'high' }, { risk: 'low', size: 'low' }];
  const result = exceedsOversightFloor({ risk: maxRiskTier(leaves) }, { riskFloor: 'high', sizeFloor: null });
  assert.deepEqual(result, { exceeds: false, reason: null });
});

test('#367 AC6/6b: a sub-issue (or leaf record) with no risk:* label fails closed regardless of size', () => {
  const leaves = [{ risk: 'low' }, {}]; // one leaf missing risk entirely
  const result = exceedsOversightFloor({ risk: maxRiskTier(leaves) }, { riskFloor: 'high', sizeFloor: null });
  assert.deepEqual(result, { exceeds: true, reason: 'unscored' });

  // 6b: the standalone leaf path evaluates risk+size directly (no maxRiskTier involved)
  const leafResult = exceedsOversightFloor({ size: 'low' }, { riskFloor: 'high', sizeFloor: 'high' });
  assert.deepEqual(leafResult, { exceeds: true, reason: 'unscored' });
});
