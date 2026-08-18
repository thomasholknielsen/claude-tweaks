'use strict';

function createStore() {
  const data = new Map();
  return {
    get(key) {
      if (typeof key !== 'string' || key === '') throw new TypeError('key must be a non-empty string');
      return data.has(key) ? data.get(key) : undefined;
    },
    set(key, value) {
      if (typeof key !== 'string' || key === '') throw new TypeError('key must be a non-empty string');
      data.set(key, value);
      return value;
    },
    remove(key) {
      if (typeof key !== 'string' || key === '') throw new TypeError('key must be a non-empty string');
      return data.delete(key);
    },
    size() {
      return data.size;
    },
  };
}

module.exports = { createStore };
