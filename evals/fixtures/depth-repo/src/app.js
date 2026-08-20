'use strict';

const { makeStore, storeGet, storeSet } = require('./store-wrapper');

function rememberGreeting(name) {
  const store = makeStore();
  storeSet(store, 'greeting', `Hello, ${name}!`);
  return storeGet(store, 'greeting');
}

module.exports = { rememberGreeting };
