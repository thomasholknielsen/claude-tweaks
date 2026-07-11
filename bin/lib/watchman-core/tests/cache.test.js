'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCache } = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'watchman-core-cache-')); }

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

test('cursorsPath is namespaced under .claude-tweaks/<skillName>/cursors.json', () => {
  const core = createCache('some-skill');
  const root = tmp();
  assert.strictEqual(core.cursorsPath(root), path.join(root, '.claude-tweaks', 'some-skill', 'cursors.json'));
});

test('readCursors returns {} when the cursors file does not exist', () => {
  const core = createCache('some-skill');
  assert.deepStrictEqual(core.readCursors(tmp()), {});
});

test('writeCursors then readCursors round-trips', () => {
  const core = createCache('some-skill');
  const root = tmp();
  const cursors = { 'target-a': { lastAuditedMs: 1000 } };
  core.writeCursors(root, cursors);
  assert.deepStrictEqual(core.readCursors(root), cursors);
});

test('two different skill names namespace to different directories under the same root', () => {
  const root = tmp();
  const a = createCache('skill-a');
  const b = createCache('skill-b');
  a.writeCache(root, { x: 1 });
  assert.deepStrictEqual(b.readCache(root), {});
});

test('runsDir is namespaced under .claude-tweaks/<skillName>/runs', () => {
  const core = createCache('some-skill');
  const root = tmp();
  assert.strictEqual(core.runsDir(root), path.join(root, '.claude-tweaks', 'some-skill', 'runs'));
});

test('readRuns returns [] when no run logs exist', () => {
  const core = createCache('some-skill');
  assert.deepStrictEqual(core.readRuns(tmp()), []);
});

test('readRuns reads back run records written directly to disk, sorted oldest first by runAt', () => {
  const core = createCache('some-skill');
  const root = tmp();
  fs.mkdirSync(core.runsDir(root), { recursive: true });
  fs.writeFileSync(path.join(core.runsDir(root), 'run-b.json'), JSON.stringify({ runId: 'run-b', runAt: '2026-01-02T00:00:00.000Z', fingerprints: ['x'] }));
  fs.writeFileSync(path.join(core.runsDir(root), 'run-a.json'), JSON.stringify({ runId: 'run-a', runAt: '2026-01-01T00:00:00.000Z', fingerprints: ['y'] }));
  const runs = core.readRuns(root);
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].runId, 'run-a');
  assert.strictEqual(runs[1].runId, 'run-b');
});

test('readRuns skips corrupt or malformed run files rather than throwing', () => {
  const core = createCache('some-skill');
  const root = tmp();
  fs.mkdirSync(core.runsDir(root), { recursive: true });
  fs.writeFileSync(path.join(core.runsDir(root), 'bad.json'), '{ not json');
  fs.writeFileSync(path.join(core.runsDir(root), 'no-runid.json'), JSON.stringify({ fingerprints: ['z'] }));
  assert.deepStrictEqual(core.readRuns(root), []);
});
