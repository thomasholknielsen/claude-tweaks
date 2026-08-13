'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { exceedsOversightFloor } = require('../oversight-floor.js');
const { resolveValue } = require('../../policy-schema.js');

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
