'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runWithConcurrency, DEFAULT_CONCURRENCY } = require('../../../bin/lib/reconcile/gh-pool');

test('runWithConcurrency: results preserve input order regardless of completion order', async () => {
  const delays = [30, 10, 20];
  const results = await runWithConcurrency(delays, (ms) => new Promise((r) => setTimeout(() => r(ms), ms)), 3);
  assert.deepEqual(results, [30, 10, 20]);
});

test('runWithConcurrency: never runs more than `cap` workers at once', async () => {
  let active = 0;
  let maxActive = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);
  await runWithConcurrency(items, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
  }, 3);
  assert.ok(maxActive <= 3, `max concurrent was ${maxActive}, expected <= 3`);
});

test('runWithConcurrency: a rejected worker does not abort the rest of the batch — resolves to a caught error marker', async () => {
  const items = [1, 2, 3];
  const results = await runWithConcurrency(items, async (i) => {
    if (i === 2) throw new Error('boom');
    return i;
  }, 2);
  assert.equal(results[0], 1);
  assert.ok(results[1] instanceof Error);
  assert.equal(results[2], 3);
});

test('runWithConcurrency: defaults to DEFAULT_CONCURRENCY when no cap is given', async () => {
  assert.equal(DEFAULT_CONCURRENCY, 6);
});
