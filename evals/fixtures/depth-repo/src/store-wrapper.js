'use strict';

const { createStore } = require('./store');

// Convenience layer over store.js.
function makeStore() {
  return createStore();
}

function storeGet(store, key) {
  return store.get(key);
}

function storeSet(store, key, value) {
  return store.set(key, value);
}

function storeRemove(store, key) {
  return store.remove(key);
}

module.exports = { makeStore, storeGet, storeSet, storeRemove };
