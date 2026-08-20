'use strict';

const { makeStore, storeSet, storeRemove } = require('./store-wrapper');

function countSurvivors(entries) {
  const store = makeStore();
  for (const [key, value] of entries) storeSet(store, key, value);
  storeRemove(store, 'discard');
  return store.size();
}

module.exports = { countSurvivors };
