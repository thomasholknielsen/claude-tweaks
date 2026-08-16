// Task 0 probe for #560 — deliberately failing so `gh pr checks --watch` observes a red run.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
test('task0 probe: this test fails on purpose', () => { assert.strictEqual(1, 2, 'probe failure'); });
