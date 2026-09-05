'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'build-review-context.js');

test('mint with no --run exits 0 and prints a JSON line with a dir key', () => {
  const result = spawnSync(process.execPath, [CLI, 'mint'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(typeof parsed.dir, 'string');
});

test('unknown command exits 2 and prints usage to stderr', () => {
  const result = spawnSync(process.execPath, [CLI, 'bogus-command'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown command: bogus-command/);
});
