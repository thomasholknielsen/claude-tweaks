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

const { recordRun, readCursors, writeCursors } = require('../cache');

function tmp2() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cache2-')); }

test('writeCursors is exported and round-trips via readCursors', () => {
  const root = tmp2();
  const cursors = { 'src': { lastSweptMs: 1000, lastHash: 'abc123' } };
  writeCursors(root, cursors);
  assert.deepStrictEqual(readCursors(root), cursors);
});

test('recordRun with hashes persists lastHash into cursors', () => {
  const root = tmp2();
  const runId = 'test-run-1';
  recordRun(root, runId, {
    fingerprints: ['recon-aabbccdd'],
    areasSwept: ['src'],
    hashes: { src: 'sha1-of-src-contents' },
  });
  const cursors = readCursors(root);
  assert.strictEqual(cursors['src'].lastHash, 'sha1-of-src-contents');
  assert.ok(typeof cursors['src'].lastSweptMs === 'number');
});

test('recordRun without hashes leaves existing lastHash untouched', () => {
  const root = tmp2();
  writeCursors(root, { 'lib': { lastSweptMs: 5000, lastHash: 'existing-hash' } });
  recordRun(root, 'run-2', { fingerprints: [], areasSwept: ['lib'] });
  const cursors = readCursors(root);
  assert.strictEqual(cursors['lib'].lastHash, 'existing-hash');
});

test('recordRun with hashes for an area not in areasSwept is ignored', () => {
  const root = tmp2();
  recordRun(root, 'run-3', {
    fingerprints: [],
    areasSwept: ['a'],
    hashes: { a: 'hash-a', b: 'hash-b-should-be-ignored' },
  });
  const cursors = readCursors(root);
  assert.ok(!cursors['b'], 'only swept areas get cursors written');
});
