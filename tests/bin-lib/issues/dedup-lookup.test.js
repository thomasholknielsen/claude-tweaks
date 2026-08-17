'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { findByMarker } = require('../../../plugin/bin/lib/issues/dedup-lookup');

test('findByMarker returns null when issues array is empty', () => {
  assert.strictEqual(findByMarker([], '<!-- marker -->'), null);
});

test('findByMarker returns null when no issue body contains the marker', () => {
  const issues = [
    { number: 1, title: 'a', body: 'nothing here', createdAt: '2026-07-20T00:00:00Z' },
  ];
  assert.strictEqual(findByMarker(issues, '<!-- marker -->'), null);
});

test('findByMarker returns the single match as canonical with no duplicates', () => {
  const issues = [
    { number: 1, title: 'a', body: 'intro <!-- marker --> outro', createdAt: '2026-07-20T00:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 1);
  assert.deepStrictEqual(result.duplicates, []);
});

test('findByMarker picks the newest match as canonical regardless of input order, duplicates oldest-first', () => {
  const issues = [
    { number: 1089, title: 'c', body: '<!-- marker -->', createdAt: '2026-07-22T14:00:00Z' },
    { number: 1016, title: 'a', body: '<!-- marker -->', createdAt: '2026-07-20T09:00:00Z' },
    { number: 1079, title: 'b', body: '<!-- marker -->', createdAt: '2026-07-22T09:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 1089);
  assert.deepStrictEqual(result.duplicates.map((d) => d.number), [1016, 1079]);
});

test('findByMarker breaks createdAt ties by highest issue number', () => {
  const issues = [
    { number: 10, title: 'a', body: '<!-- marker -->', createdAt: '2026-07-22T09:00:00Z' },
    { number: 12, title: 'b', body: '<!-- marker -->', createdAt: '2026-07-22T09:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 12);
  assert.deepStrictEqual(result.duplicates.map((d) => d.number), [10]);
});

test('findByMarker skips issues with a missing or non-string body without throwing', () => {
  const issues = [
    { number: 1, title: 'a', body: undefined, createdAt: '2026-07-20T00:00:00Z' },
    { number: 2, title: 'b', createdAt: '2026-07-21T00:00:00Z' },
    { number: 3, title: 'c', body: '<!-- marker -->', createdAt: '2026-07-22T00:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 3);
  assert.deepStrictEqual(result.duplicates, []);
});

test('findByMarker accepts a RegExp pattern', () => {
  const issues = [
    { number: 5, title: 'a', body: '<!-- dispatch-preflight-marker: lint-check -->', createdAt: '2026-07-20T00:00:00Z' },
    { number: 6, title: 'b', body: '<!-- dispatch-preflight-marker: type-check -->', createdAt: '2026-07-21T00:00:00Z' },
  ];
  const result = findByMarker(issues, /dispatch-preflight-marker: lint-check/);
  assert.strictEqual(result.canonical.number, 5);
  assert.deepStrictEqual(result.duplicates, []);
});

test('findByMarker discriminates a marker from another marker that is a prefix of it', () => {
  const issues = [
    { number: 5, title: 'a', body: '<!-- dispatch-preflight-marker: lint -->', createdAt: '2026-07-20T00:00:00Z' },
    { number: 6, title: 'b', body: '<!-- dispatch-preflight-marker: lint-check -->', createdAt: '2026-07-21T00:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- dispatch-preflight-marker: lint -->');
  assert.strictEqual(result.canonical.number, 5);
  assert.deepStrictEqual(result.duplicates, []);
});

test('findByMarker treats a malformed createdAt as epoch 0, still resolves canonical deterministically', () => {
  const issues = [
    { number: 1, title: 'a', body: '<!-- marker -->', createdAt: 'not-a-date' },
    { number: 2, title: 'b', body: '<!-- marker -->', createdAt: '2026-07-20T00:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 2);
  assert.deepStrictEqual(result.duplicates.map((d) => d.number), [1]);
});
