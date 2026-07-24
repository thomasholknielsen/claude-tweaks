const { test } = require('node:test');
const assert = require('node:assert');
const { formatUserName, formatAdminName } = require('../src/duplicated.js');

test('formatUserName trims and joins', () => {
  assert.strictEqual(formatUserName(' Ada ', ' Lovelace '), 'Ada Lovelace');
});

test('formatAdminName trims and joins', () => {
  assert.strictEqual(formatAdminName(' Grace ', ' Hopper '), 'Grace Hopper');
});
