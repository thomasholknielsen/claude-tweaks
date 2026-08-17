'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBudget } = require('../../../bin/lib/reconcile/budget');

test('createBudget: not exceeded immediately after creation', () => {
  const b = createBudget(1000);
  assert.equal(b.exceeded(), false);
});

test('createBudget: exceeded once the deadline has passed', async () => {
  const b = createBudget(1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(b.exceeded(), true);
});

test('createBudget: remainingMs never goes negative', async () => {
  const b = createBudget(1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(b.remainingMs(), 0);
});
