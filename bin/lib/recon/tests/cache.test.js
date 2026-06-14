const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readCache, writeCache, cachePath } = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cache-')); }

test('readCache returns {} when no cache file exists', () => {
  assert.deepStrictEqual(readCache(tmp()), {});
});

test('cachePath points at .claude-tweaks/recon/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'recon', 'cache.json'));
});

test('writeCache then readCache round-trips and creates the dir', () => {
  const root = tmp();
  const cache = { 'recon-abc12345': { status: 'open', issue: 42 }, 'recon-deadbeef': { status: 'remembered', issue: null } };
  writeCache(root, cache);
  assert.ok(fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')));
  assert.deepStrictEqual(readCache(root), cache);
});

test('readCache returns {} on corrupt JSON rather than throwing', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'recon'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json'), '{ not json');
  assert.deepStrictEqual(readCache(root), {});
});
