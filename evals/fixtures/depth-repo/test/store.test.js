'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { rememberGreeting } = require('../src/app');
const { countSurvivors } = require('../src/report');
const { createStore } = require('../src/store');

test('rememberGreeting stores and returns the greeting', () => {
  assert.strictEqual(rememberGreeting('Ada'), 'Hello, Ada!');
});

test('countSurvivors drops the discard key', () => {
  assert.strictEqual(countSurvivors([['a', 1], ['discard', 2], ['b', 3]]), 2);
});

test('store rejects empty keys', () => {
  const store = createStore();
  assert.throws(() => store.set('', 1), TypeError);
});
