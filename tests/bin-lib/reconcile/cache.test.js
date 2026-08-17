'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readCache, writeCache, isFresh, CACHE_FILENAME, DEFAULT_TTL_MS } = require('../../../bin/lib/reconcile/cache');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-cache-'));
}

test('readCache: absent file reads as empty defaults, not a throw', () => {
  const root = tmpRoot();
  assert.deepEqual(readCache(root), { lastRunAt: null, claimShas: {} });
});

test('readCache: corrupt JSON fails closed to empty defaults, not a throw', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', CACHE_FILENAME), '{not json');
  assert.deepEqual(readCache(root), { lastRunAt: null, claimShas: {} });
});

test('writeCache then readCache round-trips', () => {
  const root = tmpRoot();
  writeCache(root, { lastRunAt: 12345, claimShas: { 7: 'abc' } });
  assert.deepEqual(readCache(root), { lastRunAt: 12345, claimShas: { 7: 'abc' } });
});

test('writeCache: a failure (unwritable dir) is swallowed, never throws', () => {
  const root = '/nonexistent-does-not-exist-820';
  assert.doesNotThrow(() => writeCache(root, { lastRunAt: 1, claimShas: {} }));
});

test('isFresh: within TTL is fresh', () => {
  assert.equal(isFresh({ lastRunAt: 1000 }, 1000 + DEFAULT_TTL_MS - 1, DEFAULT_TTL_MS), true);
});

test('isFresh: past TTL is not fresh', () => {
  assert.equal(isFresh({ lastRunAt: 1000 }, 1000 + DEFAULT_TTL_MS + 1, DEFAULT_TTL_MS), false);
});

test('isFresh: null lastRunAt (never run) is never fresh', () => {
  assert.equal(isFresh({ lastRunAt: null }, Date.now(), DEFAULT_TTL_MS), false);
});
