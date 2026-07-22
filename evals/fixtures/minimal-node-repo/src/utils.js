'use strict';

function lastNItems(items, n) {
  return items.slice(items.length - n);
}

module.exports = { lastNItems };
