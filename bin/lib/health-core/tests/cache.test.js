'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCache } = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'health-core-cache-')); }

test('cachePath is namespaced under .claude-tweaks/<skillName>/cache.json', () => {
  const core = createCache('some-skill');
  const root = tmp();
  assert.strictEqual(core.cachePath(root), path.join(root, '.claude-tweaks', 'some-skill', 'cache.json'));
});

test('readCache returns {} when the cache file does not exist', () => {
  const core = createCache('some-skill');
  assert.deepStrictEqual(core.readCache(tmp()), {});
});

test('writeCache then readCache round-trips and creates the dir', () => {
  const core = createCache('some-skill');
  const root = tmp();
  const cache = { 'someskill-abc123': { status: 'staged' } };
  core.writeCache(root, cache);
  assert.ok(fs.existsSync(core.cachePath(root)));
  assert.deepStrictEqual(core.readCache(root), cache);
});

test('readCache returns {} on corrupt JSON rather than throwing', () => {
  const core = createCache('some-skill');
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'some-skill'), { recursive: true });
  fs.writeFileSync(core.cachePath(root), '{ not json');
  assert.deepStrictEqual(core.readCache(root), {});
});

test('two different skill names namespace to different directories under the same root', () => {
  const root = tmp();
  const a = createCache('skill-a');
  const b = createCache('skill-b');
  a.writeCache(root, { x: 1 });
  assert.deepStrictEqual(b.readCache(root), {});
});

// cursorsPath/readCursors/writeCursors/runsDir/readRuns (local-disk cursor and
// run-log persistence) were removed by the durable-state migration — cursors
// and run history now live on the health-state git branch
// (bin/lib/health-core/durable-state.js), read via readDurableState(root),
// not from local disk. None of the four skill consumers ever called these
// (only their own recordAudit()/cursor-shape logic on top of cachePath/
// readCache/writeCache), so they were deleted rather than wired up — same
// migration as runs.js's recordRun/readRuns removal.
test('createCache exports only cachePath/readCache/writeCache — cursor and runs helpers were removed as dead code', () => {
  const core = createCache('some-skill');
  assert.deepStrictEqual(Object.keys(core).sort(), ['cachePath', 'readCache', 'writeCache']);
});
