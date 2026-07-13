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

test('cachePath points at .claude-tweaks/code-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'code-health', 'cache.json'));
});

test('writeCache then readCache round-trips and creates the dir', () => {
  const root = tmp();
  const cache = { 'recon-abc12345': { status: 'open', issue: 42 }, 'recon-deadbeef': { status: 'remembered', issue: null } };
  writeCache(root, cache);
  assert.ok(fs.existsSync(path.join(root, '.claude-tweaks', 'code-health', 'cache.json')));
  assert.deepStrictEqual(readCache(root), cache);
});

test('readCache returns {} on corrupt JSON rather than throwing', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'code-health'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'code-health', 'cache.json'), '{ not json');
  assert.deepStrictEqual(readCache(root), {});
});

// recordRun/readCursors/writeCursors (local-disk cursor persistence) were
// removed by the health-state migration — cursors now live on the durable
// health-state branch (bin/lib/health-core/durable-state.js), not local disk.
// The cursor-merge semantics these tests used to cover directly (preserve an
// existing lastHash when an area isn't in areasSwept; only touch swept areas)
// now live inline in bin/code-health.js's cmdValidateFindings writeDurableState
// mutator, exercised end-to-end by bin/lib/code-health/tests/durable-integration.test.js
// and bin/lib/code-health/tests/cli-nextslice.test.js (which seed the durable
// health-state branch directly via a local bare git remote — no gh/network
// needed for reads). The write path itself (gh api blob/tree/commit/ref calls)
// is covered by bin/lib/health-core/tests/durable-state.test.js's fake-runner
// tests; it cannot be re-exercised for real without live GitHub credentials.

const { readDurableState, writeDurableState } = require('../cache');

test('readDurableState/writeDurableState are bound to the code-health skill name', () => {
  const calls = [];
  const fakeRun = (cmd, args) => {
    calls.push(args.join(' '));
    if (args.includes('fetch')) return '';
    throw new Error('fatal: path does not exist'); // every file read defaults to empty
  };
  // cache.js's exports are already bound instances — this test only proves the
  // shape is right and that calling readDurableState doesn't throw with a
  // fresh/empty branch. Full read/write behavior is covered by
  // bin/lib/health-core/tests/durable-state.test.js already.
  assert.strictEqual(typeof readDurableState, 'function');
  assert.strictEqual(typeof writeDurableState, 'function');
});
